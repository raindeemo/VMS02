(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function PRPOService(repositories, accessService, mutationRunner) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
    }

    PRPOService.prototype._authorize = function (actionCode) {
        var self = this;
        return this.accessService.ResolveCurrentUser().then(function (user) {
            if (!self.accessService.CanPerform(user, actionCode, {})) {
                return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "You are not authorized to perform this PR/PO action.");
            }
            return user;
        });
    };

    PRPOService.prototype.GetCreationLookups = function () {
        var self = this;
        return this._authorize("PRPO_CREATE").then(function () {
            return $.when(
                H.queryAll(self.repositories.vendors, { filters: [{ field: "StageCode", op: "eq", value: "APPROVED" }, { field: "StatusCode", op: "eq", value: "APPROVED" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "VendorName", direction: "ASC" }] }),
                H.queryAll(self.repositories.currencies, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "CurrencyCode", direction: "ASC" }] })
            );
        }).then(function (vendors, currencies) { return { vendors: vendors, currencies: currencies }; });
    };

    PRPOService.prototype.GetActionItem = function (id, actionCode) {
        var self = this;
        return this._authorize(actionCode).then(function () { return self.repositories.prpo.getById(id); }).then(function (record) {
            if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested PR/PO is unavailable."); }
            return record;
        });
    };

    PRPOService.prototype.Query = function (querySpec) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.PRPO_REGISTER).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PR_PO, "REGISTER");
        }).then(function (context) {
            return self.repositories.prpo.query($.extend(true, {}, querySpec || {}, { authorizationScope: context.scope }));
        });
    };

    PRPOService.prototype.Get = function (id, key) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.PRPO_REGISTER).then(function () {
            return self.repositories.prpo.getById(id);
        }).then(function (record) {
            return H.verifyDeepLink(record, id, key, record ? record.PRNumber : "");
        }).then(function (record) {
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.PR_PO, record, "READ");
        }).then(function (value) { return value.record; });
    };

    PRPOService.prototype._validateReferences = function (record) {
        var self = this;
        return $.when(self.repositories.vendors.getById(VMS.Utilities.lookupId(record.Vendor)), self.repositories.currencies.getById(VMS.Utilities.lookupId(record.Currency))).then(function (vendor, currency) {
            if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The referenced Vendor is no longer active and approved."); }
            if (!currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The referenced Currency is no longer active and valid."); }
            return { vendor: vendor, currency: currency };
        });
    };

    PRPOService.prototype.Create = function (input, actionRequestId) {
        var self = this;
        var actor;
        var errors = [];
        var amount;
        VMS.ValidationService.required(input.PRNumber, "PRNumber", "PR Number", errors);
        amount = VMS.ValidationService.positiveMoney(input.PRAmount, "PRAmount", "PR Amount", errors);
        if (!input.Vendor || !input.Currency) {
            errors.push(VMS.ValidationService.error("Vendor", "REQUIRED", "Vendor and Currency are required."));
        }
        if (errors.length) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted PR/PO fields.", errors);
        }
        return this._authorize("PRPO_CREATE").then(function (user) {
            actor = user;
            return $.when(
                self.repositories.prpo.getByKey(VMS.Utilities.collapseWhitespace(input.PRNumber)),
                self.repositories.vendors.getById(VMS.Utilities.lookupId(input.Vendor)),
                self.repositories.currencies.getById(VMS.Utilities.lookupId(input.Currency))
            );
        }).then(function (duplicate, vendor, currency) {
            if (duplicate) {
                return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "PR Number is already in use.");
            }
            if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED") {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active approved Vendor.");
            }
            if (!currency || currency.IsActive !== true) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active Currency.");
            }
            return self.mutationRunner.Run({
                actionRequestId: actionRequestId,
                actionCode: "PRPO_CREATE",
                entityTypeCode: VMS.Constants.ENTITY_TYPES.PR_PO,
                businessKey: VMS.Utilities.collapseWhitespace(input.PRNumber),
                toStageCode: "MANAGER_REVIEW",
                toStatusCode: "IN_PROGRESS",
                successCode: "PRPO_CREATED",
                successMessage: "PR/PO request was submitted for Manager review."
            }, function () {
                return self.repositories.prpo.create({
                    PRNumber: VMS.Utilities.collapseWhitespace(input.PRNumber),
                    Vendor: { id: vendor.ID, title: vendor.DisplayName },
                    VendorCodeSnapshot: vendor.VendorCode,
                    VendorNameSnapshot: vendor.VendorName,
                    PRAmount: amount,
                    Description: VMS.Utilities.trim(input.Description),
                    Currency: { id: currency.ID, title: currency.CurrencyCode },
                    WorkflowApproved: false,
                    PONumber: "",
                    PONumberNormalizedKey: "",
                    RejectionReason: "",
                    StageCode: "MANAGER_REVIEW",
                    StatusCode: "IN_PROGRESS",
                    CreationDate: VMS.ClockService.utcNow(),
                    WorkflowApprovalDate: null,
                    POCreationDate: null,
                    IsActive: true
                }, H.actorContext(actor));
            }, function (created) {
                return { eventCode: "PR_CREATED", context: { record: created } };
            });
        });
    };

    PRPOService.prototype._managerDecision = function (id, expectedEtag, actionCode, reason, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var targets = {
            PRPO_APPROVE: { stage: "PENDING_GPS", status: "IN_PROGRESS", approved: true, message: "PR/PO request was approved." },
            PRPO_RETURN: { stage: "UPDATE_REQUIRED", status: "IN_PROGRESS", approved: false, message: "PR/PO request was returned for update." },
            PRPO_REJECT: { stage: "REJECTED", status: "REJECTED", approved: false, message: "PR/PO request was rejected." }
        };
        var target = targets[actionCode];
        if ((actionCode === "PRPO_RETURN" || actionCode === "PRPO_REJECT") && !VMS.Utilities.trim(reason)) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "A reason is required.", [VMS.ValidationService.error("reason", "REQUIRED", "Enter a reason.")]);
        }
        return this._authorize(actionCode).then(function (user) {
            actor = user;
            return self.repositories.prpo.getById(id);
        }).then(function (value) {
            record = value;
            return self.accessService.AuthorizeRecord(VMS.Constants.ENTITY_TYPES.PR_PO, record, actionCode);
        }).then(function () {
            return H.validateStage(record, "MANAGER_REVIEW", "IN_PROGRESS");
        }).then(function () {
            return self._validateReferences(record);
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: actionCode, entityTypeCode: "PR_PO", entityItemId: id, businessKey: record.PRNumber, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: target.stage, toStatusCode: target.status, comment: VMS.Utilities.trim(reason), successMessage: target.message }, function () {
                return self.repositories.prpo.update(id, {
                    StageCode: target.stage,
                    StatusCode: target.status,
                    WorkflowApproved: target.approved,
                    WorkflowApprovalDate: target.approved ? VMS.ClockService.utcNow() : record.WorkflowApprovalDate,
                    RejectionReason: target.approved ? "" : VMS.Utilities.trim(reason)
                }, expectedEtag || record._etag, H.actorContext(actor));
            }, function (updated) {
                var eventCode = actionCode === "PRPO_APPROVE" ? "PR_APPROVED" : (actionCode === "PRPO_RETURN" ? "PR_UPDATE_REQUIRED" : "PR_REJECTED");
                return { eventCode: eventCode, context: { record: updated } };
            });
        });
    };

    PRPOService.prototype.Approve = function (id, expectedEtag, actionRequestId) { return this._managerDecision(id, expectedEtag, "PRPO_APPROVE", "", actionRequestId); };
    PRPOService.prototype.ReturnForUpdate = function (id, expectedEtag, reason, actionRequestId) { return this._managerDecision(id, expectedEtag, "PRPO_RETURN", reason, actionRequestId); };
    PRPOService.prototype.Reject = function (id, expectedEtag, reason, actionRequestId) { return this._managerDecision(id, expectedEtag, "PRPO_REJECT", reason, actionRequestId); };

    PRPOService.prototype.SaveUpdateRequiredCorrection = function (id, expectedEtag, patch, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var vendor;
        var currency;
        var prNumber = VMS.Utilities.collapseWhitespace(patch.PRNumber);
        var amount;
        return this._authorize("PRPO_CREATE").then(function (user) {
            actor = user;
            return self.repositories.prpo.getById(id);
        }).then(function (value) {
            record = value;
            return H.validateStage(record, "UPDATE_REQUIRED", "IN_PROGRESS");
        }).then(function () {
            var errors = [];
            VMS.ValidationService.required(prNumber, "PRNumber", "PR Number", errors);
            amount = VMS.ValidationService.positiveMoney(patch.PRAmount, "PRAmount", "PR Amount", errors);
            if (!patch.Vendor || !patch.Currency) { errors.push(VMS.ValidationService.error("Vendor", "REQUIRED", "Vendor and Currency are required.")); }
            if (errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted PR/PO fields.", errors); }
            return $.when(self.repositories.prpo.getByKey(prNumber), self.repositories.vendors.getById(VMS.Utilities.lookupId(patch.Vendor)), self.repositories.currencies.getById(VMS.Utilities.lookupId(patch.Currency)));
        }).then(function (duplicate, vendorValue, currencyValue) {
            vendor = vendorValue;
            currency = currencyValue;
            if (duplicate && duplicate.ID !== record.ID) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "PR Number is already in use."); }
            if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active approved Vendor."); }
            if (!currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active valid Currency."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PRPO_SAVE_CORRECTION", entityTypeCode: "PR_PO", entityItemId: id, businessKey: record.PRNumber, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, successMessage: "PR/PO correction was saved." }, function () {
                return self.repositories.prpo.update(id, { PRNumber: prNumber, Vendor: { id: vendor.ID, title: vendor.DisplayName }, VendorCodeSnapshot: vendor.VendorCode, VendorNameSnapshot: vendor.VendorName, PRAmount: amount, Currency: { id: currency.ID, title: currency.CurrencyCode }, Description: VMS.Utilities.trim(patch.Description), WorkflowApproved: false }, expectedEtag || record._etag, H.actorContext(actor));
            });
        });
    };

    PRPOService.prototype.Resubmit = function (id, expectedEtag, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("PRPO_CREATE").then(function (user) {
            actor = user;
            return self.repositories.prpo.getById(id);
        }).then(function (value) {
            record = value;
            return H.validateStage(record, "UPDATE_REQUIRED", "IN_PROGRESS");
        }).then(function () {
            return $.when(self.repositories.prpo.getByKey(record.PRNumber), self._validateReferences(record));
        }).then(function (duplicate) {
            if (duplicate && duplicate.ID !== record.ID) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "PR Number is already in use."); }
            if (!isFinite(Number(record.PRAmount)) || Number(record.PRAmount) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The corrected PR Amount is invalid."); }
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PRPO_RESUBMIT", entityTypeCode: "PR_PO", entityItemId: id, businessKey: record.PRNumber, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "MANAGER_REVIEW", toStatusCode: "IN_PROGRESS", successMessage: "PR/PO request was resubmitted." }, function () {
                return self.repositories.prpo.update(id, { StageCode: "MANAGER_REVIEW", StatusCode: "IN_PROGRESS", RejectionReason: "", VendorCodeSnapshot: record.VendorCodeSnapshot, VendorNameSnapshot: record.VendorNameSnapshot }, expectedEtag || record._etag, H.actorContext(actor));
            }, function (updated) {
                return { eventCode: "PR_RESUBMITTED", context: { record: updated } };
            });
        });
    };

    PRPOService.prototype.CreatePOAndInitialLine = function (id, expectedEtag, payload, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var amount = Number(payload.POLineAmount);
        var poNumber = VMS.Utilities.collapseWhitespace(payload.PONumber);
        var createdLine;
        var updatedHeader;
        return this._authorize("PO_CREATE").then(function (user) {
            actor = user;
            return self.repositories.prpo.getById(id);
        }).then(function (value) {
            record = value;
            return H.validateStage(record, "PENDING_GPS", "IN_PROGRESS");
        }).then(function () {
            if (!poNumber || !isFinite(amount) || amount <= 0 || amount > Number(record.PRAmount)) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a unique PO Number and a Line amount no greater than the PR Amount.");
            }
            return $.when(
                H.queryAll(self.repositories.prpo, { filters: [{ field: "PONumberNormalizedKey", op: "eq", value: VMS.Utilities.normalizeKey(poNumber) }] }),
                H.setting(self.repositories, "THRESHOLD_PERCENTAGE"),
                self._validateReferences(record),
                H.queryAll(self.repositories.poLines, { filters: [{ field: "POHeader.id", op: "eq", value: record.ID }, { field: "POLineNumber", op: "eq", value: "10" }] })
            );
        }).then(function (duplicates, setting, references, firstLines) {
            var threshold = Number(setting.NumericValue);
            if (duplicates.length) {
                return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "PO Number is already in use.");
            }
            if (firstLines.length) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The initial PO Line slot is already reserved and requires reconciliation."); }
            if (!isFinite(threshold) || threshold <= 0 || threshold > 100) {
                return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "PO Line threshold configuration is invalid.");
            }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PO_CREATE_INITIAL_LINE", entityTypeCode: "PR_PO", entityItemId: id, businessKey: record.PRNumber, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "PO_ACTIVE", toStatusCode: "APPROVED", successMessage: "PO and initial Line were created." }, function () {
                return self.repositories.poLines.create({
                    POHeader: { id: record.ID, title: record.PRNumber },
                    VendorCodeSnapshot: record.VendorCodeSnapshot,
                    PONumber: poNumber,
                    POLineNumber: "10",
                    POLineKey: poNumber + "-10",
                    IsInitialLine: true,
                    LineRequestStageCode: "ACTIVE",
                    LineRequestStatusCode: "APPROVED",
                    POLineAmount: VMS.Utilities.roundHalfAwayFromZero(amount, 2),
                    ConsumedAmount: 0,
                    RemainingBalance: VMS.Utilities.roundHalfAwayFromZero(amount, 2),
                    ThresholdPercentage: threshold,
                    ThresholdAmount: VMS.Utilities.roundHalfAwayFromZero(amount * threshold / 100, 2),
                    AlertActivation: true,
                    LastAlertDate: null,
                    POLineStatusCode: "ACTIVE",
                    IsCancelled: false,
                    CancellationReason: "",
                    IsActive: false
                }, H.actorContext(actor)).then(function (line) {
                    createdLine = line;
                    return self.repositories.prpo.update(id, { PONumber: poNumber, PONumberNormalizedKey: VMS.Utilities.normalizeKey(poNumber), StageCode: "PO_ACTIVE", StatusCode: "APPROVED", POCreationDate: VMS.ClockService.utcNow() }, expectedEtag || record._etag, H.actorContext(actor)).then(function (header) {
                        updatedHeader = header;
                        return self.repositories.poLines.update(line.ID, { IsActive: true }, line._etag, H.actorContext(actor)).then(function (activatedLine) {
                            header.initialLine = activatedLine;
                            header.affectedItemIds = [header.ID, activatedLine.ID];
                            return header;
                        });
                    });
                }).then(null, function (error) {
                    if (!createdLine) { return $.Deferred().reject(error).promise(); }
                    if (!updatedHeader) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The PO initial-Line operation requires reconciliation before it can be retried."); }
                    return self.repositories.prpo.update(id, { PONumber: "", PONumberNormalizedKey: "", StageCode: "PENDING_GPS", StatusCode: "IN_PROGRESS", POCreationDate: null }, updatedHeader._etag, H.actorContext(actor)).then(function () {
                        return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The inactive initial-Line reservation requires reconciliation before PO creation can continue.");
                    }, function () {
                        return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The PO initial-Line operation could not be compensated and requires reconciliation.");
                    });
                });
            }, function (header) {
                return { eventCode: "PO_INITIAL_LINE_CREATED", context: { record: header.initialLine, header: header } };
            });
        });
    };

    PRPOService.prototype.AdminUpdate = function (id, expectedEtag, patch, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var vendor;
        var currency;
        var beforeFinal;
        var administrativeReason = VMS.Utilities.trim(patch.AdministrativeReason);
        var target;
        var errors = [];
        var prNumber;
        var amount;
        if (!administrativeReason) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An administrative reason is required."); }
        if (patch.Confirmed !== true) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Confirm the administrative correction before saving."); }
        if (!expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "A current record version is required for this correction."); }
        return this._authorize("ADMIN_PRPO_UPDATE").then(function (user) { actor = user; return self.repositories.prpo.getById(id); }).then(function (value) {
            record = value;
            if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested record is unavailable."); }
            if (record._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "This record changed after it was loaded."); }
            beforeFinal = (record.StageCode === "MANAGER_REVIEW" || record.StageCode === "UPDATE_REQUIRED") && record.StatusCode === "IN_PROGRESS" && record.WorkflowApproved !== true;
            if (beforeFinal) {
                prNumber = VMS.Utilities.collapseWhitespace(patch.PRNumber);
                VMS.ValidationService.required(prNumber, "PRNumber", "PR Number", errors);
                amount = VMS.ValidationService.positiveMoney(patch.PRAmount, "PRAmount", "PR Amount", errors);
                if (!patch.Vendor || !patch.Currency) { errors.push(VMS.ValidationService.error("Vendor", "REQUIRED", "Vendor and Currency are required.")); }
                if (errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted PR/PO fields.", errors); }
                return $.when(self.repositories.prpo.getByKey(prNumber), self.repositories.vendors.getById(VMS.Utilities.lookupId(patch.Vendor)), self.repositories.currencies.getById(VMS.Utilities.lookupId(patch.Currency))).then(function (duplicate, vendorValue, currencyValue) {
                    vendor = vendorValue;
                    currency = currencyValue;
                    if (duplicate && duplicate.ID !== record.ID) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "PR Number is already in use."); }
                    if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active approved Vendor."); }
                    if (!currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active valid Currency."); }
                    target = {
                        PRNumber: prNumber,
                        Vendor: { id: vendor.ID, title: vendor.DisplayName },
                        VendorCodeSnapshot: vendor.VendorCode,
                        VendorNameSnapshot: vendor.VendorName,
                        PRAmount: amount,
                        Currency: { id: currency.ID, title: currency.CurrencyCode },
                        Description: VMS.Utilities.trim(patch.Description)
                    };
                });
            }
            target = { Description: VMS.Utilities.trim(patch.Description) };
        }).then(function () {
            var changedFields = { before: {}, after: {} };
            $.each(target, function (field, value) {
                changedFields.before[field] = record[field];
                changedFields.after[field] = value;
            });
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_PRPO_UPDATE", entityTypeCode: "PR_PO", entityItemId: id, businessKey: record.PRNumber, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, comment: administrativeReason, changedFields: changedFields, successMessage: "PR/PO metadata was updated." }, function () {
                return self.repositories.prpo.update(id, target, expectedEtag, H.actorContext(actor));
            });
        });
    };

    PRPOService.prototype.GetRegisterSummary = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.PRPO_REGISTER).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PR_PO, "SUMMARY");
        }).then(function (context) {
            return $.when(H.queryAll(self.repositories.prpo, { authorizationScope: context.scope }), H.queryAll(self.repositories.currencies, {}));
        }).then(function (records, currencies) {
            var rates = {};
            var amounts = [];
            $.each(currencies, function (_, currency) { rates[currency.ID] = Number(currency.ConversionRateToSAR); });
            $.each(records, function (_, record) {
                var rate = rates[VMS.Utilities.lookupId(record.Currency)];
                var calculated;
                if (!isFinite(rate) || rate <= 0) { throw { code: VMS.Constants.ERRORS.CONFIGURATION_INVALID, safeMessage: "The total is unavailable because a Currency rate is invalid." }; }
                calculated = VMS.FinancialCalculationService.calculate({ TotalPrice: record.PRAmount, ConversionRateUsed: rate, HasDiscount: false, HasVAT: false });
                if (!calculated.valid) { throw { code: VMS.Constants.ERRORS.CONFIGURATION_INVALID, safeMessage: "The total is unavailable because a PR amount or Currency rate is invalid." }; }
                amounts.push(calculated.values.TotalPriceInSAR);
            });
            return { totalPRs: records.length, totalAmountSAR: VMS.FinancialCalculationService.sumMoney(amounts) || 0 };
        });
    };

    VMS.PRPOService = PRPOService;
}(window, window.jQuery));
