(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;
    var FEEDBACK_FUNCTIONS = ["LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP", "VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM"];
    var QUESTION_GROUPS = ["PAYMENT", "EXECUTION", "EDUCATION_PROGRAM", "LFO"];

    function FeedbackService(repositories, accessService, mutationRunner, configurationService) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
        this.configurationService = configurationService;
    }

    FeedbackService.prototype._admin = function () {
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "feedback-question" }).then(function (user) {
            if ($.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) < 0) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "Feedback Administration is unavailable."); }
            return user;
        });
    };

    FeedbackService.prototype.QueryQuestions = function (querySpec) {
        var self = this;
        return this._admin().then(function () { return self.repositories.surveyQuestions.query(querySpec || {}); });
    };

    FeedbackService.prototype.QueryVersions = function (querySpec) {
        var self = this;
        return this._admin().then(function () {
            var spec = $.extend(true, {}, querySpec || {});
            spec.filters = (spec.filters || []).concat([{ field: "GroupCode", op: "eq", value: "SURVEY_VERSION" }]);
            return self.repositories.configuration.query(spec);
        });
    };

    FeedbackService.prototype.GetGenerationOptions = function () {
        var self = this;
        return this._admin().then(function () {
            return $.when(
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "SURVEY_VERSION" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "SortOrder", direction: "ASC" }] }),
                H.queryAll(self.repositories.vendors, { filters: [{ field: "StageCode", op: "eq", value: "APPROVED" }, { field: "StatusCode", op: "eq", value: "APPROVED" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "DisplayName", direction: "ASC" }] })
            );
        }).then(function (versions, vendors) {
            return { functionCodes: VMS.Utilities.unique($.map(versions, function (version) { return version.TextValue; })), vendors: vendors };
        });
    };

    FeedbackService.prototype.CreateSurveyVersion = function (input, actionRequestId) {
        var functionCode = VMS.Utilities.trim(input.FunctionCode).toUpperCase();
        var versionCode = VMS.Utilities.trim(input.SurveyVersionCode).toUpperCase();
        var year = VMS.ClockService.riyadhYear();
        if ($.inArray(functionCode, FEEDBACK_FUNCTIONS) < 0 || !new RegExp("^" + functionCode + "_" + year + "_V[1-9][0-9]*$").test(versionCode)) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Survey Version Code must use the selected eligible Function, current Riyadh year, and positive version sequence.");
        }
        return this.configurationService.CreateOption({ GroupCode: "SURVEY_VERSION", ItemCode: versionCode, DisplayLabel: input.DisplayLabel, TextValue: functionCode, NumericValue: year, SortOrder: input.SortOrder, IsActive: false, Description: input.Description }, actionRequestId);
    };

    FeedbackService.prototype.CreateQuestion = function (input, actionRequestId) {
        var self = this;
        var actor;
        var code = VMS.Utilities.trim(input.QuestionCode).toUpperCase();
        var key = input.FunctionCode + "-" + input.SurveyVersionCode + "-" + code;
        var order = Number(input.DisplayOrder);
        var version;
        return this._admin().then(function (user) {
            actor = user;
            if ($.inArray(input.FunctionCode, FEEDBACK_FUNCTIONS) < 0 || $.inArray(input.QuestionGroupCode, QUESTION_GROUPS) < 0 || !/^[A-Z0-9_]+$/.test(code) || !VMS.Utilities.trim(input.QuestionText) || $.inArray(input.QuestionTypeCode, ["SCORE", "OPEN_TEXT"]) < 0 || !isFinite(order) || Math.floor(order) !== order || order <= 0 || (input.QuestionTypeCode === "SCORE" && input.ScoreScaleCode !== "VENDOR_FEEDBACK_SCALE") || (input.QuestionTypeCode === "OPEN_TEXT" && input.ScoreScaleCode)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid Feedback Question definition."); }
            return $.when(self.repositories.configuration.getByKey("SURVEY_VERSION-" + input.SurveyVersionCode), self.repositories.surveyQuestions.getByKey(key), H.queryAll(self.repositories.surveyQuestions, { filters: [{ field: "FunctionCode", op: "eq", value: input.FunctionCode }, { field: "SurveyVersionCode", op: "eq", value: input.SurveyVersionCode }, { field: "DisplayOrder", op: "eq", value: order }] }), self._versionUsed(input.FunctionCode, input.SurveyVersionCode));
        }).then(function (versionValue, duplicate, orderDuplicate, used) {
            version = versionValue;
            if (!version || version.GroupCode !== "SURVEY_VERSION" || version.TextValue !== input.FunctionCode) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select a Survey Version belonging to the selected Function."); }
            if (used) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "A used Survey Version's Question structure is immutable."); }
            if (duplicate || orderDuplicate.length) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Question Code and Display Order must be unique in the Survey Version."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_FEEDBACK_QUESTION_CREATE", entityTypeCode: "SURVEY_QUESTION", businessKey: key, countsAsCompletedAction: false, successMessage: "Feedback Question was created." }, function () {
                return self.repositories.surveyQuestions.create({ FunctionCode: input.FunctionCode, SurveyVersionCode: input.SurveyVersionCode, QuestionCode: code, QuestionGroupCode: input.QuestionGroupCode, QuestionText: VMS.Utilities.trim(input.QuestionText), QuestionTypeCode: input.QuestionTypeCode, ScoreScaleCode: input.QuestionTypeCode === "SCORE" ? input.ScoreScaleCode : "", DisplayOrder: order, IsActive: input.IsActive !== false, QuestionVersionKey: key, Notes: VMS.Utilities.trim(input.Notes) }, H.actorContext(actor));
            });
        });
    };

    FeedbackService.prototype._versionUsed = function (functionCode, versionCode) {
        return H.queryAll(this.repositories.feedbackAssignments, { filters: [{ field: "FunctionCode", op: "eq", value: functionCode }, { field: "SurveyVersionCode", op: "eq", value: versionCode }] }).then(function (rows) { return rows.length > 0; });
    };

    FeedbackService.prototype.UpdateQuestion = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._admin().then(function (user) { actor = user; return self.repositories.surveyQuestions.getById(id); }).then(function (value) { record = value; if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "Question is unavailable."); } if ($.inArray(input.QuestionGroupCode, QUESTION_GROUPS) < 0 || !VMS.Utilities.trim(input.QuestionText) || $.inArray(input.QuestionTypeCode, ["SCORE", "OPEN_TEXT"]) < 0 || !isFinite(Number(input.DisplayOrder)) || Math.floor(Number(input.DisplayOrder)) !== Number(input.DisplayOrder) || Number(input.DisplayOrder) <= 0 || (input.QuestionTypeCode === "SCORE" && input.ScoreScaleCode !== "VENDOR_FEEDBACK_SCALE") || (input.QuestionTypeCode === "OPEN_TEXT" && input.ScoreScaleCode)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid Feedback Question definition."); } return $.when(self._versionUsed(record.FunctionCode, record.SurveyVersionCode), H.queryAll(self.repositories.surveyQuestions, { filters: [{ field: "FunctionCode", op: "eq", value: record.FunctionCode }, { field: "SurveyVersionCode", op: "eq", value: record.SurveyVersionCode }, { field: "DisplayOrder", op: "eq", value: Number(input.DisplayOrder) }] })); }).then(function (used, orderRows) {
            if (used && (input.QuestionText !== record.QuestionText || input.QuestionGroupCode !== record.QuestionGroupCode || input.QuestionTypeCode !== record.QuestionTypeCode || input.ScoreScaleCode !== record.ScoreScaleCode || Number(input.DisplayOrder) !== Number(record.DisplayOrder))) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "A used Survey Version's Question structure is immutable."); }
            if ($.grep(orderRows, function (row) { return row.ID !== record.ID; }).length) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Display Order must be unique in the Survey Version."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_FEEDBACK_QUESTION_UPDATE", entityTypeCode: "SURVEY_QUESTION", entityItemId: id, businessKey: record.QuestionVersionKey, countsAsCompletedAction: false, successMessage: "Feedback Question was updated." }, function () { return self.repositories.surveyQuestions.update(id, { QuestionText: VMS.Utilities.trim(input.QuestionText), QuestionGroupCode: input.QuestionGroupCode, QuestionTypeCode: input.QuestionTypeCode, ScoreScaleCode: input.QuestionTypeCode === "SCORE" ? input.ScoreScaleCode : "", DisplayOrder: Number(input.DisplayOrder), Notes: VMS.Utilities.trim(input.Notes) }, expectedEtag || record._etag, H.actorContext(actor)); });
        });
    };

    FeedbackService.prototype.SetQuestionActive = function (id, expectedEtag, active, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._admin().then(function (user) { actor = user; return self.repositories.surveyQuestions.getById(id); }).then(function (value) { record = value; if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "Question is unavailable."); } return $.when(self._versionUsed(record.FunctionCode, record.SurveyVersionCode), H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "SURVEY_VERSION" }, { field: "ItemCode", op: "eq", value: record.SurveyVersionCode }, { field: "IsActive", op: "eq", value: true }] }), H.queryAll(self.repositories.surveyQuestions, { filters: [{ field: "FunctionCode", op: "eq", value: record.FunctionCode }, { field: "SurveyVersionCode", op: "eq", value: record.SurveyVersionCode }, { field: "IsActive", op: "eq", value: true }] })); }).then(function (used, activeVersions, activeQuestions) { var resulting; if (used) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Question membership is immutable after the Survey Version is used."); } resulting = $.grep(activeQuestions, function (row) { return row.ID !== record.ID; }); if (active && record.IsActive !== true) { resulting.push(record); } if (activeVersions.length && ($.grep(resulting, function (row) { return row.QuestionTypeCode === "SCORE"; }).length < 1 || $.grep(resulting, function (row) { return row.QuestionTypeCode === "OPEN_TEXT"; }).length !== 1)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An active Survey Version must retain at least one scored Question and exactly one Open Text Question."); } return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: active ? "ADMIN_FEEDBACK_QUESTION_REACTIVATE" : "ADMIN_FEEDBACK_QUESTION_DEACTIVATE", entityTypeCode: "SURVEY_QUESTION", entityItemId: id, businessKey: record.QuestionVersionKey, countsAsCompletedAction: false, successMessage: "Question activation was updated." }, function () { return self.repositories.surveyQuestions.update(id, { IsActive: active === true }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };

    FeedbackService.prototype.ActivateVersion = function (functionCode, versionCode, actionRequestId) {
        var self = this;
        var actor;
        var selected;
        var versions;
        var originalStates = [];
        return this._admin().then(function (user) { actor = user; if ($.inArray(functionCode, FEEDBACK_FUNCTIONS) < 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an eligible Feedback Function."); } return $.when(H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "SURVEY_VERSION" }, { field: "TextValue", op: "eq", value: functionCode }] }), H.queryAll(self.repositories.surveyQuestions, { filters: [{ field: "FunctionCode", op: "eq", value: functionCode }, { field: "SurveyVersionCode", op: "eq", value: versionCode }, { field: "IsActive", op: "eq", value: true }] }), H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "VENDOR_FEEDBACK_SCALE" }, { field: "IsActive", op: "eq", value: true }] })); }).then(function (versionRows, questions, scales) {
            var orders = {};
            versions = versionRows;
            selected = $.grep(versions, function (row) { return row.ItemCode === versionCode; })[0];
            $.each(questions, function (_, question) { orders[question.DisplayOrder] = (orders[question.DisplayOrder] || 0) + 1; });
            if (!selected || Number(selected.NumericValue) !== VMS.ClockService.riyadhYear() || $.grep(questions, function (row) { return row.QuestionTypeCode === "SCORE"; }).length < 1 || $.grep(questions, function (row) { return row.QuestionTypeCode === "OPEN_TEXT"; }).length !== 1 || $.grep(questions, function (row) { return orders[row.DisplayOrder] !== 1 || (row.QuestionTypeCode === "SCORE" && row.ScoreScaleCode !== "VENDOR_FEEDBACK_SCALE"); }).length || !scales.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Activation requires a current-year Version, valid unique ordering, an active score scale, at least one scored Question, and exactly one Open Text Question."); }
            originalStates = $.map(versions, function (version) { return { ID: version.ID, IsActive: version.IsActive, etag: version._etag }; });
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_FEEDBACK_VERSION_ACTIVATE", entityTypeCode: "CONFIG", entityItemId: selected.ID, businessKey: selected.ConfigKey, countsAsCompletedAction: false, successMessage: "Survey Version was activated." }, function () {
                var chain = $.Deferred().resolve().promise();
                $.each(versions, function (_, version) { if (version.IsActive !== (version.ID === selected.ID)) { chain = chain.then(function () { return self.repositories.configuration.update(version.ID, { IsActive: version.ID === selected.ID }, version._etag, H.actorContext(actor)); }); } });
                return chain.then(function () { return H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "SURVEY_VERSION" }, { field: "TextValue", op: "eq", value: functionCode }, { field: "IsActive", op: "eq", value: true }] }); }).then(function (activeVersions) { if (activeVersions.length !== 1 || activeVersions[0].ID !== selected.ID) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "Survey Version activation requires recovery before another attempt."); } return activeVersions[0]; }, function (error) {
                    var restore = $.Deferred().resolve().promise();
                    $.each(originalStates, function (_, state) { restore = restore.then(function () { return self.repositories.configuration.getById(state.ID).then(function (current) { if (current && current.IsActive !== state.IsActive) { return self.repositories.configuration.update(state.ID, { IsActive: state.IsActive }, current._etag, H.actorContext(actor)); } }); }); });
                    return restore.then(function () { return $.Deferred().reject(error).promise(); }, function () { return H.reject(VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN, "Survey Version activation could not be compensated safely."); });
                });
            });
        });
    };

    FeedbackService.prototype._snapshot = function (functionCode, versionCode) {
        var self = this;
        return $.when(H.queryAll(this.repositories.surveyQuestions, { filters: [{ field: "FunctionCode", op: "eq", value: functionCode }, { field: "SurveyVersionCode", op: "eq", value: versionCode }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "DisplayOrder", direction: "ASC" }] }), H.queryAll(this.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "VENDOR_FEEDBACK_SCALE" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "SortOrder", direction: "ASC" }] })).then(function (questions, scales) {
            var snapshot = { schemaVersion: 1, functionCode: functionCode, surveyVersionCode: versionCode, questions: [] };
            var maximum = 0;
            $.each(questions, function (_, question) {
                var item = { questionCode: question.QuestionCode, questionText: question.QuestionText, questionGroupCode: question.QuestionGroupCode, questionGroupLabel: question.QuestionGroupCode, questionTypeCode: question.QuestionTypeCode, displayOrder: question.DisplayOrder, scoreScaleCode: question.ScoreScaleCode, scaleOptions: [] };
                if (question.QuestionTypeCode === "SCORE") {
                    $.each(scales, function (_, scale) { item.scaleOptions.push({ itemCode: scale.ItemCode, displayLabel: scale.DisplayLabel, numericValue: Number(scale.NumericValue) }); });
                    item.maximumNumericValue = Math.max.apply(Math, $.map(item.scaleOptions, function (scale) { return scale.numericValue; }));
                    maximum += item.maximumNumericValue;
                }
                snapshot.questions.push(item);
            });
            return { snapshot: snapshot, maximum: maximum };
        });
    };

    FeedbackService.prototype.GenerateAssignments = function (functionCode, vendorIds, actionRequestId) {
        var self = this;
        var actor;
        var version;
        var snapshot;
        var users;
        var vendors;
        var existing;
        var plan = [];
        var year = VMS.ClockService.riyadhYear();
        var requestedVendorIds = VMS.Utilities.unique($.map(vendorIds || [], function (id) { return Number(id); }));
        if ($.inArray(functionCode, FEEDBACK_FUNCTIONS) < 0 || !requestedVendorIds.length || requestedVendorIds.length !== (vendorIds || []).length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select one eligible Function and one or more distinct approved Vendors."); }
        return this._admin().then(function (user) { actor = user; return H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "SURVEY_VERSION" }, { field: "TextValue", op: "eq", value: functionCode }, { field: "NumericValue", op: "eq", value: year }, { field: "IsActive", op: "eq", value: true }] }); }).then(function (versions) {
            if (versions.length !== 1) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "Exactly one active Survey Version is required for the Function."); }
            version = versions[0];
            return $.when(self._snapshot(functionCode, version.ItemCode), H.queryAll(self.repositories.users, { filters: [{ field: "FunctionCode", op: "eq", value: functionCode }, { field: "RoleCode", op: "in", value: ["MANAGER", "EMPLOYEE", "CO_OP"] }, { field: "IsActive", op: "eq", value: true }] }), H.queryAll(self.repositories.vendors, { filters: [{ field: "ID", op: "in", value: requestedVendorIds }, { field: "StageCode", op: "eq", value: "APPROVED" }, { field: "StatusCode", op: "eq", value: "APPROVED" }, { field: "IsActive", op: "eq", value: true }] }), H.queryAll(self.repositories.feedbackAssignments, { filters: [{ field: "FunctionCode", op: "eq", value: functionCode }, { field: "AssignmentYear", op: "eq", value: year }] }));
        }).then(function (snapshotValue, userRows, vendorRows, existingRows) {
            snapshot = snapshotValue;
            users = userRows;
            vendors = vendorRows;
            if (vendors.length !== requestedVendorIds.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Every selected Vendor must remain active and approved."); }
            existing = {};
            $.each(existingRows, function (_, row) { existing[row.FeedbackAssignmentKey] = true; });
            $.each(vendors, function (_, vendor) { $.each(users, function (_, user) { var key = user.UserKey + "-" + vendor.VendorCode + "-" + functionCode + "-" + year; if (!existing[key]) { plan.push({ key: key, vendor: vendor, user: user }); } }); });
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_FEEDBACK_ASSIGNMENTS_GENERATE", entityTypeCode: "FEEDBACK_ASSIGNMENT", businessKey: functionCode + "-" + year, affectedItemIds: [], recoveryContext: { keys: $.map(plan, function (item) { return item.key; }) }, countsAsCompletedAction: false, successMessage: "Feedback assignments were generated." }, function () {
                var chain = $.Deferred().resolve().promise();
                var created = [];
                $.each(plan, function (_, item) { chain = chain.then(function () { return self.repositories.feedbackAssignments.create({ FeedbackAssignmentKey: item.key, Vendor: { id: item.vendor.ID, title: item.vendor.DisplayName }, VendorCodeSnapshot: item.vendor.VendorCode, VendorNameSnapshot: item.vendor.VendorName, AssignedUser: { id: item.user.ID, title: item.user.UserName }, AssignedUserName: item.user.UserName, AssignedUserEmail: item.user.Email, FunctionCode: functionCode, AssignmentYear: year, SurveyVersionCode: version.ItemCode, QuestionSetSnapshotJSON: JSON.stringify(snapshot.snapshot), AssignmentStatusCode: "OPEN", AssignmentDate: VMS.ClockService.utcNow(), CompletedDate: null, AnswerPayload: null, TotalScore: null, OverallScore: null, MaximumPossibleScore: snapshot.maximum, IsActive: true }, H.actorContext(actor)).then(function (row) { created.push(row); }); }); });
                return chain.then(function () { var expectedKeys = $.map(plan, function (item) { return item.key; }); if (!expectedKeys.length) { return []; } return H.queryAll(self.repositories.feedbackAssignments, { filters: [{ field: "FeedbackAssignmentKey", op: "in", value: expectedKeys }] }); }).then(function (verified) { if (verified.length !== plan.length) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "Feedback assignment generation requires recovery before another attempt."); } return { ID: created.length ? created[0].ID : 0, createdCount: created.length, skippedCount: users.length * vendors.length - created.length, affectedItemIds: $.map(created, function (row) { return row.ID; }), createdAssignments: created }; }, function (error) { return created.length ? H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "Feedback assignment generation requires recovery before another attempt.") : $.Deferred().reject(error).promise(); });
            }, function (result) {
                var assignments = result.createdAssignments || [];
                delete result.createdAssignments;
                return result.createdCount ? { eventCode: "FEEDBACK_ASSIGNMENTS_GENERATED", context: { assignments: assignments } } : null;
            });
        });
    };

    FeedbackService.prototype.QueryAssignmentMetadata = function (querySpec) {
        var self = this;
        return this._admin().then(function () { return self.repositories.feedbackAssignments.query($.extend(true, {}, querySpec || {}, { select: ["ID", "VendorCodeSnapshot", "VendorNameSnapshot", "AssignedUserName", "AssignedUserEmail", "FunctionCode", "AssignmentYear", "SurveyVersionCode", "AssignmentStatusCode", "AssignmentDate", "CompletedDate", "IsActive", "_etag"] })); });
    };

    FeedbackService.prototype.SetAssignmentActive = function (id, expectedEtag, active, reason, actionRequestId) {
        var self = this;
        var actor;
        var record;
        if (!VMS.Utilities.trim(reason)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An administrative reason is required."); }
        return this._admin().then(function (user) { actor = user; return self.repositories.feedbackAssignments.getById(id, ["ID", "FeedbackAssignmentKey", "AssignedUserEmail", "FunctionCode", "AssignmentStatusCode", "IsActive", "_etag"]); }).then(function (value) { record = value; if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "Assignment is unavailable."); } if (active) { return self.repositories.users.getByKey(record.AssignedUserEmail).then(function (user) { if (!user || user.IsActive !== true || user.FunctionCode !== record.FunctionCode || $.inArray(user.RoleCode, ["MANAGER", "EMPLOYEE", "CO_OP"]) < 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The assigned user is no longer eligible for this Function."); } }); } }).then(function () { return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: active ? "ADMIN_FEEDBACK_ASSIGNMENT_REACTIVATE" : "ADMIN_FEEDBACK_ASSIGNMENT_DEACTIVATE", entityTypeCode: "FEEDBACK_ASSIGNMENT", entityItemId: id, businessKey: record.FeedbackAssignmentKey, comment: reason, countsAsCompletedAction: false, successMessage: "Feedback assignment activation was updated." }, function () { return self.repositories.feedbackAssignments.update(id, { IsActive: active === true }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };

    FeedbackService.prototype.QueryOwnAssignments = function (querySpec) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.FEEDBACK_ASSIGNMENTS).then(function () { return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.FEEDBACK_ASSIGNMENT, "OWN"); }).then(function (context) { return self.repositories.feedbackAssignments.query($.extend(true, {}, querySpec || {}, { authorizationScope: context.scope, select: ["ID", "VendorCodeSnapshot", "VendorNameSnapshot", "FunctionCode", "AssignmentYear", "SurveyVersionCode", "AssignmentStatusCode", "AssignmentDate", "CompletedDate", "IsActive", "_etag"] })); });
    };

    FeedbackService.prototype.GetOwnAssignment = function (id, deepLinkKey) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.FEEDBACK_FORM).then(function () { return self.repositories.feedbackAssignments.getById(id); }).then(function (record) { return H.verifyDeepLink(record, id, deepLinkKey, "FDB-" + id); }).then(function (record) { return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.FEEDBACK_ASSIGNMENT, record, "READ"); }).then(function (value) { return value.record; });
    };

    FeedbackService.prototype.SubmitOwn = function (id, deepLinkKey, expectedEtag, submittedAnswers, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var snapshot;
        var byCode = {};
        var seen = {};
        var scored = [];
        var open = null;
        var errors = [];
        return this.GetOwnAssignment(id, deepLinkKey).then(function (value) { record = value; return self.accessService.ResolveCurrentUser(); }).then(function (user) {
            actor = user;
            if (!self.accessService.CanPerform(user, "FEEDBACK_SUBMIT", record) || record.FunctionCode !== user.FunctionCode) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "This Feedback assignment is not actionable."); }
            snapshot = JSON.parse(record.QuestionSetSnapshotJSON);
            $.each(snapshot.questions, function (_, question) { byCode[question.questionCode || question.code] = question; });
            $.each(submittedAnswers || [], function (_, answer) {
                var question = byCode[answer.questionCode];
                var option;
                if (!question || seen[answer.questionCode]) { errors.push(VMS.ValidationService.error("answers", "INVALID_ANSWER", "The submitted answers do not match this assignment.")); return; }
                seen[answer.questionCode] = true;
                if ((question.questionTypeCode || question.type) === "SCORE") {
                    option = $.grep(question.scaleOptions || question.scale || [], function (scale) { return (scale.itemCode || scale.code) === answer.scaleCode; })[0];
                    if (!option) { errors.push(VMS.ValidationService.error("answers", "INVALID_SCALE", "Select one allowed score for every scored Question.")); return; }
                    scored.push({ questionCode: question.questionCode || question.code, questionTextSnapshot: question.questionText || question.text, questionGroupCode: question.questionGroupCode || question.group, questionGroupLabelSnapshot: question.questionGroupLabel || question.group, displayOrder: question.displayOrder || 0, scaleCode: option.itemCode || option.code, scaleLabelSnapshot: option.displayLabel || option.label, numericValue: Number(option.numericValue !== undefined ? option.numericValue : option.value), maximumNumericValue: Number(question.maximumNumericValue || Math.max.apply(Math, $.map(question.scaleOptions || question.scale || [], function (scale) { return Number(scale.numericValue !== undefined ? scale.numericValue : scale.value); }))) });
                } else if (VMS.Utilities.trim(answer.textValue)) { open = { questionCode: question.questionCode || question.code, questionTextSnapshot: question.questionText || question.text, displayOrder: question.displayOrder || 0, textValue: VMS.Utilities.trim(answer.textValue) }; }
            });
            $.each(snapshot.questions, function (_, question) { var code = question.questionCode || question.code; if ((question.questionTypeCode || question.type) === "SCORE" && !seen[code]) { errors.push(VMS.ValidationService.error(code, "REQUIRED", "Answer every scored Question.")); } });
            if (errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the Feedback answers.", errors); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "FEEDBACK_SUBMIT", entityTypeCode: "FEEDBACK", entityItemId: id, businessKey: "FDB-" + id, fromStageCode: "OPEN", fromStatusCode: "OPEN", toStageCode: "SUBMITTED", toStatusCode: "SUBMITTED", successMessage: "Feedback was submitted." }, function () {
                var total = 0;
                $.each(scored, function (_, answer) { total += Number(answer.numericValue); });
                return self.repositories.feedbackAssignments.update(id, { AssignmentStatusCode: "SUBMITTED", CompletedDate: VMS.ClockService.utcNow(), AnswerPayload: JSON.stringify({ schemaVersion: 1, surveyVersionCode: record.SurveyVersionCode, functionCode: record.FunctionCode, assignmentYear: record.AssignmentYear, scoredAnswers: scored, openText: open }), TotalScore: total, OverallScore: total / scored.length }, expectedEtag || record._etag, H.actorContext(actor));
            }, function (updated) {
                return { eventCode: "FEEDBACK_SUBMITTED", context: { record: updated } };
            });
        });
    };

    FeedbackService.prototype.GetVendorAggregateYears = function (vendorId) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.VENDOR_PROFILE).then(function () { return self.repositories.vendors.getById(vendorId); }).then(function (vendor) { return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, vendor, "READ").then(function () { return vendor; }); }).then(function (vendor) {
            return H.queryAll(self.repositories.feedbackAssignments, { filters: [{ field: "Vendor.id", op: "eq", value: vendor.ID }, { field: "AssignmentStatusCode", op: "eq", value: "SUBMITTED" }, { field: "IsActive", op: "eq", value: true }], select: ["AssignmentYear"] }).then(function (rows) {
                var years = {};
                $.each(rows, function (_, row) { if (isFinite(Number(row.AssignmentYear))) { years[Number(row.AssignmentYear)] = true; } });
                return $.map(Object.keys(years).sort(function (left, right) { return Number(right) - Number(left); }), Number);
            });
        });
    };

    FeedbackService.prototype.GetVendorAggregate = function (vendorId, year) {
        var self = this;
        var requestedYear = Number(year);
        var currentYear = VMS.ClockService.riyadhYear();
        if (!isFinite(requestedYear) || Math.floor(requestedYear) !== requestedYear) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The selected Assignment Year is invalid."); }
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.VENDOR_PROFILE).then(function () { return self.repositories.vendors.getById(vendorId); }).then(function (vendor) { return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, vendor, "READ").then(function () { return vendor; }); }).then(function (vendor) {
            return self.repositories.feedbackAssignments.count({ filters: [{ field: "Vendor.id", op: "eq", value: vendor.ID }, { field: "AssignmentYear", op: "eq", value: requestedYear }, { field: "AssignmentStatusCode", op: "eq", value: "SUBMITTED" }, { field: "IsActive", op: "eq", value: true }] }).then(function (count) {
                if (requestedYear !== currentYear && count <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The selected Assignment Year has no authorized submitted aggregate data."); }
                return vendor;
            });
        }).then(function (vendor) {
            return H.queryAll(self.repositories.feedbackAssignments, { filters: [{ field: "Vendor.id", op: "eq", value: vendor.ID }, { field: "AssignmentYear", op: "eq", value: requestedYear }, { field: "AssignmentStatusCode", op: "eq", value: "SUBMITTED" }, { field: "IsActive", op: "eq", value: true }] }).then(function (rows) {
                var groups = { PAYMENT: [], EXECUTION: [], EDUCATION_PROGRAM: [], LFO: [] };
                var all = [];
                var latest = null;
                $.each(rows, function (_, row) {
                    var payload;
                    var snapshot;
                    var questionMap = {};
                    try { payload = JSON.parse(row.AnswerPayload); snapshot = row.QuestionSetSnapshotJSON ? JSON.parse(row.QuestionSetSnapshotJSON) : { questions: [] }; }
                    catch (error) { throw { code: VMS.Constants.ERRORS.CONFIGURATION_INVALID, safeMessage: "A submitted Feedback snapshot is invalid and cannot be aggregated." }; }
                    $.each(snapshot.questions || [], function (_, question) { questionMap[question.questionCode || question.code] = question; });
                    $.each(payload.scoredAnswers || payload.answers || [], function (_, answer) {
                        var question = questionMap[answer.questionCode] || {};
                        var maximum = Number(answer.maximumNumericValue || question.maximumNumericValue || 5);
                        var groupCode = answer.questionGroupCode || question.questionGroupCode || question.group;
                        var normalized;
                        if (!answer.numericValue || !maximum) { return; }
                        normalized = Number(answer.numericValue) / maximum * 100;
                        all.push(normalized);
                        if (groups[groupCode]) { groups[groupCode].push(normalized); }
                    });
                    if (!latest || row.CompletedDate > latest) { latest = row.CompletedDate; }
                });
                var aggregate = function (values) { var sum = 0; if (!values.length) { return null; } $.each(values, function (_, value) { sum += value; }); return VMS.Utilities.roundHalfAwayFromZero(sum / values.length, 1); };
                return { vendorId: vendor.ID, vendorCode: vendor.VendorCode, vendorName: vendor.VendorName, assignmentYear: requestedYear, overall: aggregate(all), groups: { PAYMENT: aggregate(groups.PAYMENT), EXECUTION: aggregate(groups.EXECUTION), EDUCATION_PROGRAM: aggregate(groups.EDUCATION_PROGRAM), LFO: aggregate(groups.LFO) }, contributingAssignmentCount: rows.length, latestSubmissionDate: latest };
            });
        });
    };

    VMS.FeedbackService = FeedbackService;
}(window, window.jQuery));
