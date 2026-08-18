(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function VendorService(repositories, accessService, mutationRunner) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
    }

    VendorService.prototype._authorizeAction = function (actionCode, record) {
        var self = this;
        return this.accessService.ResolveCurrentUser().then(function (user) {
            if (!self.accessService.CanPerform(user, actionCode, record || {})) {
                return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "You are not authorized to perform this Vendor action.");
            }
            return user;
        });
    };

    VendorService.prototype._validateCreate = function (input) {
        var errors = [];
        var emails;
        VMS.ValidationService.required(input.VendorName, "VendorName", "Vendor Name", errors);
        emails = VMS.ValidationService.emailList(input.Email, "Email", errors);
        VMS.ValidationService.required(input.PhoneNumber, "PhoneNumber", "Phone Number", errors);
        VMS.ValidationService.required(input.Address, "Address", "Address", errors);
        VMS.ValidationService.required(input.VendorClassificationCode, "VendorClassificationCode", "Vendor Classification", errors);
        VMS.ValidationService.required(input.VendorProcessingTypeCode, "VendorProcessingTypeCode", "Vendor Processing Type", errors);
        if (!input.Country || !input.City) {
            errors.push(VMS.ValidationService.error("Country", "REQUIRED", "Country and City are required."));
        }
        if (!input.Category || !input.Category.length) {
            errors.push(VMS.ValidationService.error("Category", "REQUIRED", "At least one Vendor Category is required."));
        }
        VMS.ValidationService.attachments(input.Attachments, ["pdf", "xlsx", "docx"], false, "Attachments", errors);
        return { errors: errors, emails: emails };
    };

    VendorService.prototype.GetCreationLookups = function () {
        var self = this;
        return this._authorizeAction("VENDOR_CREATE").then(function () {
            return $.when(
                H.queryAll(self.repositories.countries, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "CountryName", direction: "ASC" }] }),
                H.queryAll(self.repositories.cities, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "CityName", direction: "ASC" }] }),
                H.queryAll(self.repositories.categories, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "DisplayLabel", direction: "ASC" }] }),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["VENDOR_CLASSIFICATION", "VENDOR_PROCESSING_TYPE"] }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "SortOrder", direction: "ASC" }] }),
                H.queryAll(self.repositories.users, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "UserName", direction: "ASC" }] })
            );
        }).then(function (countries, cities, categories, configuration, requesters) {
            return { countries: countries, cities: cities, categories: categories, configuration: configuration, requesters: requesters };
        });
    };

    VendorService.prototype.GetDecisionItem = function (id, actionCode) {
        var self = this;
        return this._authorizeAction(actionCode).then(function () { return self.repositories.vendors.getById(id); }).then(function (record) {
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, record, actionCode).then(function () { return record; });
        });
    };

    VendorService.prototype.Create = function (input, actionRequestId) {
        var self = this;
        var validated = this._validateCreate(input);
        var actor;
        var now;
        var categoryIds = VMS.Utilities.lookupIds(input.Category || []);
        var resolvedCategories;
        if (validated.errors.length) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Vendor fields.", validated.errors);
        }
        return this._authorizeAction("VENDOR_CREATE").then(function (user) {
            actor = user;
            return H.queryAll(self.repositories.vendors, {});
        }).then(function (duplicates) {
            var normalizedName = VMS.Utilities.normalizeKey(VMS.Utilities.collapseWhitespace(input.VendorName));
            if ($.grep(duplicates, function (vendor) { return VMS.Utilities.normalizeKey(VMS.Utilities.collapseWhitespace(vendor.VendorName)) === normalizedName; }).length) {
                return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "A Vendor with this name already exists.");
            }
            return $.when(
                self.repositories.countries.getById(VMS.Utilities.lookupId(input.Country)),
                self.repositories.cities.getById(VMS.Utilities.lookupId(input.City)),
                H.setting(self.repositories, "VENDOR_DOCUMENT_EXPIRY_DAYS"),
                H.queryAll(self.repositories.categories, { filters: [{ field: "ID", op: "in", value: categoryIds }, { field: "IsActive", op: "eq", value: true }] }),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["VENDOR_CLASSIFICATION", "VENDOR_PROCESSING_TYPE"] }, { field: "IsActive", op: "eq", value: true }] }),
                input.RequestedBy ? self.repositories.users.getById(VMS.Utilities.lookupId(input.RequestedBy)) : $.Deferred().resolve(null).promise()
            );
        }).then(function (country, city, expirySetting, categories, configuration, requester) {
            var expiryDays = Number(expirySetting.NumericValue);
            var uniqueIds = {};
            var classificationValid;
            var processingValid;
            var duplicateCategory = false;
            if (!country || country.IsActive !== true || !city || city.IsActive !== true || VMS.Utilities.lookupId(city.Country) !== country.ID) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active City belonging to the selected Country.");
            }
            $.each(categoryIds, function (_, id) { if (uniqueIds[id]) { duplicateCategory = true; } uniqueIds[id] = true; });
            if (duplicateCategory || !categoryIds.length || categories.length !== categoryIds.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select one or more distinct active Vendor Categories."); }
            classificationValid = $.grep(configuration, function (item) { return item.GroupCode === "VENDOR_CLASSIFICATION" && item.ItemCode === input.VendorClassificationCode; }).length === 1;
            processingValid = $.grep(configuration, function (item) { return item.GroupCode === "VENDOR_PROCESSING_TYPE" && item.ItemCode === input.VendorProcessingTypeCode; }).length === 1;
            if (!classificationValid || !processingValid || $.inArray(input.VendorProcessingTypeCode, ["STANDARD", "DIRECT"]) < 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select active configured Vendor Classification and Processing Type values."); }
            if (input.RequestedBy && (!requester || requester.IsActive !== true)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active internal requester."); }
            if (!isFinite(expiryDays) || Math.floor(expiryDays) !== expiryDays || expiryDays <= 15) {
                return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "Vendor expiry configuration is invalid.");
            }
            resolvedCategories = $.map(categories, function (category) { return { id: category.ID, title: category.DisplayLabel }; });
            input.PhoneNumber = VMS.ValidationService.phone(input.PhoneNumber, country.PhoneCode, "PhoneNumber", validated.errors);
            if (validated.errors.length) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Vendor fields.", validated.errors);
            }
            now = VMS.ClockService.utcNow();
            return self.mutationRunner.Run({
                actionRequestId: actionRequestId,
                actionCode: "VENDOR_CREATE",
                entityTypeCode: VMS.Constants.ENTITY_TYPES.VENDOR,
                fromStageCode: "",
                toStageCode: VMS.Constants.VENDOR_STATES.DOCUMENT_EVALUATION,
                toStatusCode: VMS.Constants.STATUSES.IN_PROGRESS,
                successCode: "VENDOR_CREATED",
                successMessage: "Vendor registration was created."
            }, function () {
                return self.repositories.vendors.create({
                    VendorName: VMS.Utilities.collapseWhitespace(input.VendorName),
                    VendorCode: "",
                    VendorCodeNormalizedKey: "",
                    Email: validated.emails,
                    PhoneNumber: input.PhoneNumber,
                    RequestedBy: requester ? { id: requester.ID, title: requester.UserName, email: requester.Email } : null,
                    Country: { id: country.ID, title: country.CountryName },
                    City: { id: city.ID, title: city.CityName },
                    Category: resolvedCategories,
                    PostalCode: VMS.Utilities.trim(input.PostalCode),
                    Address: VMS.Utilities.trim(input.Address),
                    VendorClassificationCode: input.VendorClassificationCode,
                    VendorProcessingTypeCode: input.VendorProcessingTypeCode,
                    Attachments: [],
                    EvaluationResultCode: "PENDING",
                    InterviewResultCode: "PENDING",
                    RejectionReason: "",
                    StageCode: VMS.Constants.VENDOR_STATES.DOCUMENT_EVALUATION,
                    StatusCode: VMS.Constants.STATUSES.IN_PROGRESS,
                    DisplayName: VMS.Utilities.collapseWhitespace(input.VendorName),
                    VendorExpiryDaysSnapshot: expiryDays,
                    ExpiryReminderDate: H.addDays(now, 15),
                    ExpiryReminderSentDate: null,
                    ExpiryDueDate: H.addDays(now, expiryDays),
                    RegistrationDate: now,
                    DocumentEvaluationDate: null,
                    RecordDate: null,
                    IsActive: false
                }, H.actorContext(actor)).then(function (created) {
                    var files = input.Attachments || [];
                    var upload = files.length ? self.repositories.vendors.addAttachments(created.ID, files, H.actorContext(actor)) : $.Deferred().resolve(created).promise();
                    return upload.then(function (withFiles) {
                        return $.when(self.repositories.vendors.getById(withFiles.ID), self.repositories.vendors.getAttachments(withFiles.ID));
                    }).then(function (complete, attachments) {
                        if (!complete || attachments.length !== files.length) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "Vendor creation could not be verified and requires reconciliation."); }
                        return self.repositories.vendors.update(complete.ID, { IsActive: true }, complete._etag, H.actorContext(actor));
                    });
                });
            }, function (record) {
                return { eventCode: "VENDOR_CREATED", context: { record: record } };
            });
        });
    };

    VendorService.prototype.GetProfile = function (id, deepLinkKey) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.VENDOR_PROFILE).then(function () {
            return self.repositories.vendors.getById(id);
        }).then(function (record) {
            return H.verifyDeepLink(record, id, deepLinkKey, "VND-" + id);
        }).then(function (record) {
            if ($.inArray(record.StageCode + "/" + record.StatusCode, ["APPROVED/APPROVED", "REJECTED/REJECTED", "EXPIRED/EXPIRED"]) < 0) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Vendor is still in onboarding and does not have a Vendor Profile yet."); }
            return record;
        }).then(function (record) {
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, record, "READ");
        }).then(function (authorized) {
            return authorized.record;
        });
    };

    VendorService.prototype.GetDocuments = function (id, deepLinkKey) {
        var self = this;
        return this.GetProfile(id, deepLinkKey).then(function (record) {
            return self.repositories.vendors.getAttachments(record.ID);
        });
    };

    VendorService.prototype.Query = function (querySpec) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.VENDOR_LIST).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.VENDOR, "REGISTER");
        }).then(function (context) {
            return self.repositories.vendors.query($.extend(true, {}, querySpec || {}, { authorizationScope: context.scope }));
        });
    };

    VendorService.prototype.GetListSummary = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.VENDOR_LIST).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.VENDOR, "SUMMARY");
        }).then(function (context) {
            return H.queryAll(self.repositories.vendors, { authorizationScope: context.scope });
        }).then(function (rows) {
            var summary = { total: rows.length, inProgress: 0, approved: 0, expired: 0, rejected: 0 };
            $.each(rows, function (_, row) {
                if (row.StatusCode === "IN_PROGRESS") { summary.inProgress += 1; }
                if (row.StageCode === "APPROVED" && row.StatusCode === "APPROVED") { summary.approved += 1; }
                if (row.StageCode === "EXPIRED" && row.StatusCode === "EXPIRED") { summary.expired += 1; }
                if (row.StageCode === "REJECTED" && row.StatusCode === "REJECTED") { summary.rejected += 1; }
            });
            return summary;
        });
    };

    VendorService.prototype._decision = function (id, expectedEtag, action, payload, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var isEvaluation = action === "VENDOR_EVALUATE";
        var pass = payload.resultCode === "PASSED";
        return this._authorizeAction(action).then(function (user) {
            actor = user;
            return self.repositories.vendors.getById(id);
        }).then(function (value) {
            record = value;
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, record, action);
        }).then(function () {
            return H.validateStage(record, isEvaluation ? "DOCUMENT_EVALUATION" : "INTERVIEW", "IN_PROGRESS");
        }).then(function () {
            var errors = [];
            var targetStage;
            var targetStatus;
            var patch;
            if ($.inArray(payload.resultCode, ["PASSED", "FAILED"]) < 0) {
                errors.push(VMS.ValidationService.error("resultCode", "REQUIRED", "Select Passed or Failed."));
            }
            if (!pass && !VMS.Utilities.trim(payload.reason)) {
                errors.push(VMS.ValidationService.error("reason", "REQUIRED", "A rejection reason is required."));
            }
            if (!isEvaluation && pass && !VMS.Utilities.trim(payload.vendorCode)) {
                errors.push(VMS.ValidationService.error("vendorCode", "REQUIRED", "Vendor Code is required for approval."));
            }
            if (errors.length) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the Vendor decision fields.", errors);
            }
            targetStage = pass ? (isEvaluation ? "INTERVIEW" : "APPROVED") : "REJECTED";
            targetStatus = pass ? (isEvaluation ? "IN_PROGRESS" : "APPROVED") : "REJECTED";
            patch = {
                StageCode: targetStage,
                StatusCode: targetStatus,
                RejectionReason: pass ? "" : VMS.Utilities.trim(payload.reason),
                EvaluationResultCode: isEvaluation ? payload.resultCode : record.EvaluationResultCode,
                InterviewResultCode: isEvaluation ? record.InterviewResultCode : payload.resultCode,
                DocumentEvaluationDate: isEvaluation && pass ? VMS.ClockService.utcNow() : record.DocumentEvaluationDate,
                RecordDate: targetStatus !== "IN_PROGRESS" ? VMS.ClockService.utcNow() : null
            };
            if (!isEvaluation && pass) {
                patch.VendorCode = VMS.Utilities.collapseWhitespace(payload.vendorCode).toUpperCase();
                patch.VendorCodeNormalizedKey = VMS.Utilities.normalizeKey(payload.vendorCode);
                patch.DisplayName = record.VendorName + " - " + patch.VendorCode;
            }
            return self.mutationRunner.Run({
                actionRequestId: actionRequestId,
                actionCode: action + "_" + payload.resultCode,
                entityTypeCode: VMS.Constants.ENTITY_TYPES.VENDOR,
                entityItemId: record.ID,
                businessKey: record.VendorCode || "VND-" + record.ID,
                fromStageCode: record.StageCode,
                fromStatusCode: record.StatusCode,
                toStageCode: targetStage,
                toStatusCode: targetStatus,
                comment: VMS.Utilities.trim(payload.reason),
                successCode: "VENDOR_DECISION_SAVED",
                successMessage: "Vendor decision was saved."
            }, function () {
                var uniqueness;
                if (!isEvaluation && pass) {
                    uniqueness = self.repositories.vendors.getByKey(patch.VendorCodeNormalizedKey).then(function (duplicate) {
                        if (duplicate && duplicate.ID !== record.ID) {
                            return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Vendor Code is already in use.");
                        }
                    });
                } else {
                    uniqueness = $.Deferred().resolve().promise();
                }
                return uniqueness.then(function () {
                    return self.repositories.vendors.update(record.ID, patch, expectedEtag || record._etag, H.actorContext(actor));
                });
            }, function (updated) {
                var eventCode = !pass ? "VENDOR_REJECTED" : (isEvaluation ? "VENDOR_EVALUATION_PASSED" : "VENDOR_APPROVED");
                return { eventCode: eventCode, context: { record: updated } };
            });
        });
    };

    VendorService.prototype.Evaluate = function (id, expectedEtag, payload, actionRequestId) {
        return this._decision(id, expectedEtag, "VENDOR_EVALUATE", payload, actionRequestId);
    };

    VendorService.prototype.Interview = function (id, expectedEtag, payload, actionRequestId) {
        return this._decision(id, expectedEtag, "VENDOR_INTERVIEW", payload, actionRequestId);
    };

    VendorService.prototype._resolveBusinessCorrection = function (record, patch) {
        var self = this;
        var has = Object.prototype.hasOwnProperty;
        var input = {
            VendorName: has.call(patch, "VendorName") ? patch.VendorName : record.VendorName,
            Email: has.call(patch, "Email") ? patch.Email : record.Email,
            PhoneNumber: has.call(patch, "PhoneNumber") ? patch.PhoneNumber : record.PhoneNumber,
            RequestedBy: has.call(patch, "RequestedBy") ? patch.RequestedBy : record.RequestedBy,
            Country: has.call(patch, "Country") ? patch.Country : record.Country,
            City: has.call(patch, "City") ? patch.City : record.City,
            Category: has.call(patch, "Category") ? patch.Category : record.Category,
            PostalCode: has.call(patch, "PostalCode") ? patch.PostalCode : record.PostalCode,
            Address: has.call(patch, "Address") ? patch.Address : record.Address,
            VendorClassificationCode: has.call(patch, "VendorClassificationCode") ? patch.VendorClassificationCode : record.VendorClassificationCode,
            VendorProcessingTypeCode: has.call(patch, "VendorProcessingTypeCode") ? patch.VendorProcessingTypeCode : record.VendorProcessingTypeCode,
            Attachments: record.Attachments || []
        };
        var validated = this._validateCreate(input);
        var categoryIds = VMS.Utilities.lookupIds(input.Category || []);
        var uniqueCategoryIds = {};
        var duplicateCategory = false;
        if (has.call(patch, "VendorCode") && VMS.Utilities.normalizeKey(patch.VendorCode) !== VMS.Utilities.normalizeKey(record.VendorCode)) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Vendor Code is locked through ordinary Vendor correction.");
        }
        if (has.call(patch, "IsActive") && patch.IsActive !== record.IsActive) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Use the controlled Vendor activation action to change activation state.");
        }
        $.each(categoryIds, function (_, categoryId) {
            if (uniqueCategoryIds[categoryId]) { duplicateCategory = true; }
            uniqueCategoryIds[categoryId] = true;
        });
        if (duplicateCategory) { validated.errors.push(VMS.ValidationService.error("Category", "DUPLICATE", "Select each Vendor Category only once.")); }
        if (validated.errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Vendor fields.", validated.errors); }
        return $.when(
            H.queryAll(this.repositories.vendors, {}),
            this.repositories.countries.getById(VMS.Utilities.lookupId(input.Country)),
            this.repositories.cities.getById(VMS.Utilities.lookupId(input.City)),
            H.queryAll(this.repositories.categories, { filters: [{ field: "ID", op: "in", value: categoryIds }, { field: "IsActive", op: "eq", value: true }] }),
            H.queryAll(this.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["VENDOR_CLASSIFICATION", "VENDOR_PROCESSING_TYPE"] }, { field: "IsActive", op: "eq", value: true }] }),
            H.setting(this.repositories, "DIRECT_PAYMENT_VENDOR_CODE"),
            input.RequestedBy ? this.repositories.users.getById(VMS.Utilities.lookupId(input.RequestedBy)) : $.Deferred().resolve(null).promise()
        ).then(function (vendors, country, city, categories, configuration, directSetting, requester) {
            var normalizedName = VMS.Utilities.normalizeKey(VMS.Utilities.collapseWhitespace(input.VendorName));
            var categoryMap = {};
            var resolvedCategories = [];
            var classificationValid;
            var processingValid;
            var phone;
            if ($.grep(vendors, function (vendor) { return vendor.ID !== record.ID && VMS.Utilities.normalizeKey(VMS.Utilities.collapseWhitespace(vendor.VendorName)) === normalizedName; }).length) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "A Vendor with this name already exists."); }
            if (!country || country.IsActive !== true || !city || city.IsActive !== true || VMS.Utilities.lookupId(city.Country) !== country.ID) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active City belonging to the selected Country."); }
            $.each(categories, function (_, category) { categoryMap[category.ID] = category; });
            $.each(categoryIds, function (_, categoryId) { if (categoryMap[categoryId]) { resolvedCategories.push({ id: categoryId, title: categoryMap[categoryId].DisplayLabel }); } });
            if (!categoryIds.length || resolvedCategories.length !== categoryIds.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select one or more distinct active Vendor Categories."); }
            classificationValid = $.grep(configuration, function (item) { return item.GroupCode === "VENDOR_CLASSIFICATION" && item.ItemCode === input.VendorClassificationCode; }).length === 1;
            processingValid = $.grep(configuration, function (item) { return item.GroupCode === "VENDOR_PROCESSING_TYPE" && item.ItemCode === input.VendorProcessingTypeCode; }).length === 1;
            if (!classificationValid || !processingValid || $.inArray(input.VendorProcessingTypeCode, ["STANDARD", "DIRECT"]) < 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select active configured Vendor Classification and Processing Type values."); }
            if (input.RequestedBy && (!requester || requester.IsActive !== true)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active internal requester."); }
            phone = VMS.ValidationService.phone(input.PhoneNumber, country.PhoneCode, "PhoneNumber", validated.errors);
            if (validated.errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Vendor fields.", validated.errors); }
            if (VMS.Utilities.normalizeKey(directSetting.TextValue) === VMS.Utilities.normalizeKey(record.VendorCode) && input.VendorProcessingTypeCode !== "DIRECT") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The configured Direct Payment Vendor must retain Direct processing type."); }
            return {
                VendorName: VMS.Utilities.collapseWhitespace(input.VendorName),
                Email: validated.emails,
                PhoneNumber: phone,
                RequestedBy: requester ? { id: requester.ID, title: requester.UserName, email: requester.Email } : null,
                Country: { id: country.ID, title: country.CountryName },
                City: { id: city.ID, title: city.CityName },
                Category: resolvedCategories,
                PostalCode: VMS.Utilities.trim(input.PostalCode),
                Address: VMS.Utilities.trim(input.Address),
                VendorClassificationCode: input.VendorClassificationCode,
                VendorProcessingTypeCode: input.VendorProcessingTypeCode,
                DisplayName: VMS.Utilities.collapseWhitespace(input.VendorName) + (record.VendorCode ? " - " + record.VendorCode : "")
            };
        });
    };

    VendorService.prototype._validateAdministrativeState = function (record, patch) {
        var stage = patch.StageCode || record.StageCode;
        var status = patch.StatusCode || record.StatusCode;
        var evaluation = patch.EvaluationResultCode || record.EvaluationResultCode;
        var interview = patch.InterviewResultCode || record.InterviewResultCode;
        var pairStatus = { DOCUMENT_EVALUATION: "IN_PROGRESS", INTERVIEW: "IN_PROGRESS", APPROVED: "APPROVED", REJECTED: "REJECTED", EXPIRED: "EXPIRED" };
        var validResults = ["PENDING", "PASSED", "FAILED"];
        var valid = pairStatus[stage] === status && $.inArray(evaluation, validResults) >= 0 && $.inArray(interview, validResults) >= 0;
        if (valid && stage === "DOCUMENT_EVALUATION") { valid = evaluation === "PENDING" && interview === "PENDING"; }
        if (valid && stage === "INTERVIEW") { valid = evaluation === "PASSED" && interview === "PENDING"; }
        if (valid && stage === "APPROVED") { valid = evaluation === "PASSED" && interview === "PASSED" && !!VMS.Utilities.trim(record.VendorCode) && !isNaN(Date.parse(record.RecordDate)); }
        if (valid && stage === "REJECTED") { valid = (evaluation === "FAILED" && interview === "PENDING") || (evaluation === "PASSED" && interview === "FAILED"); }
        if (valid && stage === "EXPIRED") { valid = (evaluation === "PENDING" && interview === "PENDING") || (evaluation === "PASSED" && interview === "PENDING"); }
        if (!valid) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The corrected Vendor workflow values do not form a valid canonical state."); }
        return $.Deferred().resolve({ StageCode: stage, StatusCode: status, EvaluationResultCode: evaluation, InterviewResultCode: interview }).promise();
    };

    VendorService.prototype.UpdateOnboarding = function (id, expectedEtag, patch, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var target;
        if (!expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "A current record version is required for this correction."); }
        return this._authorizeAction("VENDOR_EVALUATE").then(function (user) { actor = user; return self.repositories.vendors.getById(id); }).then(function (value) {
            record = value;
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, record, "VENDOR_EVALUATE");
        }).then(function () {
            if (record._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "This record changed after it was loaded."); }
            return H.validateStage(record, "DOCUMENT_EVALUATION", "IN_PROGRESS");
        }).then(function () { return self._resolveBusinessCorrection(record, patch); }).then(function (value) {
            target = value;
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "VENDOR_ONBOARDING_UPDATE", entityTypeCode: "VENDOR", entityItemId: id, businessKey: "VND-" + id, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, changedFields: { before: record, after: target }, successMessage: "Vendor onboarding details were updated." }, function () {
                return self.repositories.vendors.update(id, target, expectedEtag, H.actorContext(actor));
            });
        });
    };

    VendorService.prototype.ReplaceOnboardingAttachments = function (id, expectedEtag, files, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var errors = [];
        VMS.ValidationService.attachments(files, ["pdf", "xlsx", "docx"], false, "Attachments", errors);
        if (errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the Vendor attachments.", errors); }
        if (!expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "A current record version is required for this attachment correction."); }
        return this._authorizeAction("VENDOR_EVALUATE").then(function (user) { actor = user; return self.repositories.vendors.getById(id); }).then(function (value) {
            record = value;
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, record, "VENDOR_EVALUATE");
        }).then(function () {
            if (record._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "This record changed after it was loaded."); }
            return H.validateStage(record, "DOCUMENT_EVALUATION", "IN_PROGRESS");
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "VENDOR_ONBOARDING_ATTACHMENTS", entityTypeCode: "VENDOR", entityItemId: id, businessKey: "VND-" + id, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, changedFields: { before: { Attachments: record.Attachments || [] }, after: { Attachments: files || [] } }, successMessage: "Vendor onboarding attachments were updated." }, function () {
                return self.repositories.vendors.replaceAttachments(id, files || [], expectedEtag, H.actorContext(actor));
            });
        });
    };

    VendorService.prototype.GetOnboardingAttachmentItem = function (id) {
        var self = this;
        return this._authorizeAction("VENDOR_EVALUATE").then(function () { return self.repositories.vendors.getById(id); }).then(function (record) {
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.VENDOR, record, "VENDOR_EVALUATE");
        }).then(function (context) {
            return H.validateStage(context.record, "DOCUMENT_EVALUATION", "IN_PROGRESS");
        }).then(function (record) {
            return self.repositories.vendors.getAttachments(record.ID).then(function (attachments) { return { record: record, attachments: attachments }; });
        });
    };

    VendorService.prototype.AdminUpdate = function (id, expectedEtag, patch, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var businessTarget;
        var workflowTarget;
        var target;
        var administrativeReason = VMS.Utilities.trim(patch.AdministrativeReason);
        if (!administrativeReason) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An administrative reason is required."); }
        if (patch.Confirmed !== true) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Confirm the administrative correction before saving."); }
        if (!expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "A current record version is required for this correction."); }
        return this._authorizeAction("ADMIN_VENDOR_UPDATE").then(function (user) { actor = user; return self.repositories.vendors.getById(id); }).then(function (value) {
            record = value;
            if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested Vendor is unavailable."); }
            if (record._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "This record changed after it was loaded."); }
            return $.when(self._resolveBusinessCorrection(record, patch), self._validateAdministrativeState(record, patch));
        }).then(function (business, workflow) {
            businessTarget = business;
            workflowTarget = workflow;
            target = $.extend({}, businessTarget, workflowTarget);
            if (workflowTarget.StageCode === "REJECTED" || workflowTarget.StageCode === "EXPIRED") { target.RejectionReason = administrativeReason; }
            else { target.RejectionReason = ""; }
            if (workflowTarget.StageCode === "APPROVED") {
                return self.repositories.vendors.getByKey(VMS.Utilities.normalizeKey(record.VendorCode)).then(function (duplicate) {
                    if (duplicate && duplicate.ID !== record.ID) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Vendor Code is already in use."); }
                });
            }
        }).then(function () {
            return H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE");
        }).then(function (directSetting) {
            if (VMS.Utilities.normalizeKey(directSetting.TextValue) === VMS.Utilities.normalizeKey(record.VendorCode) && (target.StageCode !== "APPROVED" || target.StatusCode !== "APPROVED" || record.IsActive !== true || target.VendorProcessingTypeCode !== "DIRECT")) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The configured Direct Payment Vendor must remain active, approved, and use Direct processing type.");
            }
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_VENDOR_UPDATE", entityTypeCode: "VENDOR", entityItemId: id, businessKey: record.VendorCode || "VND-" + id, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: target.StageCode, toStatusCode: target.StatusCode, comment: administrativeReason, changedFields: { before: record, after: target }, successMessage: "Vendor details were updated." }, function () {
                return self.repositories.vendors.update(id, target, expectedEtag, H.actorContext(actor));
            });
        });
    };

    VendorService.prototype.SetActive = function (id, expectedEtag, isActive, reason, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var administrativeReason = VMS.Utilities.trim(reason);
        if (!administrativeReason) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An administrative reason is required."); }
        return this._authorizeAction("ADMIN_VENDOR_ACTIVE").then(function (user) {
            actor = user;
            return self.repositories.vendors.getById(id);
        }).then(function (value) {
            record = value;
            if (!record || record.StageCode !== "APPROVED" || record.StatusCode !== "APPROVED") {
                return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Only an approved Vendor can be activated or deactivated.");
            }
            if (record.IsActive === (isActive === true)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The Vendor already has the requested activation state."); }
            if (isActive !== true) {
                return $.when(
                    H.queryAll(self.repositories.prpo, { filters: [{ field: "Vendor.id", op: "eq", value: record.ID }, { field: "StageCode", op: "in", value: ["MANAGER_REVIEW", "UPDATE_REQUIRED", "PENDING_GPS"] }] }),
                    H.queryAll(self.repositories.poLines, { filters: [{ field: "VendorCodeSnapshot", op: "eq", value: record.VendorCode }, { field: "IsActive", op: "eq", value: true }, { field: "IsCancelled", op: "eq", value: false }, { field: "POLineStatusCode", op: "in", value: ["ACTIVE", "THRESHOLD_REACHED"] }] }),
                    H.queryAll(self.repositories.invoices, { filters: [{ field: "Vendor.id", op: "eq", value: record.ID }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "IsActive", op: "eq", value: true }] }),
                    H.queryAll(self.repositories.feedbackAssignments, { filters: [{ field: "Vendor.id", op: "eq", value: record.ID }, { field: "AssignmentStatusCode", op: "eq", value: "OPEN" }, { field: "IsActive", op: "eq", value: true }] }),
                    H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE")
                ).then(function (prpo, lines, invoices, assignments, setting) {
                    var remainingLine = $.grep(lines, function (line) { return Number(line.RemainingBalance) > 0; });
                    if (prpo.length || remainingLine.length || invoices.length || assignments.length || VMS.Utilities.normalizeKey(setting.TextValue) === VMS.Utilities.normalizeKey(record.VendorCode)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Vendor deactivation is blocked by active operational references or Direct Payment configuration."); }
                });
            }
            return $.when(
                self.repositories.countries.getById(VMS.Utilities.lookupId(record.Country)),
                self.repositories.cities.getById(VMS.Utilities.lookupId(record.City)),
                H.queryAll(self.repositories.categories, { filters: [{ field: "ID", op: "in", value: VMS.Utilities.lookupIds(record.Category || []) }, { field: "IsActive", op: "eq", value: true }] }),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["VENDOR_CLASSIFICATION", "VENDOR_PROCESSING_TYPE"] }, { field: "IsActive", op: "eq", value: true }] }),
                H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE")
            ).then(function (country, city, categories, configuration, setting) {
                var errors = [];
                var classificationValid = $.grep(configuration, function (item) { return item.GroupCode === "VENDOR_CLASSIFICATION" && item.ItemCode === record.VendorClassificationCode; }).length === 1;
                var processingValid = $.grep(configuration, function (item) { return item.GroupCode === "VENDOR_PROCESSING_TYPE" && item.ItemCode === record.VendorProcessingTypeCode; }).length === 1;
                VMS.ValidationService.emailList(record.Email, "Email", errors);
                VMS.ValidationService.phone(record.PhoneNumber, country && country.PhoneCode, "PhoneNumber", errors);
                if (!country || country.IsActive !== true || !city || city.IsActive !== true || VMS.Utilities.lookupId(city.Country) !== country.ID || !categories.length || categories.length !== VMS.Utilities.lookupIds(record.Category || []).length || !classificationValid || !processingValid || errors.length || (VMS.Utilities.normalizeKey(setting.TextValue) === VMS.Utilities.normalizeKey(record.VendorCode) && record.VendorProcessingTypeCode !== "DIRECT")) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The Vendor no longer satisfies current master-data requirements for reactivation."); }
            });
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: isActive ? "VENDOR_REACTIVATE" : "VENDOR_DEACTIVATE", entityTypeCode: "VENDOR", entityItemId: id, businessKey: record.VendorCode, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, comment: administrativeReason, changedFields: { before: { IsActive: record.IsActive }, after: { IsActive: isActive === true } }, countsAsCompletedAction: false, successMessage: "Vendor activation was updated." }, function () {
                return self.repositories.vendors.update(id, { IsActive: isActive === true }, expectedEtag || record._etag, H.actorContext(actor));
            });
        });
    };

    VMS.VendorService = VendorService;
}(window, window.jQuery));
