(function (VMS, $) {
    'use strict';

    var eligibleFunctions = ['LFO_COMMERCIAL', 'LFO_MANUFACTURING', 'LFO_LEADERSHIP', 'VENDOR_MANAGEMENT', 'EXECUTION', 'EDUCATION_PROGRAM'];
    var eligibleRoles = ['MANAGER', 'EMPLOYEE', 'CO_OP'];
    var scaleGroup = 'VENDOR_FEEDBACK_SCALE';

    function currentUser() { return VMS.Services.AccessService.GetCurrentUser(); }
    function isAdmin() { var actor = currentUser(); return actor && $.inArray(actor.RoleCode, ['ADMIN', 'SUPER_ADMIN']) >= 0; }
    function eligible(user, functionCode) { return !!(user && user.IsActive && $.inArray(user.RoleCode, eligibleRoles) >= 0 && $.inArray(user.FunctionCode, eligibleFunctions) >= 0 && (!functionCode || user.FunctionCode === functionCode)); }
    function denied(message) { return VMS.Utilities.resolved(VMS.Utilities.failure('ACCESS_DENIED', message || 'Feedback administration is not authorized.')); }
    function invalid(message, fields) { return VMS.Utilities.failure('VALIDATION_FAILED', message, fields || []); }
    function stale(saved, message) { return saved && saved.error ? VMS.Utilities.failure('STALE_RECORD', message || 'The Feedback record changed. Refresh before continuing.') : VMS.Utilities.success(saved); }
    function versionKey(code) { return 'SURVEY_VERSION-' + code; }
    function riyadhYear() { var date = VMS.Services.ClockService.Now(); return new Date(date.getTime() + 10800000).getUTCFullYear(); }
    function safeMean(values) { var total = 0; if (!values || !values.length) { return null; } $.each(values, function (_, value) { total += Number(value); }); return VMS.Utilities.roundHalfAway(total / values.length, 1); }
    function normalizedOwner(row, actor) { return !!(row && actor && VMS.Utilities.lookupId(row.AssignedUser) === Number(actor.ID) && VMS.Utilities.normalize(row.AssignedUserEmail) === actor.UserKey); }
    function actionable(row, actor) { return normalizedOwner(row, actor) && eligible(actor, row.FunctionCode) && row.IsActive === true && row.AssignmentStatusCode === 'OPEN'; }
    function questionGroupKey(code) { return 'QUESTION_GROUP-' + $.trim(code || '').toUpperCase(); }
    function activeQuestionGroups() { return VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'ConfigurationType', operator: 'eq', value: 'OPTION' }, { field: 'GroupCode', operator: 'eq', value: 'QUESTION_GROUP' }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'SortOrder', direction: 'asc' }, { field: 'ID', direction: 'asc' }], pageSize: 100 }); }
    function activeQuestions(versionCode) { return VMS.Repositories.SurveyQuestionRepository.query({ filters: [{ field: 'SurveyVersionCode', operator: 'eq', value: versionCode }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'DisplayOrder', direction: 'asc' }, { field: 'ID', direction: 'asc' }], pageSize: 1000 }); }
    function allQuestions(versionCode) { return VMS.Repositories.SurveyQuestionRepository.query({ filters: [{ field: 'SurveyVersionCode', operator: 'eq', value: versionCode }], sort: [{ field: 'DisplayOrder', direction: 'asc' }, { field: 'ID', direction: 'asc' }], pageSize: 1000 }); }
    function activeScales() { return VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'GroupCode', operator: 'eq', value: scaleGroup }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'SortOrder', direction: 'asc' }, { field: 'ID', direction: 'asc' }], pageSize: 100 }); }
    function validateStructure(version, items, groupOptions) {
        var scoreCount = 0, textCount = 0, orders = {}, invalidOrder = false, invalidGroup = false, invalidScale = false;
        var groups = {}; $.each(groupOptions || [], function (_, option) { groups[option.ItemCode] = option; });
        $.each(items || [], function (_, question) {
            if (!question.IsActive) { return; }
            if (Number(question.DisplayOrder) < 1 || orders[question.DisplayOrder]) { invalidOrder = true; }
            orders[question.DisplayOrder] = true;
            invalidGroup = invalidGroup || !groups[question.QuestionGroupCode];
            if (question.QuestionTypeCode === 'SCORE') { scoreCount += 1; invalidScale = invalidScale || question.ScoreScaleCode !== scaleGroup; }
            else if (question.QuestionTypeCode === 'OPEN_TEXT') { textCount += 1; invalidScale = invalidScale || !!question.ScoreScaleCode; }
            else { invalidScale = true; }
        });
        return scoreCount >= 1 && textCount === 1 && !invalidOrder && !invalidGroup && !invalidScale;
    }
    function safeAssignment(row) {
        return { ID: row.ID, FeedbackAssignmentKey: row.FeedbackAssignmentKey, Vendor: row.Vendor, VendorCodeSnapshot: row.VendorCodeSnapshot, VendorNameSnapshot: row.VendorNameSnapshot, FunctionCode: row.FunctionCode, AssignmentYear: row.AssignmentYear, SurveyVersionCode: row.SurveyVersionCode, AssignmentStatusCode: row.AssignmentStatusCode, AssignmentDate: row.AssignmentDate, CompletedDate: row.CompletedDate, IsActive: row.IsActive, _etag: row._etag, Actionable: actionable(row, currentUser()), DeepLinkKey: 'FDB-' + row.ID };
    }
    function safeAdminAssignment(row) {
        return { ID: row.ID, FeedbackAssignmentKey: row.FeedbackAssignmentKey, Vendor: row.Vendor, VendorCodeSnapshot: row.VendorCodeSnapshot, VendorNameSnapshot: row.VendorNameSnapshot, AssignedUser: row.AssignedUser, AssignedUserName: row.AssignedUserName, AssignedUserEmail: row.AssignedUserEmail, FunctionCode: row.FunctionCode, AssignmentYear: row.AssignmentYear, SurveyVersionCode: row.SurveyVersionCode, AssignmentStatusCode: row.AssignmentStatusCode, AssignmentDate: row.AssignmentDate, CompletedDate: row.CompletedDate, IsActive: row.IsActive, _etag: row._etag };
    }
    function buildSnapshot(version, questionRows, scales, assigned, vendor, year) {
        var maximum = 0, scaleItems = $.map(scales, function (scale) { return { itemCode: scale.ItemCode, displayLabel: scale.DisplayLabel, numericValue: Number(scale.NumericValue), sortOrder: Number(scale.SortOrder) }; });
        var questions = $.map(questionRows, function (question) {
            var items = question.QuestionTypeCode === 'SCORE' ? VMS.Utilities.clone(scaleItems) : [];
            if (question.QuestionTypeCode === 'SCORE') { var maximumValue = 0; $.each(items, function (_, item) { maximumValue = Math.max(maximumValue, item.numericValue); }); maximum += maximumValue; }
            return { questionCode: question.QuestionCode, questionText: question.QuestionText, questionGroupCode: question.QuestionGroupCode, questionGroupLabel: VMS.Services.DisplayLabelService.Resolve(question.QuestionGroupCode, 'QUESTION_GROUP'), questionTypeCode: question.QuestionTypeCode, scoreScaleCode: question.ScoreScaleCode || null, displayOrder: Number(question.DisplayOrder), scaleItems: items };
        });
        var assignmentDate = VMS.Services.ClockService.Now().toISOString();
        return { schemaVersion: 1, generatedAt: assignmentDate, assignmentDate: assignmentDate, assignmentYear: year, functionSnapshot: { functionCode: version.TextValue, displayLabel: VMS.Services.DisplayLabelService.Resolve(version.TextValue, 'FUNCTION') }, surveyVersionSnapshot: { surveyVersionCode: version.ItemCode, surveyName: version.DisplayLabel, versionNumber: Number(version.SortOrder), year: Number(version.NumericValue) }, assignedUserSnapshot: { userId: assigned.ID, userKey: assigned.UserKey, userName: assigned.UserName, email: assigned.Email, roleCode: assigned.RoleCode, functionCode: assigned.FunctionCode }, vendorSnapshot: { vendorId: vendor.ID, vendorCode: vendor.VendorCode, vendorName: vendor.VendorName }, questions: questions, maximumPossibleScore: maximum };
    }
    function parseJSON(value) { try { return JSON.parse(value); } catch (ignore) { return null; } }
    function validSnapshot(contract) {
        var score = 0, text = 0, codes = {}, orders = {}, valid = !!(contract && contract.schemaVersion === 1 && contract.assignedUserSnapshot && contract.vendorSnapshot && contract.functionSnapshot && contract.surveyVersionSnapshot && contract.assignmentDate && Number(contract.assignmentYear) > 0 && Number(contract.maximumPossibleScore) > 0 && $.isArray(contract.questions));
        if (!valid) { return false; }
        $.each(contract.questions, function (_, question) {
            if (!question.questionCode || codes[question.questionCode] || !question.questionText || !question.questionGroupCode || !question.questionGroupLabel || !Number(question.displayOrder) || orders[question.displayOrder]) { valid = false; return; }
            codes[question.questionCode] = true; orders[question.displayOrder] = true;
            if (question.questionTypeCode === 'SCORE') { score += 1; if (!question.scoreScaleCode || !$.isArray(question.scaleItems) || !question.scaleItems.length) { valid = false; } $.each(question.scaleItems || [], function (__, item) { if (!item.itemCode || !item.displayLabel || !isFinite(Number(item.numericValue))) { valid = false; } }); }
            else if (question.questionTypeCode === 'OPEN_TEXT') { text += 1; if (question.scoreScaleCode || (question.scaleItems && question.scaleItems.length)) { valid = false; } }
            else { valid = false; }
        });
        return valid && score >= 1 && text === 1;
    }
    function versionByFunction(functionCode) { return VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'GroupCode', operator: 'eq', value: 'SURVEY_VERSION' }, { field: 'TextValue', operator: 'eq', value: functionCode }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 10 }); }
    function action(context, work, notification) { return VMS.Services.BusinessActionService.Execute(context, work, notification); }
    function sequential(items, worker) { var d = $.Deferred(), index = 0, output = []; function next() { if (index >= items.length) { d.resolve(output); return; } worker(items[index], index).then(function (value) { output.push(value); index += 1; next(); }, function () { output.push(null); index += 1; next(); }); } next(); return d.promise(); }
    function questionValidation(model, groupOption, allowInactiveExisting) {
        var code = $.trim(model.QuestionCode || '').toUpperCase(), type = model.QuestionTypeCode, group = model.QuestionGroupCode, fields = [];
        if (!/^[A-Z][A-Z0-9_]*$/.test(code)) { fields.push({ field: 'QuestionCode', code: 'VALIDATION_FAILED', message: 'Question Code must use uppercase letters, numbers, or underscores.' }); }
        if (!$.trim(model.QuestionText || '')) { fields.push({ field: 'QuestionText', code: 'VALIDATION_FAILED', message: 'Question Text is required.' }); }
        if ($.inArray(type, ['SCORE', 'OPEN_TEXT']) < 0) { fields.push({ field: 'QuestionTypeCode', code: 'VALIDATION_FAILED', message: 'Question Type is invalid.' }); }
        if (!groupOption || groupOption.ConfigurationType !== 'OPTION' || groupOption.GroupCode !== 'QUESTION_GROUP' || groupOption.ItemCode !== group || (!groupOption.IsActive && !allowInactiveExisting)) { fields.push({ field: 'QuestionGroupCode', code: 'VALIDATION_FAILED', message: 'Select a valid active configured Question Group.' }); }
        if (!Number(model.DisplayOrder) || Number(model.DisplayOrder) < 1 || Math.floor(Number(model.DisplayOrder)) !== Number(model.DisplayOrder)) { fields.push({ field: 'DisplayOrder', code: 'VALIDATION_FAILED', message: 'Display Order must be a positive integer.' }); }
        if (type === 'SCORE' && model.ScoreScaleCode && model.ScoreScaleCode !== scaleGroup) { fields.push({ field: 'ScoreScaleCode', code: 'VALIDATION_FAILED', message: 'Score questions must use the approved Feedback scale.' }); }
        if (type === 'OPEN_TEXT' && model.ScoreScaleCode) { fields.push({ field: 'ScoreScaleCode', code: 'VALIDATION_FAILED', message: 'Open Text questions cannot have a score scale.' }); }
        return { code: code, fields: fields };
    }
    function replaySubmission(actionRequestId, id, actor) {
        if (!actionRequestId) { return VMS.Utilities.resolved(null); }
        return VMS.Services.AuditService.GetByActionRequestId(actionRequestId).then(function (history) {
            var recovered;
            if (!history) { return null; }
            if (history.ActionCode !== 'SUBMIT_FEEDBACK' || history.EntityTypeCode !== 'FEEDBACK_ASSIGNMENT' || Number(history.EntityItemID) !== Number(id) || history.PerformedByUserKeySnapshot !== actor.UserKey) { return VMS.Utilities.failure('ACCESS_DENIED', 'The action request is not authorized for this submission.'); }
            if (history.ResultCode === 'SUCCESS') { recovered = parseJSON(history.RecoveryContextJSON || '{}'); return VMS.Utilities.success(recovered && recovered.result); }
            if (history.ResultCode === 'PREPARED') { return VMS.Utilities.failure('ACTION_OUTCOME_UNCERTAIN', 'The Feedback submission outcome requires verification.'); }
            return VMS.Utilities.failure('UNSUPPORTED_OPERATION', 'This action request is already finalized.');
        });
    }

    VMS.Services.FeedbackService = {
        IsEligibleUser: function (candidate, functionCode) { return eligible(candidate, functionCode); },
        IsActionable: function (row) { return actionable(row, currentUser()); },

        CreateSurveyVersion: function (model) {
            if (!isAdmin()) { return denied(); }
            model = model || {};
            var functionCode = model.FunctionCode, year = Number(model.Year), versionNumber = Number(model.VersionNumber), surveyName = $.trim(model.SurveyName || ''), code, fields = [];
            if ($.inArray(functionCode, eligibleFunctions) < 0) { fields.push({ field: 'FunctionCode', code: 'VALIDATION_FAILED', message: 'Function is not eligible for Feedback.' }); }
            if (year < 2000 || Math.floor(year) !== year) { fields.push({ field: 'Year', code: 'VALIDATION_FAILED', message: 'Year is invalid.' }); }
            if (versionNumber < 1 || Math.floor(versionNumber) !== versionNumber) { fields.push({ field: 'VersionNumber', code: 'VALIDATION_FAILED', message: 'Version Number must be positive.' }); }
            if (!surveyName) { fields.push({ field: 'SurveyName', code: 'VALIDATION_FAILED', message: 'Survey Name is required.' }); }
            if (fields.length) { return VMS.Utilities.resolved(invalid('Survey Version details are invalid.', fields)); }
            code = functionCode + '_' + year + '_V' + versionNumber;
            return VMS.Repositories.ConfigurationRepository.getByKey(versionKey(code)).then(function (existing) {
                if (existing) { return VMS.Utilities.failure('DUPLICATE_KEY', 'Survey Version already exists.'); }
                return action({ entityType: 'SURVEY_VERSION', businessKey: code, actionCode: 'CREATE_SURVEY_VERSION', countsAsCompletedAction: false }, function () { return VMS.Repositories.ConfigurationRepository.create({ ConfigurationType: 'OPTION', GroupCode: 'SURVEY_VERSION', ItemCode: code, DisplayLabel: surveyName, TextValue: functionCode, NumericValue: year, SortOrder: versionNumber, IsActive: false, IsLocked: true, Description: 'Version ' + versionNumber, ConfigKey: versionKey(code) }).then(function (saved) { return VMS.Utilities.success(saved); }); });
            });
        },

        CreateQuestion: function (model) {
            if (!isAdmin()) { return denied(); }
            model = $.extend({}, model || {});
            return $.when(VMS.Repositories.ConfigurationRepository.getByKey(versionKey(model.SurveyVersionCode)), VMS.Repositories.ConfigurationRepository.getByKey(questionGroupKey(model.QuestionGroupCode))).then(function (version, groupOption) {
                var checked;
                if (!version) { return invalid('Survey Version was not found.', [{ field: 'SurveyVersionCode', code: 'VALIDATION_FAILED', message: 'Survey Version is required.' }]); }
                checked = questionValidation(model, groupOption, false);
                if (checked.fields.length) { return invalid('Question details are invalid.', checked.fields); }
                return $.when(VMS.Repositories.SurveyQuestionRepository.getByKey(version.TextValue + '-' + version.ItemCode + '-' + checked.code), allQuestions(version.ItemCode)).then(function (existing, data) {
                    var duplicateOrder = false;
                    $.each(data.items, function (_, row) { duplicateOrder = duplicateOrder || Number(row.DisplayOrder) === Number(model.DisplayOrder); });
                    if (existing) { return VMS.Utilities.failure('DUPLICATE_KEY', 'Question Code already exists in this Function and version.'); }
                    if (duplicateOrder) { return invalid('Display Order must be unique within the survey version.', [{ field: 'DisplayOrder', code: 'VALIDATION_FAILED', message: 'Display Order is already used.' }]); }
                    model.FunctionCode = version.TextValue; model.QuestionCode = checked.code; model.ScoreScaleCode = model.QuestionTypeCode === 'SCORE' ? scaleGroup : null; model.QuestionVersionKey = model.FunctionCode + '-' + model.SurveyVersionCode + '-' + checked.code; model.DisplayOrder = Number(model.DisplayOrder); model.IsActive = model.IsActive !== false;
                    return action({ entityType: 'SURVEY_QUESTION', businessKey: model.QuestionVersionKey, actionCode: 'CREATE_QUESTION', countsAsCompletedAction: false }, function () { return VMS.Repositories.SurveyQuestionRepository.create(model).then(function (saved) { return VMS.Utilities.success(saved); }); });
                });
            });
        },

        UpdateQuestion: function (id, patch, etag) {
            if (!isAdmin()) { return denied(); }
            return VMS.Repositories.SurveyQuestionRepository.getById(id).then(function (row) {
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Question was not found.'); }
                return $.when(VMS.Repositories.FeedbackAssignmentRepository.count({ filters: [{ field: 'SurveyVersionCode', operator: 'eq', value: row.SurveyVersionCode }] }), VMS.Repositories.ConfigurationRepository.getByKey(versionKey(row.SurveyVersionCode)), allQuestions(row.SurveyVersionCode)).then(function (used, version, data) {
                    var next = $.extend({}, row, patch || {}), duplicate = false;
                    if (used) { return VMS.Utilities.failure('INVALID_STAGE', 'Question structure is frozen after assignment generation.'); }
                    return VMS.Repositories.ConfigurationRepository.getByKey(questionGroupKey(next.QuestionGroupCode)).then(function (groupOption) {
                        var checked = questionValidation(next, groupOption, next.QuestionGroupCode === row.QuestionGroupCode);
                        $.each(data.items, function (_, item) { if (item.ID !== row.ID && (item.QuestionCode === checked.code || Number(item.DisplayOrder) === Number(next.DisplayOrder))) { duplicate = true; } });
                        if (checked.fields.length) { return invalid('Question details are invalid.', checked.fields); }
                        if (duplicate) { return VMS.Utilities.failure('DUPLICATE_KEY', 'Question Code and Display Order must be unique within the survey version.'); }
                        next.QuestionCode = checked.code; next.ScoreScaleCode = next.QuestionTypeCode === 'SCORE' ? scaleGroup : null; next.QuestionVersionKey = next.FunctionCode + '-' + next.SurveyVersionCode + '-' + checked.code;
                        return action({ entityType: 'SURVEY_QUESTION', entityId: row.ID, businessKey: row.QuestionVersionKey, actionCode: 'UPDATE_QUESTION', countsAsCompletedAction: false }, function () { return VMS.Repositories.SurveyQuestionRepository.update(row.ID, next, etag).then(stale); });
                    });
                });
            });
        },
        SetQuestionActive: function (id, active, etag) { return this.UpdateQuestion(id, { IsActive: !!active }, etag); },

        ActivateVersion: function (code, etag) {
            if (!isAdmin()) { return denied(); }
            return $.when(VMS.Repositories.ConfigurationRepository.getByKey(versionKey(code)), allQuestions(code), activeQuestionGroups()).then(function (version, questionData, groupOptions) {
                if (!version) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Survey Version was not found.'); }
                if (!validateStructure(version, questionData.items, groupOptions.items)) { return invalid('Activation requires at least one Score question, exactly one Open Text question, active configured Question Groups and unique display order.'); }
                return VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'GroupCode', operator: 'eq', value: 'SURVEY_VERSION' }, { field: 'TextValue', operator: 'eq', value: version.TextValue }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 100 }).then(function (activeData) {
                    return action({ entityType: 'SURVEY_VERSION', entityId: version.ID, businessKey: version.ItemCode, actionCode: 'ACTIVATE_SURVEY_VERSION', countsAsCompletedAction: false }, function () {
                        function restorePrevious() { return sequential($.grep(activeData.items, function (item) { return item.ID !== version.ID; }), function (item) { return VMS.Repositories.ConfigurationRepository.getById(item.ID).then(function (fresh) { return fresh ? VMS.Repositories.ConfigurationRepository.update(fresh.ID, { IsActive: true }, fresh._etag) : null; }); }); }
                        return sequential($.grep(activeData.items, function (item) { return item.ID !== version.ID; }), function (item) { return VMS.Repositories.ConfigurationRepository.update(item.ID, { IsActive: false }, item._etag); }).then(function (disabled) {
                            var failed = false; $.each(disabled, function (_, item) { failed = failed || !item || item.error; });
                            if (failed) { return restorePrevious().then(function () { return VMS.Utilities.failure('STALE_RECORD', 'The active Survey Version changed. Refresh before continuing.'); }); }
                            return VMS.Repositories.ConfigurationRepository.update(version.ID, { IsActive: true }, etag || version._etag).then(function (saved) {
                                if (saved && saved.error) { return restorePrevious().then(function () { return VMS.Utilities.failure('STALE_RECORD', 'The Survey Version changed. Refresh before continuing.'); }); }
                                return VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'GroupCode', operator: 'eq', value: 'SURVEY_VERSION' }, { field: 'TextValue', operator: 'eq', value: version.TextValue }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 10 }).then(function (verified) {
                                    if (verified.items.length !== 1 || verified.items[0].ID !== version.ID) { return VMS.Repositories.ConfigurationRepository.getById(version.ID).then(function (freshVersion) { var disableSelected = freshVersion ? VMS.Repositories.ConfigurationRepository.update(freshVersion.ID, { IsActive: false }, freshVersion._etag) : VMS.Utilities.resolved(null); return disableSelected.then(function () { return restorePrevious().then(function () { return VMS.Utilities.failure('RECOVERY_REQUIRED', 'Survey Version activation could not be verified.'); }); }); }); }
                                    return VMS.Utilities.success({ SurveyVersionCode: version.ItemCode, FunctionCode: version.TextValue });
                                });
                            });
                        });
                    });
                });
            });
        },

        GenerateAssignments: function (functionCode, vendorIds, actionRequestId) {
            if (!isAdmin()) { return denied(); }
            if (typeof functionCode === 'object') { actionRequestId = functionCode.ActionRequestId; vendorIds = functionCode.VendorIDs; functionCode = functionCode.FunctionCode; }
            var year = riyadhYear(), unique = {}, requested = [], invalidIds = false;
            if ($.inArray(functionCode, eligibleFunctions) < 0) { return VMS.Utilities.resolved(invalid('An eligible Function is required.')); }
            $.each(vendorIds || [], function (_, value) { var id = VMS.Utilities.lookupId(value); if (!id || Math.floor(id) !== id) { invalidIds = true; } else if (!unique[id]) { unique[id] = true; requested.push(id); } });
            if (invalidIds || !requested.length) { return VMS.Utilities.resolved(invalid('Select one or more approved active Vendors.')); }
            return $.when(versionByFunction(functionCode), VMS.Repositories.UserRepository.query({ filters: [{ field: 'FunctionCode', operator: 'eq', value: functionCode }, { field: 'IsActive', operator: 'eq', value: true }, { field: 'RoleCode', operator: 'in', value: eligibleRoles }], sort: [{ field: 'ID', direction: 'asc' }], pageSize: 1000 }), VMS.Repositories.VendorRepository.query({ filters: [{ field: 'ID', operator: 'in', value: requested }, { field: 'StageCode', operator: 'eq', value: 'APPROVED' }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'ID', direction: 'asc' }], pageSize: 1000 }), activeScales()).then(function (versions, users, vendors, scales) {
                if (versions.items.length !== 1 || Number(versions.items[0].NumericValue) !== year) { return VMS.Utilities.failure('CONFIGURATION_INVALID', 'Exactly one active current-year Survey Version is required for the Function.'); }
                if (vendors.items.length !== requested.length) { return invalid('Every selected Vendor must be approved and active.'); }
                if (scales.items.length !== 5) { return VMS.Utilities.failure('CONFIGURATION_INVALID', 'The approved Feedback scale is incomplete.'); }
                var version = versions.items[0];
                return $.when(activeQuestions(version.ItemCode), activeQuestionGroups()).then(function (questionData, groupOptions) {
                    if (!validateStructure(version, questionData.items, groupOptions.items)) { return VMS.Utilities.failure('CONFIGURATION_INVALID', 'The active Survey Version structure is invalid.'); }
                    var planned = [];
                    $.each(vendors.items, function (_, vendor) { $.each(users.items, function (__, assigned) { planned.push({ key: assigned.UserKey + '-' + vendor.VendorCode + '-' + functionCode + '-' + year, assigned: assigned, vendor: vendor }); }); });
                    return action({ actionRequestId: actionRequestId || VMS.Utilities.guid(), entityType: 'FEEDBACK_ASSIGNMENT', businessKey: functionCode + '-' + year, actionCode: 'GENERATE_ASSIGNMENTS', countsAsCompletedAction: false }, function () {
                        var createdIds = [], skipped = 0;
                        function recoveryFailure() { return sequential(createdIds, function (id) { return VMS.Repositories.FeedbackAssignmentRepository.getById(id).then(function (created) { return created ? VMS.Repositories.FeedbackAssignmentRepository.update(id, { IsActive: false, RecoveryRequired: true }, created._etag) : null; }); }).then(function () { return VMS.Utilities.failure('RECOVERY_REQUIRED', 'Assignment generation did not complete and requires controlled recovery.'); }); }
                        return sequential(planned, function (item) {
                            return VMS.Repositories.FeedbackAssignmentRepository.getByKey(item.key).then(function (existing) {
                                if (existing) { skipped += 1; return { skipped: true }; }
                                var contract = buildSnapshot(version, questionData.items, scales.items, item.assigned, item.vendor, year);
                                return VMS.Repositories.FeedbackAssignmentRepository.create({ FeedbackAssignmentKey: item.key, Vendor: item.vendor.ID, VendorCodeSnapshot: item.vendor.VendorCode, VendorNameSnapshot: item.vendor.VendorName, AssignedUser: item.assigned.ID, AssignedUserName: item.assigned.UserName, AssignedUserEmail: item.assigned.Email, FunctionCode: functionCode, AssignmentYear: year, SurveyVersionCode: version.ItemCode, QuestionSetSnapshotJSON: JSON.stringify(contract), AssignmentStatusCode: 'OPEN', AssignmentDate: contract.assignmentDate, CompletedDate: null, AnswerPayload: null, TotalScore: null, OverallScore: null, MaximumPossibleScore: contract.maximumPossibleScore, IsActive: true }).then(function (saved) { if (saved && saved.ID) { createdIds.push(saved.ID); } return saved; });
                            });
                        }).then(function (outcomes) {
                            var failed = false; $.each(outcomes, function (_, item) { failed = failed || !item; });
                            if (failed) { return recoveryFailure(); }
                            return sequential(planned, function (item) { return VMS.Repositories.FeedbackAssignmentRepository.getByKey(item.key); }).then(function (verified) {
                                var incomplete = false; $.each(verified, function (_, item) { incomplete = incomplete || !item; });
                                return incomplete ? recoveryFailure() : VMS.Utilities.success({ FunctionCode: functionCode, AssignmentYear: year, EligibleUserCount: users.items.length, VendorCount: vendors.items.length, PlannedCount: planned.length, CreatedCount: createdIds.length, SkippedCount: skipped });
                            });
                        });
                    });
                });
            });
        },

        QueryAssignmentMetadata: function (input) {
            var actor = currentUser(), filters, page, pageSize, search, status;
            input = input || {}; page = Math.max(1, Number(input.page || 1)); pageSize = Number(input.pageSize) === 25 ? 25 : 10; search = input.search || ''; status = input.status || (input.filters && input.filters.status) || '';
            if (isAdmin()) {
                filters = [];
                if (input.filters && input.filters.functionCode && $.inArray(input.filters.functionCode, eligibleFunctions) >= 0) { filters.push({ field: 'FunctionCode', operator: 'eq', value: input.filters.functionCode }); }
                if ($.inArray(status, ['OPEN', 'SUBMITTED']) >= 0) { filters.push({ field: 'AssignmentStatusCode', operator: 'eq', value: status }); }
                if (input.filters && input.filters.active === 'active') { filters.push({ field: 'IsActive', operator: 'eq', value: true }); }
                if (input.filters && input.filters.active === 'inactive') { filters.push({ field: 'IsActive', operator: 'eq', value: false }); }
                var adminScope = VMS.AuthorizationScope.build('Feedback_Assignment', actor, 'metadata'), adminSpec = { filters: filters, authorizationScope: adminScope, search: { fields: ['VendorNameSnapshot', 'VendorCodeSnapshot', 'AssignedUserName', 'AssignedUserEmail', 'SurveyVersionCode', 'FunctionCode'], value: search }, sort: input.sort ? [input.sort] : [{ field: 'AssignmentDate', direction: 'desc' }, { field: 'ID', direction: 'desc' }], pageSize: pageSize, continuationToken: input.continuationToken || null, select: ['ID', 'FeedbackAssignmentKey', 'Vendor', 'VendorCodeSnapshot', 'VendorNameSnapshot', 'AssignedUser', 'AssignedUserName', 'AssignedUserEmail', 'FunctionCode', 'AssignmentYear', 'SurveyVersionCode', 'AssignmentStatusCode', 'AssignmentDate', 'CompletedDate', 'IsActive', '_etag'] };
                return $.when(VMS.Repositories.FeedbackAssignmentRepository.query(adminSpec), VMS.Repositories.FeedbackAssignmentRepository.count($.extend(true, {}, adminSpec, { continuationToken: null }))).then(function (data, count) { return VMS.Utilities.success({ items: $.map(data.items, safeAdminAssignment), totalCount: count, page: page, pageSize: pageSize, continuationToken: data.continuationToken }); });
            }
            if (!eligible(actor)) { return denied('Feedback assignments are not authorized.'); }
            filters = [{ field: 'AssignedUser', operator: 'eq', value: actor.ID }, { field: 'AssignedUserEmail', operator: 'eq', value: actor.Email }, { field: 'FunctionCode', operator: 'eq', value: actor.FunctionCode }, { field: 'IsActive', operator: 'eq', value: true }];
            if ($.inArray(status, ['OPEN', 'SUBMITTED']) >= 0) { filters.push({ field: 'AssignmentStatusCode', operator: 'eq', value: status }); }
            var ownScope = VMS.AuthorizationScope.build('Feedback_Assignment', actor, 'own'), ownSpec = { filters: filters, authorizationScope: ownScope, search: { fields: ['VendorNameSnapshot', 'VendorCodeSnapshot', 'SurveyVersionCode', 'FunctionCode', 'AssignmentYear'], value: search }, sort: input.sort ? [input.sort] : [{ field: 'AssignmentDate', direction: 'desc' }, { field: 'ID', direction: 'desc' }], pageSize: pageSize, continuationToken: input.continuationToken || null };
            return $.when(VMS.Repositories.FeedbackAssignmentRepository.query(ownSpec), VMS.Repositories.FeedbackAssignmentRepository.count($.extend(true, {}, ownSpec, { continuationToken: null }))).then(function (data, count) { return VMS.Utilities.success({ items: $.map(data.items, safeAssignment), totalCount: count, page: page, pageSize: pageSize, continuationToken: data.continuationToken }); });
        },

        GetOwnAssignmentCounts: function () {
            var actor = currentUser();
            if (!eligible(actor)) { return denied('Feedback assignments are not authorized.'); }
            return VMS.Repositories.FeedbackAssignmentRepository.query({ filters: [{ field: 'AssignedUser', operator: 'eq', value: actor.ID }, { field: 'AssignedUserEmail', operator: 'eq', value: actor.Email }, { field: 'FunctionCode', operator: 'eq', value: actor.FunctionCode }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 1000 }).then(function (data) {
                var counts = { All: data.items.length, Open: 0, Submitted: 0 };
                $.each(data.items, function (_, row) { if (row.AssignmentStatusCode === 'OPEN') { counts.Open += 1; } else if (row.AssignmentStatusCode === 'SUBMITTED') { counts.Submitted += 1; } });
                return VMS.Utilities.success(counts);
            });
        },

        GetOwnActionableAssignments: function () {
            var actor = currentUser();
            if (!eligible(actor)) { return VMS.Utilities.resolved(VMS.Utilities.success({ items: [], totalCount: 0 })); }
            return VMS.Repositories.FeedbackAssignmentRepository.query({ filters: [{ field: 'AssignedUser', operator: 'eq', value: actor.ID }, { field: 'AssignedUserEmail', operator: 'eq', value: actor.Email }, { field: 'AssignmentStatusCode', operator: 'eq', value: 'OPEN' }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'AssignmentDate', direction: 'desc' }], pageSize: 1000 }).then(function (data) {
                var items = $.map($.grep(data.items, function (row) { return actionable(row, actor); }), safeAssignment);
                return VMS.Utilities.success({ items: items, totalCount: items.length });
            });
        },

        SetAssignmentActive: function (id, active, reason, etag) {
            if (!isAdmin()) { return denied(); }
            if (!$.trim(reason || '')) { return VMS.Utilities.resolved(invalid('An administrative reason is required.', [{ field: 'Reason', code: 'VALIDATION_FAILED', message: 'Reason is required.' }])); }
            return VMS.Repositories.FeedbackAssignmentRepository.getById(id).then(function (row) {
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Feedback assignment was not found.'); }
                if (active && $.inArray(row.AssignmentStatusCode, ['OPEN', 'SUBMITTED']) < 0) { return VMS.Utilities.failure('INVALID_STAGE', 'This assignment cannot be reactivated.'); }
                function save() { return action({ entityType: 'FEEDBACK_ASSIGNMENT', entityId: id, businessKey: row.FeedbackAssignmentKey, actionCode: active ? 'ACTIVATE_ASSIGNMENT' : 'DEACTIVATE_ASSIGNMENT', comment: reason, changedFields: { IsActive: !!active }, countsAsCompletedAction: false }, function () { return VMS.Repositories.FeedbackAssignmentRepository.update(id, { IsActive: !!active }, etag).then(function (saved) { return saved && saved.error ? VMS.Utilities.failure('STALE_RECORD', 'The assignment changed. Refresh before continuing.') : VMS.Utilities.success({ ID: id, IsActive: !!active }); }); }); }
                if (!active || row.AssignmentStatusCode === 'SUBMITTED') { return save(); }
                return VMS.Repositories.UserRepository.getById(VMS.Utilities.lookupId(row.AssignedUser)).then(function (assigned) { return !eligible(assigned, row.FunctionCode) || assigned.UserKey !== VMS.Utilities.normalize(row.AssignedUserEmail) ? VMS.Utilities.failure('INVALID_STAGE', 'The assigned user is no longer eligible in the assignment Function.') : save(); });
            });
        },

        GetOwnAssignment: function (id, key) {
            var actor = currentUser(), positive = VMS.Utilities.positiveId(id);
            if (!eligible(actor)) { return denied('Feedback assignments are not authorized.'); }
            if (!positive || key !== 'FDB-' + positive) { return VMS.Utilities.resolved(VMS.Utilities.failure('INVALID_LINK', 'The Feedback assignment link is invalid.')); }
            return VMS.Repositories.FeedbackAssignmentRepository.getById(positive).then(function (row) {
                if (!normalizedOwner(row, actor) || !row.IsActive || row.FunctionCode !== actor.FunctionCode) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Feedback assignment was not found or is not authorized.'); }
                var contract = parseJSON(row.QuestionSetSnapshotJSON);
                if (!validSnapshot(contract)) { return VMS.Utilities.failure('CONFIGURATION_INVALID', 'The Feedback snapshot is invalid.'); }
                row = VMS.Utilities.clone(row); row.QuestionSetSnapshot = contract; row.Actionable = actionable(row, actor); row.ReadOnly = row.AssignmentStatusCode === 'SUBMITTED'; row.DeepLinkKey = key;
                return VMS.Utilities.success(row);
            });
        },

        SubmitOwn: function (id, key, responses, etag, actionRequestId) {
            var actor = currentUser(), positive = VMS.Utilities.positiveId(id);
            if (!eligible(actor)) { return denied('Feedback submission is not authorized.'); }
            if (!positive || key !== 'FDB-' + positive) { return VMS.Utilities.resolved(VMS.Utilities.failure('INVALID_LINK', 'The Feedback assignment link is invalid.')); }
            actionRequestId = actionRequestId || VMS.Utilities.guid();
            return replaySubmission(actionRequestId, positive, actor).then(function (replay) {
                if (replay) { return replay; }
                return VMS.Repositories.FeedbackAssignmentRepository.getById(positive).then(function (row) {
                    var contract, questionMap = {}, seen = {}, scoreCount = 0, openCount = 0, total = 0, payloadQuestions = [], fieldErrors = [];
                    if (!normalizedOwner(row, actor)) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Feedback assignment was not found or is not authorized.'); }
                    if (!actionable(row, actor)) { return VMS.Utilities.failure('INVALID_STAGE', 'Feedback assignment is not actionable.'); }
                    if (!etag || etag !== row._etag) { return VMS.Utilities.failure('STALE_RECORD', 'The Feedback assignment changed. Refresh before continuing.'); }
                    contract = parseJSON(row.QuestionSetSnapshotJSON);
                    if (!validSnapshot(contract)) { return VMS.Utilities.failure('CONFIGURATION_INVALID', 'The Feedback snapshot is invalid.'); }
                    $.each(contract.questions, function (_, question) { questionMap[question.questionCode] = question; if (question.questionTypeCode === 'SCORE') { scoreCount += 1; } else if (question.questionTypeCode === 'OPEN_TEXT') { openCount += 1; } });
                    if (!$.isArray(responses) || openCount !== 1 || scoreCount < 1) { return invalid('Feedback responses are incomplete or invalid.'); }
                    $.each(responses, function (_, response) {
                        var code = response && response.questionCode, question = questionMap[code], selected = null, textValue, maximumValue = 0;
                        if (!question || seen[code]) { fieldErrors.push({ field: code || 'Responses', code: 'VALIDATION_FAILED', message: 'An unknown or duplicate response was submitted.' }); return; }
                        seen[code] = true;
                        if (question.questionTypeCode === 'SCORE') {
                            $.each(question.scaleItems || [], function (__, scale) { maximumValue = Math.max(maximumValue, Number(scale.numericValue || 0)); if (scale.itemCode === response.itemCode) { selected = scale; } });
                            if (!selected || !isFinite(Number(selected.numericValue))) { fieldErrors.push({ field: code, code: 'VALIDATION_FAILED', message: 'Select one approved score.' }); return; }
                            total += Number(selected.numericValue); payloadQuestions.push({ questionCode: code, questionTextSnapshot: question.questionText, questionGroupCode: question.questionGroupCode, questionGroupLabelSnapshot: question.questionGroupLabel, questionTypeCode: 'SCORE', displayOrder: question.displayOrder, scaleCode: selected.itemCode, scaleLabelSnapshot: selected.displayLabel, numericValue: Number(selected.numericValue), maximumNumericValue: maximumValue });
                        } else { textValue = $.trim(response.textValue || ''); if (textValue) { payloadQuestions.push({ questionCode: code, questionTextSnapshot: question.questionText, questionTypeCode: 'OPEN_TEXT', displayOrder: question.displayOrder, textValue: textValue }); } }
                    });
                    $.each(contract.questions, function (_, question) { if (!seen[question.questionCode]) { fieldErrors.push({ field: question.questionCode, code: 'VALIDATION_FAILED', message: question.questionTypeCode === 'SCORE' ? 'A score is required.' : 'The optional comment response must be included.' }); } });
                    if (fieldErrors.length) { return invalid('Feedback responses are incomplete or invalid.', fieldErrors); }
                    payloadQuestions.sort(function (a, b) { return Number(a.displayOrder) - Number(b.displayOrder); });
                    var overall = VMS.Utilities.roundHalfAway(total / scoreCount, 1), completed = VMS.Services.ClockService.Now().toISOString(), safeResult = { ID: row.ID, FeedbackAssignmentKey: row.FeedbackAssignmentKey, AssignmentStatusCode: 'SUBMITTED', CompletedDate: completed, TotalScore: total, OverallScore: overall, MaximumPossibleScore: Number(row.MaximumPossibleScore || contract.maximumPossibleScore) };
                    return action({ actionRequestId: actionRequestId, entityType: 'FEEDBACK_ASSIGNMENT', entityId: row.ID, businessKey: 'FDB-' + row.ID, actionCode: 'SUBMIT_FEEDBACK', fromStatus: 'OPEN', toStatus: 'SUBMITTED', countsAsCompletedAction: true }, function () {
                        return VMS.Repositories.FeedbackAssignmentRepository.update(row.ID, { AnswerPayload: JSON.stringify({ schemaVersion: 1, surveyVersionCode: row.SurveyVersionCode, functionCode: row.FunctionCode, assignmentYear: row.AssignmentYear, questions: payloadQuestions }), TotalScore: total, OverallScore: overall, MaximumPossibleScore: Number(row.MaximumPossibleScore || contract.maximumPossibleScore), CompletedDate: completed, AssignmentStatusCode: 'SUBMITTED' }, etag).then(function (saved) { return saved && saved.error ? VMS.Utilities.failure('STALE_RECORD', 'The Feedback assignment changed. Refresh before continuing.') : VMS.Utilities.success(safeResult); });
                    }, { eventCode: 'FEEDBACK_SUBMITTED', to: [actor.Email], cc: [], businessKey: row.VendorCodeSnapshot + '-' + row.AssignmentYear });
                });
            });
        },

        GetVendorAggregate: function (vendorId, year) {
            var selectedYear = Number(year || riyadhYear()), positive = VMS.Utilities.positiveId(vendorId);
            if (!positive || !selectedYear || Math.floor(selectedYear) !== selectedYear) { return VMS.Utilities.resolved(VMS.Utilities.failure('INVALID_LINK', 'Vendor performance request is invalid.')); }
            return VMS.Repositories.VendorRepository.getById(positive).then(function (vendor) {
                if (!vendor) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Vendor performance is not available.'); }
                return VMS.Services.AccessService.AuthorizeRecord('VENDOR', vendor, 'READ').then(function (authorized) {
                    if (!authorized.ok) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'Vendor performance is not available.'); }
                    return VMS.Repositories.FeedbackAssignmentRepository.query({ filters: [{ field: 'Vendor', operator: 'eq', value: positive }, { field: 'AssignmentStatusCode', operator: 'eq', value: 'SUBMITTED' }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 1000 }).then(function (data) {
                        var yearsMap = {}, groupValues = { PAYMENT: [], EXECUTION: [], EDUCATION_PROGRAM: [], LFO: [] }, overallValues = [], selectedCount = 0;
                        $.each(data.items, function (_, row) {
                            yearsMap[Number(row.AssignmentYear)] = true;
                            if (Number(row.AssignmentYear) !== selectedYear) { return; }
                            var contract = parseJSON(row.QuestionSetSnapshotJSON), payload = parseJSON(row.AnswerPayload), answers = {};
                            if (!contract || !payload || payload.schemaVersion !== 1 || !$.isArray(payload.questions)) { return; }
                            $.each(payload.questions, function (__, answer) { answers[answer.questionCode] = answer; });
                            $.each(contract.questions || [], function (__, question) {
                                var response = answers[question.questionCode], selected, max = 0;
                                if (question.questionTypeCode !== 'SCORE' || !response || response.questionTypeCode !== 'SCORE') { return; }
                                $.each(question.scaleItems || [], function (___, scale) { max = Math.max(max, Number(scale.numericValue || 0)); if (scale.itemCode === response.scaleCode && Number(scale.numericValue) === Number(response.numericValue)) { selected = scale; } });
                                if (!selected || !max || !groupValues[question.questionGroupCode]) { return; }
                                var normalized = Number(selected.numericValue) / max * 100; groupValues[question.questionGroupCode].push(normalized); overallValues.push(normalized); selectedCount += 1;
                            });
                        });
                        var years = $.map(yearsMap, function (_, itemYear) { return Number(itemYear); }); years.sort(function (a, b) { return b - a; });
                        var summary = { Overall: safeMean(overallValues), Payment: safeMean(groupValues.PAYMENT), Execution: safeMean(groupValues.EXECUTION), EducationProgram: safeMean(groupValues.EDUCATION_PROGRAM), LFO: safeMean(groupValues.LFO) };
                        return VMS.Utilities.success({ vendorId: positive, year: selectedYear, years: years, summary: summary, dimensions: [{ code: 'OVERALL', label: 'Overall', score: summary.Overall }, { code: 'PAYMENT', label: 'Payment', score: summary.Payment }, { code: 'EXECUTION', label: 'Execution', score: summary.Execution }, { code: 'EDUCATION_PROGRAM', label: 'Education Program', score: summary.EducationProgram }, { code: 'LFO', label: 'LFO', score: summary.LFO }], hasData: selectedCount > 0 });
                    });
                });
            });
        },

        GetAdministrationOptions: function () { if (!isAdmin()) { return denied(); } return $.when(VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'GroupCode', operator: 'eq', value: 'SURVEY_VERSION' }], sort: [{ field: 'TextValue', direction: 'asc' }, { field: 'NumericValue', direction: 'desc' }, { field: 'SortOrder', direction: 'desc' }], pageSize: 1000 }), VMS.Repositories.VendorRepository.query({ filters: [{ field: 'StageCode', operator: 'eq', value: 'APPROVED' }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'VendorName', direction: 'asc' }], pageSize: 1000, select: ['ID', 'VendorCode', 'VendorName'] }), activeQuestionGroups()).then(function (versions, vendors, groups) { return VMS.Utilities.success({ Functions: eligibleFunctions.slice(0), CurrentYear: riyadhYear(), SurveyVersions: versions.items, Vendors: vendors.items, QuestionGroups: $.map(groups.items, function (group) { return { ItemCode: group.ItemCode, DisplayLabel: group.DisplayLabel, SortOrder: group.SortOrder }; }) }); }); },
        QuerySurveyVersions: function (spec) { if (!isAdmin()) { return denied(); } spec = $.extend(true, {}, spec || {}); spec.filters = spec.filters || []; spec.filters.push({ field: 'GroupCode', operator: 'eq', value: 'SURVEY_VERSION' }); return VMS.Repositories.ConfigurationRepository.query(spec).then(function (data) { return VMS.Utilities.success(data); }); },
        QueryQuestions: function (spec) { if (!isAdmin()) { return denied(); } return VMS.Repositories.SurveyQuestionRepository.query(spec || {}).then(function (data) { return VMS.Utilities.success(data); }); },
        GetSurveyPreview: function (code) { if (!isAdmin()) { return denied(); } return activeQuestions(code).then(function (data) { return VMS.Utilities.success(data); }); }
    };
}(window.VMS, window.jQuery));
