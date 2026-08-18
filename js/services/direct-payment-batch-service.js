(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;
    var BATCH_MEMBER_FIELDS = ["ID", "InvoiceIdentifier", "InvoiceSourceFunctionCode", "InvoiceNumber", "VendorInvoiceKey", "POLine", "POLineKeySnapshot", "Vendor", "VendorCodeSnapshot", "VendorNameSnapshot", "VendorEmailSnapshot", "VendorCountrySnapshot", "Category", "RegionCode", "FocalPointName", "FocalPointEmail", "ManagedByCode", "ClassStartDate", "ClassEndDate", "ClassCode1", "ClassCode2", "ClassCode3", "MEALearnerCount", "GlobalLearnerCount", "StudentCount", "DirectPayment", "AdvancePayment", "Comment", "SESNumber", "SESDate", "CostCenter", "Currency", "CurrencyCodeSnapshot", "ConversionRateUsed", "ConversionRateModifiedDate", "TotalPrice", "TotalPriceInSAR", "HasDiscount", "DiscountInputTypeCode", "DiscountInputValue", "DiscountAmount", "NetAmountBeforeVAT", "HasVAT", "VATInputTypeCode", "VATInputValue", "VATAmount", "VATAmountInSAR", "FinalInvoiceAmount", "FinalInvoiceAmountInSAR", "WorkflowApproved", "RejectionReasonCode", "RejectionComment", "EBillingSettlement", "LMSSettlement", "DirectPaymentCompleted", "DirectPaymentDate", "DirectPaymentConfirmedBy", "AggregationPeriod", "AggregationBatchKey", "AggregationReleaseDate", "AggregationReleasedBy", "StageCode", "StatusCode", "InvoiceInitiationDate", "ProcessingDate", "WorkflowApprovalDate", "ChargebackDate", "SettlementDate", "BatchVersion", "BatchLockExpiresAt", "BatchOperationStateCode", "IsActive", "CreatedBy", "Created", "Modified", "_etag"];

    function DirectPaymentBatchService(repositories, accessService, mutationRunner, poLineService) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
        this.poLineService = poLineService;
    }

    DirectPaymentBatchService.prototype._authorize = function (actionCode, record) {
        var self = this;
        return this.accessService.ResolveCurrentUser().then(function (user) {
            if (!self.accessService.CanPerform(user, actionCode, record || {})) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "You are not authorized to perform this Direct Payment batch action."); }
            return user;
        });
    };

    DirectPaymentBatchService.prototype.QueryReview = function (querySpec) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.DIRECT_PAYMENT_REVIEW).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "DIRECT_PAYMENT_REVIEW");
        }).then(function (context) {
            return self.repositories.invoices.query($.extend(true, {}, querySpec || {}, {
                filters: [
                    { field: "DirectPayment", op: "eq", value: true },
                    { field: "StageCode", op: "eq", value: "DIRECT_PAYMENT_REVIEW" },
                    { field: "StatusCode", op: "eq", value: "IN_PROGRESS" },
                    { field: "IsActive", op: "eq", value: true }
                ],
                authorizationScope: context.scope,
                select: ["ID", "InvoiceIdentifier", "InvoiceSourceFunctionCode", "Category", "FocalPointName", "InvoiceInitiationDate", "StageCode", "StatusCode", "IsActive", "_etag"]
            }));
        });
    };

    DirectPaymentBatchService.prototype.GetReviewItem = function (id) {
        var self = this;
        return this.accessService.AuthorizeOperation("DP_REVIEW_DONE").then(function () {
            return self.repositories.invoices.getById(id);
        }).then(function (record) {
            if (!record || record.DirectPayment !== true || record.StageCode !== "DIRECT_PAYMENT_REVIEW" || record.StatusCode !== "IN_PROGRESS" || record.IsActive !== true) {
                return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested Direct Payment Invoice is unavailable.");
            }
            return record;
        });
    };

    DirectPaymentBatchService.prototype.GetReviewOptions = function (id) {
        var self = this;
        return this.GetReviewItem(id).then(function (record) {
            return H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "INVOICE_REJECTION_REASON" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "SortOrder", direction: "ASC" }] }).then(function (reasons) {
                return { record: record, rejectionReasons: reasons };
            });
        });
    };

    DirectPaymentBatchService.prototype._queryBatch = function (batchKey, systemContext, select) {
        var self = this;
        var authorization = systemContext && systemContext.isScheduler === true ? $.Deferred().resolve({ scope: null }).promise() : this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.DIRECT_PAYMENT_BATCH).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "BATCH");
        }).then(function (context) {
            return context;
        });
        return authorization.then(function (context) {
            var spec = { filters: [{ field: "AggregationBatchKey", op: "eq", value: batchKey }, { field: "DirectPayment", op: "eq", value: true }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "ID", direction: "ASC" }] };
            if (context.scope) { spec.authorizationScope = context.scope; }
            if (select) { spec.select = select; }
            return H.queryAll(self.repositories.invoices, spec);
        }).then(function (members) {
            if (!members.length) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested Direct Payment batch is unavailable."); }
            return members;
        });
    };

    DirectPaymentBatchService.prototype.GetBuffer = function (period) {
        var self = this;
        return this._authorize("DP_BATCH_RELEASE", {}).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "BATCH");
        }).then(function (context) {
            return self.repositories.invoices.query({ filters: [{ field: "AggregationPeriod", op: "eq", value: period }, { field: "StageCode", op: "eq", value: "PAYMENT_AGGREGATION" }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "ID", direction: "ASC" }], pageSize: 10000, authorizationScope: context.scope, select: ["ID", "AggregationPeriod", "AggregationBatchKey", "Vendor", "VendorCodeSnapshot", "VendorNameSnapshot", "StageCode", "StatusCode", "AggregationReleaseDate", "BatchVersion", "BatchOperationStateCode", "BatchLockExpiresAt", "IsActive", "_etag"] });
        });
    };

    DirectPaymentBatchService.prototype.QueryBuffers = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.DIRECT_PAYMENT_BATCH).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "BATCH");
        }).then(function (context) {
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "DirectPayment", op: "eq", value: true }, { field: "StageCode", op: "eq", value: "PAYMENT_AGGREGATION" }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "IsActive", op: "eq", value: true }], authorizationScope: context.scope, sort: [{ field: "AggregationPeriod", direction: "ASC" }, { field: "ID", direction: "ASC" }], select: ["ID", "AggregationBatchKey", "AggregationPeriod", "VendorNameSnapshot", "BatchVersion"] });
        }).then(function (rows) {
            var groups = {};
            var output = [];
            $.each(rows, function (_, row) {
                if (!groups[row.AggregationBatchKey]) {
                    groups[row.AggregationBatchKey] = { batchKey: row.AggregationBatchKey, period: row.AggregationPeriod, leaderId: row.ID, invoiceCount: 0, vendorName: row.VendorNameSnapshot, version: Number(row.BatchVersion || 0) };
                    output.push(groups[row.AggregationBatchKey]);
                }
                groups[row.AggregationBatchKey].invoiceCount += 1;
            });
            return output;
        });
    };

    DirectPaymentBatchService.prototype.QueryReleasedBatches = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.DIRECT_PAYMENT_BATCH).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "BATCH");
        }).then(function (context) {
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "DirectPayment", op: "eq", value: true }, { field: "IsActive", op: "eq", value: true }, { field: "StageCode", op: "in", value: ["INVOICE_PROCESSING", "PENDING_APPROVAL", "CHARGEBACK_PROCESSING", "SETTLED", "REJECTED"] }], authorizationScope: context.scope, sort: [{ field: "AggregationReleaseDate", direction: "DESC" }, { field: "ID", direction: "ASC" }], select: ["ID", "AggregationBatchKey", "AggregationReleaseDate", "StageCode", "StatusCode", "CurrencyCodeSnapshot", "POLineKeySnapshot", "BatchOperationStateCode"] });
        }).then(function (rows) {
            var groups = {};
            var output = [];
            $.each(rows, function (_, row) {
                if (!groups[row.AggregationBatchKey]) {
                    groups[row.AggregationBatchKey] = { aggregationBatchKey: row.AggregationBatchKey, leaderId: row.ID, invoiceCount: 0, stageCode: row.StageCode, statusCode: row.StatusCode, currency: row.CurrencyCodeSnapshot, poLineKey: row.POLineKeySnapshot, operationStateCode: row.BatchOperationStateCode };
                    output.push(groups[row.AggregationBatchKey]);
                }
                groups[row.AggregationBatchKey].invoiceCount += 1;
            });
            return output;
        });
    };

    DirectPaymentBatchService.prototype.GetBatchPOLines = function (batchKey) {
        var self = this;
        var fixedVendorCode;
        var members;
        return this.accessService.AuthorizeOperation("DP_BATCH_PROCESS").then(function () {
            return self._queryBatch(batchKey);
        }).then(function (value) {
            members = value;
            if ($.grep(members, function (member) { return member.StageCode !== "INVOICE_PROCESSING" || member.StatusCode !== "IN_PROGRESS"; }).length) {
                return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "The batch PO Line can be selected only during grouped Invoice Processing.");
            }
            return self._authorize("DP_BATCH_PROCESS", members[0]);
        }).then(function () {
            return H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE");
        }).then(function (setting) {
            fixedVendorCode = VMS.Utilities.normalizeKey(setting.TextValue);
            return H.queryAll(self.repositories.poLines, { filters: [{ field: "VendorCodeSnapshot", op: "eq", value: setting.TextValue }, { field: "LineRequestStageCode", op: "eq", value: "ACTIVE" }, { field: "LineRequestStatusCode", op: "eq", value: "APPROVED" }, { field: "IsCancelled", op: "eq", value: false }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "POLineKey", direction: "ASC" }] });
        }).then(function (lines) {
            var eligible = $.grep(lines, function (line) { return VMS.Utilities.normalizeKey(line.VendorCodeSnapshot) === fixedVendorCode && $.inArray(line.POLineStatusCode, ["ACTIVE", "THRESHOLD_REACHED"]) >= 0 && Number(line.RemainingBalance) > 0; });
            var chain = $.Deferred().resolve().promise();
            var output = [];
            $.each(eligible, function (_, line) {
                chain = chain.then(function () {
                    return self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader)).then(function (header) {
                        if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || VMS.Utilities.normalizeKey(header.VendorCodeSnapshot) !== fixedVendorCode) { return null; }
                        return self.repositories.currencies.getById(VMS.Utilities.lookupId(header.Currency)).then(function (currency) {
                            if (!currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0) { return null; }
                            output.push($.extend({}, line, { CurrencyCode: currency.CurrencyCode }));
                        });
                    });
                });
            });
            return chain.then(function () { return output; });
        });
    };

    DirectPaymentBatchService.prototype.GetBatch = function (leaderId, batchKey) {
        var self = this;
        var user;
        var fields;
        return this.accessService.ResolveCurrentUser().then(function (value) {
            var canReadRestricted;
            user = value;
            fields = BATCH_MEMBER_FIELDS.slice(0);
            canReadRestricted = $.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) >= 0 || (user.FunctionCode === "VENDOR_MANAGEMENT" && $.inArray(user.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0 && user.IsDirectPaymentAuthorized === true);
            if (canReadRestricted) { fields.push("DirectInformation", "PaymentLink"); }
            if ($.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) >= 0) { fields.push("BatchOperationId"); }
            return self._queryBatch(batchKey, null, fields);
        }).then(function (members) {
            if (Number(members[0].ID) !== Number(leaderId)) { return H.reject(VMS.Constants.ERRORS.INVALID_LINK, "This Direct Payment batch link is invalid."); }
            return { leader: members[0], members: members, batchKey: batchKey, version: Number(members[0].BatchVersion || 0) };
        });
    };

    DirectPaymentBatchService.prototype._groupPatch = function (members, actor, expectedVersion, operationId, targetPatch, details, afterLock) {
        var self = this;
        var leader = members[0];
        var currentVersion = Number(leader.BatchVersion || 0);
        var nextVersion = currentVersion + 1;
        var lockExpires = new Date(new Date(VMS.ClockService.utcNow()).getTime() + 900000).toISOString();
        var affected = [];
        var payload = {
            version: 1,
            batchKey: leader.AggregationBatchKey,
            memberIds: $.map(members, function (member) { return member.ID; }),
            fromVersion: currentVersion,
            toVersion: nextVersion,
            target: targetPatch,
            details: details || {}
        };
        var chain = $.Deferred().resolve().promise();
        var sideEffectCompleted = false;
        if (currentVersion !== Number(expectedVersion)) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The Direct Payment batch changed after it was loaded."); }
        if (leader.BatchOperationStateCode === "RECOVERY_REQUIRED") { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "This Direct Payment batch requires controlled recovery."); }
        if (leader.BatchOperationStateCode === "PREPARED" && leader.BatchLockExpiresAt && new Date(leader.BatchLockExpiresAt).getTime() > new Date(VMS.ClockService.utcNow()).getTime()) { return H.reject(VMS.Constants.ERRORS.BATCH_LOCKED, "This Direct Payment batch is being processed by another action."); }
        return this.repositories.invoices.update(leader.ID, { BatchLockToken: operationId, BatchLockExpiresAt: lockExpires, BatchOperationStateCode: "PREPARED", BatchOperationId: operationId, BatchOperationPayloadJSON: JSON.stringify(payload) }, leader._etag, H.actorContext(actor)).then(function (lockedLeader) {
            var ordered = members.slice(1).concat([lockedLeader]);
            var lockedWork = afterLock ? afterLock(payload, lockedLeader) : $.Deferred().resolve().promise();
            return lockedWork.then(function () {
                sideEffectCompleted = afterLock ? true : false;
                $.each(ordered, function (_, member) {
                    chain = chain.then(function () {
                        var patch = $.extend({}, targetPatch, { BatchVersion: nextVersion });
                        if (member.ID === leader.ID) {
                            patch.BatchOperationStateCode = "COMMITTED";
                            patch.BatchLockToken = "";
                            patch.BatchLockExpiresAt = null;
                            patch.BatchOperationPayloadJSON = "";
                        }
                        return self.repositories.invoices.update(member.ID, patch, member._etag, H.actorContext(actor)).then(function (updated) { affected.push(updated); return updated; });
                    });
                });
                return chain;
            }).then(function () {
                    var finalLeader = affected[affected.length - 1];
                    finalLeader.affectedItemIds = $.map(members, function (member) { return member.ID; });
                    finalLeader.members = affected;
                    return finalLeader;
                });
        }).then(null, function (error) {
            if (error && $.inArray(error.code, [VMS.Constants.ERRORS.STALE_RECORD, VMS.Constants.ERRORS.INSUFFICIENT_PO_BALANCE, VMS.Constants.ERRORS.INVALID_STAGE, VMS.Constants.ERRORS.VALIDATION_FAILED]) >= 0 && affected.length === 0 && sideEffectCompleted === false) {
                return self.repositories.invoices.getById(leader.ID).then(function (freshLeader) {
                    if (!freshLeader || freshLeader.BatchOperationId !== operationId) { return H.reject(error.code, error.safeMessage); }
                    return self.repositories.invoices.update(leader.ID, { BatchOperationStateCode: "NONE", BatchOperationId: "", BatchOperationPayloadJSON: "", BatchLockToken: "", BatchLockExpiresAt: null }, freshLeader._etag, H.actorContext(actor)).then(function () { return H.reject(error.code, error.safeMessage); });
                });
            }
            return self.repositories.invoices.getById(leader.ID).then(function (freshLeader) {
                if (!freshLeader) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The group action requires controlled recovery before processing can continue."); }
                return self.repositories.invoices.update(leader.ID, { BatchOperationStateCode: "RECOVERY_REQUIRED", BatchLockToken: "", BatchLockExpiresAt: null }, freshLeader._etag, H.actorContext(actor));
            }).then(function () { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The group action requires controlled recovery before processing can continue."); });
        });
    };

    DirectPaymentBatchService.prototype.Release = function (period, expectedVersion, actionRequestId) {
        var self = this;
        var actor;
        var members;
        var fixedVendorCode;
        var batchKey = "DP-" + period;
        return this._authorize("DP_BATCH_RELEASE", {}).then(function (user) {
            actor = user;
            return H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE");
        }).then(function (setting) {
            fixedVendorCode = VMS.Utilities.normalizeKey(setting.TextValue);
            return self.GetBuffer(period);
        }).then(function (result) {
            members = result.items;
            if (!members.length) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "No releasable Direct Payment invoices exist for this period."); }
            if (period >= VMS.ClockService.formatRiyadh(VMS.ClockService.utcNow(), true).substring(0, 7)) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "A Direct Payment batch can be released only after its month has ended."); }
            if ($.grep(members, function (member) { return member.StageCode !== "PAYMENT_AGGREGATION" || member.StatusCode !== "IN_PROGRESS" || member.AggregationReleaseDate || VMS.Utilities.normalizeKey(member.VendorCodeSnapshot) !== fixedVendorCode || member.AggregationBatchKey !== batchKey; }).length) { return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "Every release member must be unreleased, eligible, and use the configured fixed Direct Payment Vendor and batch key."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "DP_BATCH_RELEASE", entityTypeCode: "DIRECT_PAYMENT_BATCH", entityItemId: members[0].ID, businessKey: batchKey, affectedItemIds: $.map(members, function (member) { return member.ID; }), fromStageCode: "PAYMENT_AGGREGATION", fromStatusCode: "IN_PROGRESS", toStageCode: "INVOICE_PROCESSING", toStatusCode: "IN_PROGRESS", successMessage: "Direct Payment batch was released to Invoice Processing." }, function (operationId) {
                return self._groupPatch(members, actor, expectedVersion || 0, operationId, { POLine: null, POLineKeySnapshot: "", Currency: null, CurrencyCodeSnapshot: "", ConversionRateUsed: null, ConversionRateModifiedDate: null, AggregationReleaseDate: VMS.ClockService.utcNow(), AggregationReleasedBy: H.actorContext(actor).actorPerson, StageCode: "INVOICE_PROCESSING", StatusCode: "IN_PROGRESS" });
            }, function (updated) {
                return { eventCode: "DP_BATCH_RELEASED", context: { record: updated, members: updated.members } };
            });
        });
    };

    DirectPaymentBatchService.prototype.SelectBatchPOLine = function (batchKey, selectedLineId, expectedVersion, actionRequestId) {
        var self = this;
        var actor;
        var members;
        var line;
        var header;
        var currency;
        var fixedVendorCode;
        return this.accessService.AuthorizeOperation("DP_BATCH_PROCESS").then(function () {
            return self._queryBatch(batchKey);
        }).then(function (value) {
            members = value;
            if ($.grep(members, function (member) { return member.StageCode !== "INVOICE_PROCESSING" || member.StatusCode !== "IN_PROGRESS"; }).length) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "The batch PO Line can be selected only during grouped Invoice Processing."); }
            return self._authorize("DP_BATCH_PROCESS", members[0]);
        }).then(function (user) {
            actor = user;
            return H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE");
        }).then(function (setting) {
            fixedVendorCode = VMS.Utilities.normalizeKey(setting.TextValue);
            return self.repositories.poLines.getById(selectedLineId);
        }).then(function (value) {
            line = value;
            if (!line || line.IsActive !== true || line.IsCancelled === true || line.LineRequestStageCode !== "ACTIVE" || line.LineRequestStatusCode !== "APPROVED" || $.inArray(line.POLineStatusCode, ["ACTIVE", "THRESHOLD_REACHED"]) < 0 || Number(line.RemainingBalance) <= 0 || VMS.Utilities.normalizeKey(line.VendorCodeSnapshot) !== fixedVendorCode) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an eligible active batch PO Line for the configured Direct Payment Vendor."); }
            return self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader));
        }).then(function (value) {
            header = value;
            if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || VMS.Utilities.normalizeKey(header.VendorCodeSnapshot) !== fixedVendorCode) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The selected batch PO Line must belong to the fixed Vendor's active approved PO."); }
            return self.repositories.currencies.getById(VMS.Utilities.lookupId(header.Currency));
        }).then(function (value) {
            currency = value;
            if (!currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "The selected batch PO Line Currency is unavailable or invalid."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "DP_BATCH_SELECT_PO_LINE", entityTypeCode: "DIRECT_PAYMENT_BATCH", entityItemId: members[0].ID, businessKey: batchKey, affectedItemIds: $.map(members, function (member) { return member.ID; }), fromStageCode: "INVOICE_PROCESSING", fromStatusCode: "IN_PROGRESS", toStageCode: "INVOICE_PROCESSING", toStatusCode: "IN_PROGRESS", successMessage: "The batch PO Line and Currency were synchronized across the complete group." }, function (operationId) {
                return self._groupPatch(members, actor, expectedVersion, operationId, { POLine: { id: line.ID, title: line.POLineKey }, POLineKeySnapshot: line.POLineKey, Currency: { id: currency.ID, title: currency.CurrencyCode }, CurrencyCodeSnapshot: currency.CurrencyCode, ConversionRateUsed: currency.ConversionRateToSAR, ConversionRateModifiedDate: currency.Modified }, { lineId: line.ID, currencyId: currency.ID });
            });
        });
    };

    DirectPaymentBatchService.prototype.SaveMemberDraft = function (batchKey, memberId, expectedEtag, expectedVersion, input, actionRequestId) {
        var self = this;
        var actor;
        var member;
        var validation;
        return this.accessService.AuthorizeOperation("DP_BATCH_PROCESS").then(function () {
            return self._queryBatch(batchKey);
        }).then(function (members) {
            if (Number(members[0].BatchVersion) !== Number(expectedVersion)) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The Direct Payment batch changed after it was loaded."); }
            member = $.grep(members, function (item) { return item.ID === Number(memberId); })[0];
            return self._authorize("DP_BATCH_PROCESS", member);
        }).then(function (user) {
            actor = user;
            if (!member || member.StageCode !== "INVOICE_PROCESSING") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This batch member is not available for processing."); }
            if (!VMS.Utilities.lookupId(member.POLine) || !VMS.Utilities.lookupId(member.Currency) || !member.POLineKeySnapshot || !member.CurrencyCodeSnapshot || Number(member.ConversionRateUsed) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select the batch PO Line before saving member processing values."); }
            input.ConversionRateUsed = member.ConversionRateUsed;
            validation = { calculated: VMS.FinancialCalculationService.calculate(input), errors: [] };
            VMS.ValidationService.required(input.InvoiceNumber, "InvoiceNumber", "Supplier Invoice Number", validation.errors);
            VMS.ValidationService.required(input.CostCenter, "CostCenter", "Cost Center", validation.errors);
            validation.errors = validation.errors.concat(validation.calculated.fieldErrors);
            if (validation.errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted member fields.", validation.errors); }
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "VendorInvoiceKey", op: "eq", value: VMS.Utilities.lookupId(member.Vendor) + "-" + H.normalizeSupplierInvoice(input.InvoiceNumber) }] });
        }).then(function (duplicates) {
            if ($.grep(duplicates, function (item) { return item.ID !== member.ID; }).length) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Supplier Invoice Number already exists for this Vendor."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "DP_BATCH_SAVE_MEMBER_DRAFT", entityTypeCode: "INVOICE", entityItemId: member.ID, businessKey: member.InvoiceIdentifier, fromStageCode: member.StageCode, fromStatusCode: member.StatusCode, toStageCode: member.StageCode, toStatusCode: member.StatusCode, successMessage: "Direct Payment member draft was saved." }, function () {
                return self.repositories.invoices.update(member.ID, $.extend({}, validation.calculated.values, { InvoiceNumber: VMS.Utilities.collapseWhitespace(input.InvoiceNumber), VendorInvoiceKey: VMS.Utilities.lookupId(member.Vendor) + "-" + H.normalizeSupplierInvoice(input.InvoiceNumber), SESNumber: "", SESDate: null, CostCenter: VMS.Utilities.trim(input.CostCenter), HasDiscount: input.HasDiscount === true, DiscountInputTypeCode: input.HasDiscount ? input.DiscountInputTypeCode : "", DiscountInputValue: input.HasDiscount ? Number(input.DiscountInputValue) : null, HasVAT: input.HasVAT === true, VATInputTypeCode: input.HasVAT ? input.VATInputTypeCode : "", VATInputValue: input.HasVAT ? Number(input.VATInputValue) : null }), expectedEtag || member._etag, H.actorContext(actor));
            });
        });
    };

    DirectPaymentBatchService.prototype._transition = function (batchKey, expectedVersion, authorityCode, auditCode, fromStage, toStage, targetStatus, comment, actionRequestId, beforePatch) {
        var self = this;
        var actor;
        var members;
        var preparation;
        return this.accessService.AuthorizeOperation(authorityCode).then(function () {
            return self._queryBatch(batchKey);
        }).then(function (value) { members = value; return self._authorize(authorityCode, members[0]); }).then(function (user) {
            actor = user;
            if ($.grep(members, function (member) { return member.StageCode !== fromStage || member.StatusCode !== "IN_PROGRESS"; }).length) { return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "Every batch member must be in the required workflow state."); }
            return beforePatch ? beforePatch(members, actor) : null;
        }).then(function (value) {
            preparation = value || {};
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: auditCode, entityTypeCode: "DIRECT_PAYMENT_BATCH", entityItemId: members[0].ID, businessKey: batchKey, affectedItemIds: $.map(members, function (member) { return member.ID; }), fromStageCode: fromStage, fromStatusCode: "IN_PROGRESS", toStageCode: toStage, toStatusCode: targetStatus, comment: comment || "", successMessage: "Direct Payment batch action was completed." }, function (operationId) {
                return self._groupPatch(members, actor, expectedVersion, operationId, { StageCode: toStage, StatusCode: targetStatus, RejectionComment: comment || "", WorkflowApproved: auditCode === "DP_BATCH_APPROVE" ? true : members[0].WorkflowApproved, WorkflowApprovalDate: auditCode === "DP_BATCH_APPROVE" ? VMS.ClockService.utcNow() : members[0].WorkflowApprovalDate, ChargebackDate: auditCode === "DP_BATCH_APPROVE" ? VMS.ClockService.utcNow() : members[0].ChargebackDate, SettlementDate: auditCode === "DP_BATCH_SETTLE" ? VMS.ClockService.utcNow() : members[0].SettlementDate }, preparation.details || {}, preparation.afterLock);
            }, function (updated) {
                var eventCodes = { DP_BATCH_SUBMIT: "DP_BATCH_SUBMITTED", DP_BATCH_RETURN: "DP_BATCH_UPDATE_REQUIRED", DP_BATCH_APPROVE: "DP_BATCH_APPROVED", DP_BATCH_SETTLE: "DP_BATCH_SETTLED" };
                return { eventCode: eventCodes[auditCode], context: { record: updated, members: updated.members } };
            });
        });
    };

    DirectPaymentBatchService.prototype._validateFinancialIdentity = function (members, requireAmounts) {
        var self = this;
        var lineId = VMS.Utilities.lookupId(members[0].POLine);
        var currencyId = VMS.Utilities.lookupId(members[0].Currency);
        var amounts = [];
        var total;
        var seenKeys = {};
        var validationError = false;
        if (!lineId || !currencyId || $.grep(members, function (member) {
            var calculation = VMS.FinancialCalculationService.calculate(member);
            var key = VMS.Utilities.normalizeKey(member.VendorInvoiceKey);
            amounts.push(member.FinalInvoiceAmount);
            if (key && seenKeys[key]) { validationError = true; }
            seenKeys[key] = true;
            return VMS.Utilities.lookupId(member.POLine) !== lineId || VMS.Utilities.lookupId(member.Currency) !== currencyId || member.POLineKeySnapshot !== members[0].POLineKeySnapshot || member.CurrencyCodeSnapshot !== members[0].CurrencyCodeSnapshot || (requireAmounts === true && (!member.InvoiceNumber || !member.CostCenter || !member.VendorInvoiceKey || !calculation.valid || Number(member.FinalInvoiceAmount) <= 0 || Number(calculation.values.TotalPrice) !== Number(member.TotalPrice) || Number(calculation.values.DiscountAmount) !== Number(member.DiscountAmount) || Number(calculation.values.NetAmountBeforeVAT) !== Number(member.NetAmountBeforeVAT) || Number(calculation.values.VATAmount) !== Number(member.VATAmount) || Number(calculation.values.FinalInvoiceAmount) !== Number(member.FinalInvoiceAmount) || Number(calculation.values.TotalPriceInSAR) !== Number(member.TotalPriceInSAR) || Number(calculation.values.VATAmountInSAR) !== Number(member.VATAmountInSAR) || Number(calculation.values.FinalInvoiceAmountInSAR) !== Number(member.FinalInvoiceAmountInSAR)));
        }).length) {
            return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "Every member must use the one batch PO Line and Currency.");
        }
        if (validationError) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Supplier Invoice Number must be unique for every batch member."); }
        total = VMS.FinancialCalculationService.sumMoney(amounts);
        if (total === null || total <= 0) {
            return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "The complete batch financial amount is invalid.");
        }
        return this.repositories.poLines.getById(lineId).then(function (line) {
            if (!line || line.ID !== lineId || line.IsActive !== true || line.IsCancelled === true || line.LineRequestStageCode !== "ACTIVE" || line.LineRequestStatusCode !== "APPROVED" || $.inArray(line.POLineStatusCode, ["ACTIVE", "THRESHOLD_REACHED"]) < 0 || line.POLineKey !== members[0].POLineKeySnapshot) {
                return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "The selected batch PO Line is not active and approved.");
            }
            return $.when(self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader)), self.repositories.currencies.getById(currencyId), self.repositories.vendors.getById(VMS.Utilities.lookupId(members[0].Vendor)), H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE")).then(function (header, currency, vendor, setting) {
                var duplicateChain = $.Deferred().resolve().promise();
                var attachmentChain = $.Deferred().resolve().promise();
                var fixedCode = VMS.Utilities.normalizeKey(setting.TextValue);
                if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || !currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0 || VMS.Utilities.lookupId(header.Currency) !== currencyId || currency.CurrencyCode !== members[0].CurrencyCodeSnapshot || VMS.Utilities.normalizeKey(header.VendorCodeSnapshot) !== fixedCode || VMS.Utilities.normalizeKey(line.VendorCodeSnapshot) !== fixedCode || !vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED" || vendor.VendorProcessingTypeCode !== "DIRECT" || VMS.Utilities.normalizeKey(vendor.VendorCode) !== fixedCode || VMS.Utilities.lookupId(members[0].Vendor) !== vendor.ID) {
                    return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "The batch PO Line, Currency, and fixed Vendor relationship is inconsistent.");
                }
                if ($.grep(members, function (member) { return VMS.Utilities.lookupId(member.Vendor) !== vendor.ID || VMS.Utilities.normalizeKey(member.VendorCodeSnapshot) !== fixedCode || Number(member.ConversionRateUsed) !== Number(currency.ConversionRateToSAR) || String(member.ConversionRateModifiedDate || "") !== String(currency.Modified || ""); }).length) {
                    return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The batch Currency or conversion-rate snapshot changed. Re-select the batch PO Line and review every member draft.");
                }
                if (VMS.FinancialCalculationService.subtractMoney(line.RemainingBalance, total) === null) {
                    return H.reject(VMS.Constants.ERRORS.INSUFFICIENT_PO_BALANCE, "The batch total exceeds the selected PO Line remaining balance.");
                }
                $.each(members, function (_, member) {
                    duplicateChain = duplicateChain.then(function () {
                        return H.queryAll(self.repositories.invoices, { filters: [{ field: "VendorInvoiceKey", op: "eq", value: member.VendorInvoiceKey }] }).then(function (duplicates) {
                            if ($.grep(duplicates, function (candidate) { return candidate.ID !== member.ID; }).length) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Supplier Invoice Number already exists for the configured Direct Payment Vendor."); }
                        });
                    });
                    attachmentChain = attachmentChain.then(function () {
                        return self.repositories.invoices.getAttachments(member.ID).then(function (attachments) {
                            if (!attachments || !attachments.length) { return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "Every Direct Payment batch member requires at least one valid attachment."); }
                        });
                    });
                });
                return duplicateChain.then(function () { return attachmentChain; }).then(function () { return { line: line, header: header, currency: currency, total: total }; });
            });
        });
    };

    DirectPaymentBatchService.prototype.SubmitGroup = function (batchKey, expectedVersion, actionRequestId) {
        var self = this;
        return this._transition(batchKey, expectedVersion, "DP_BATCH_PROCESS", "DP_BATCH_SUBMIT", "INVOICE_PROCESSING", "PENDING_APPROVAL", "IN_PROGRESS", "", actionRequestId, function (members) {
            return self._validateFinancialIdentity(members, true);
        });
    };

    DirectPaymentBatchService.prototype.ApproveGroup = function (batchKey, expectedVersion, actionRequestId) {
        var self = this;
        return this._transition(batchKey, expectedVersion, "DP_BATCH_APPROVE", "DP_BATCH_APPROVE", "PENDING_APPROVAL", "CHARGEBACK_PROCESSING", "IN_PROGRESS", "", actionRequestId, function (members, actor) {
            return self._validateFinancialIdentity(members, true).then(function (identity) {
                var targetConsumed = VMS.FinancialCalculationService.sumMoney([identity.line.ConsumedAmount, identity.total]);
                var targetRemaining = VMS.FinancialCalculationService.subtractMoney(identity.line.POLineAmount, targetConsumed);
                return {
                    details: {
                        financial: {
                            lineId: identity.line.ID,
                            amount: identity.total,
                            beforeConsumedAmount: Number(identity.line.ConsumedAmount),
                            beforeRemainingBalance: Number(identity.line.RemainingBalance),
                            targetConsumedAmount: targetConsumed,
                            targetRemainingBalance: targetRemaining
                        }
                    },
                    afterLock: function () {
                        return self.poLineService.ConsumeForInvoiceApproval(identity.line.ID, identity.total, identity.line._etag, actor);
                    }
                };
            });
        });
    };

    DirectPaymentBatchService.prototype.ReturnGroup = function (batchKey, expectedVersion, reason, actionRequestId) {
        if (!VMS.Utilities.trim(reason)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An Update Required reason is required."); }
        return this._transition(batchKey, expectedVersion, "DP_BATCH_RETURN", "DP_BATCH_RETURN", "PENDING_APPROVAL", "INVOICE_PROCESSING", "IN_PROGRESS", VMS.Utilities.trim(reason), actionRequestId);
    };

    DirectPaymentBatchService.prototype.SaveChargebackMember = function (batchKey, memberId, expectedEtag, expectedVersion, input, actionRequestId) {
        var self = this;
        var actor;
        var member;
        return this.accessService.AuthorizeOperation("DP_BATCH_SETTLE").then(function () {
            return self._queryBatch(batchKey);
        }).then(function (members) {
            if (Number(members[0].BatchVersion) !== Number(expectedVersion)) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The Direct Payment batch changed after it was loaded."); }
            member = $.grep(members, function (item) { return item.ID === Number(memberId); })[0];
            return self._authorize("DP_BATCH_SETTLE", member);
        }).then(function (user) {
            actor = user;
            if (!member || member.StageCode !== "CHARGEBACK_PROCESSING") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This member is not available for Chargeback Processing."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "DP_BATCH_SAVE_CHARGEBACK_MEMBER", entityTypeCode: "INVOICE", entityItemId: member.ID, businessKey: member.InvoiceIdentifier, fromStageCode: member.StageCode, fromStatusCode: member.StatusCode, toStageCode: member.StageCode, toStatusCode: member.StatusCode, successMessage: "Chargeback member draft was saved." }, function () {
                return self.repositories.invoices.update(member.ID, { EBillingSettlement: member.InvoiceSourceFunctionCode === "EXECUTION" && Number(member.GlobalLearnerCount) > 0 ? input.EBillingSettlement : null, LMSSettlement: member.InvoiceSourceFunctionCode === "EXECUTION" && Number(member.MEALearnerCount) > 0 ? input.LMSSettlement : null, Comment: VMS.Utilities.trim(input.Comment || member.Comment) }, expectedEtag || member._etag, H.actorContext(actor));
            });
        });
    };

    DirectPaymentBatchService.prototype.SettleGroup = function (batchKey, expectedVersion, actionRequestId) {
        return this._transition(batchKey, expectedVersion, "DP_BATCH_SETTLE", "DP_BATCH_SETTLE", "CHARGEBACK_PROCESSING", "SETTLED", "SETTLED", "", actionRequestId, function (members) {
            var incomplete = $.grep(members, function (member) {
                return member.InvoiceSourceFunctionCode === "EXECUTION" && ((Number(member.GlobalLearnerCount) > 0 && member.EBillingSettlement !== true) || (Number(member.MEALearnerCount) > 0 && member.LMSSettlement !== true));
            });
            if (incomplete.length) { return H.reject(VMS.Constants.ERRORS.BATCH_MEMBER_INVALID, "Complete all applicable member settlement results before group Settlement."); }
        });
    };

    DirectPaymentBatchService.prototype._targetMatches = function (record, target, targetVersion) {
        var field;
        var expected;
        var actual;
        if (Number(record.BatchVersion) !== Number(targetVersion)) {
            return false;
        }
        for (field in target) {
            if (Object.prototype.hasOwnProperty.call(target, field)) {
                expected = target[field];
                actual = record[field];
                if (expected && typeof expected === "object" && !$.isArray(expected)) {
                    if (VMS.Utilities.lookupId(actual) !== VMS.Utilities.lookupId(expected)) { return false; }
                } else if (String(actual === null || actual === undefined ? "" : actual) !== String(expected === null || expected === undefined ? "" : expected)) {
                    return false;
                }
            }
        }
        return true;
    };

    DirectPaymentBatchService.prototype.RecoverOperation = function (batchKey, systemContext) {
        var self = this;
        var actor;
        var actorContext;
        var members;
        var leader;
        var payload;
        var history;
        var financial;
        var chain = $.Deferred().resolve().promise();
        var authorization;
        var completedMembers;
        if (systemContext && systemContext.isScheduler === true && systemContext.actorPerson) {
            actor = { ID: systemContext.actorPerson.id, UserName: systemContext.actorPerson.title, Email: systemContext.actorPerson.email };
            actorContext = { actorPerson: systemContext.actorPerson };
            authorization = $.Deferred().resolve(actor).promise();
        } else {
            authorization = this.accessService.AuthorizeOperation("ADMIN_DP_RECOVER").then(function (user) {
                actor = user;
                actorContext = H.actorContext(user);
                return user;
            });
        }
        return authorization.then(function () {
            return self._queryBatch(batchKey, systemContext);
        }).then(function (value) {
            var expectedIds;
            var actualIds;
            members = value;
            leader = members[0];
            if (leader.BatchOperationStateCode !== "RECOVERY_REQUIRED" || !leader.BatchOperationPayloadJSON || !leader.BatchOperationId) {
                return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This batch does not require recovery.");
            }
            try {
                payload = JSON.parse(leader.BatchOperationPayloadJSON);
            } catch (ignore) {
                return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The batch recovery payload is invalid and requires controlled support reconciliation.");
            }
            expectedIds = (payload.memberIds || []).slice(0).sort(function (left, right) { return Number(left) - Number(right); });
            actualIds = $.map(members, function (member) { return member.ID; }).sort(function (left, right) { return Number(left) - Number(right); });
            if (payload.version !== 1 || payload.batchKey !== batchKey || !payload.target || !payload.toVersion || JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
                return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The batch recovery evidence is inconsistent and requires controlled support reconciliation.");
            }
            return self.mutationRunner.auditService.GetByActionRequestId(leader.BatchOperationId);
        }).then(function (value) {
            history = value;
            if (!history || (history.ResultCode !== "PREPARED" && history.ResultCode !== "SUCCESS")) {
                return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The batch Action Request evidence is unavailable for automatic recovery.");
            }
            completedMembers = $.grep(members, function (member) { return self._targetMatches(member, payload.target, payload.toVersion); });
            financial = payload.details && payload.details.financial ? payload.details.financial : null;
            if (!financial) {
                return null;
            }
            return self.repositories.poLines.getById(financial.lineId).then(function (line) {
                var atBefore;
                var atTarget;
                if (!line) {
                    return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The batch PO Line recovery evidence is unavailable.");
                }
                atBefore = Number(line.ConsumedAmount) === Number(financial.beforeConsumedAmount) && Number(line.RemainingBalance) === Number(financial.beforeRemainingBalance);
                atTarget = Number(line.ConsumedAmount) === Number(financial.targetConsumedAmount) && Number(line.RemainingBalance) === Number(financial.targetRemainingBalance);
                if (atTarget) {
                    return null;
                }
                if (atBefore && completedMembers.length === 0) {
                    return self.poLineService.ConsumeForInvoiceApproval(line.ID, financial.amount, line._etag, actor);
                }
                return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The batch PO Line outcome is inconsistent and requires controlled support reconciliation.");
            });
        }).then(function () {
            var ordered = members.slice(1).concat([leader]);
            $.each(ordered, function (_, member) {
                chain = chain.then(function () {
                    var patch;
                    if (self._targetMatches(member, payload.target, payload.toVersion)) {
                        if (member.ID === leader.ID && member.BatchOperationStateCode !== "COMMITTED") {
                            return self.repositories.invoices.update(member.ID, { BatchOperationStateCode: "COMMITTED", BatchLockToken: "", BatchLockExpiresAt: null, BatchOperationPayloadJSON: "" }, member._etag, actorContext);
                        }
                        return member;
                    }
                    if (Number(member.BatchVersion) !== Number(payload.fromVersion)) {
                        return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "A batch member version is inconsistent and requires controlled support reconciliation.");
                    }
                    patch = $.extend({}, payload.target, { BatchVersion: Number(payload.toVersion) });
                    if (member.ID === leader.ID) {
                        patch.BatchOperationStateCode = "COMMITTED";
                        patch.BatchLockToken = "";
                        patch.BatchLockExpiresAt = null;
                        patch.BatchOperationPayloadJSON = "";
                    }
                    return self.repositories.invoices.update(member.ID, patch, member._etag, actorContext);
                });
            });
            return chain;
        }).then(function () {
            if (history.ResultCode === "SUCCESS") {
                return self.repositories.invoices.getById(leader.ID);
            }
            return self.mutationRunner.auditService.FinalizeSuccess(history, { entityItemId: leader.ID, businessKey: batchKey, affectedItemIds: payload.memberIds }).then(function () {
                return self.repositories.invoices.getById(leader.ID);
            });
        }).then(function (finalLeader) {
            finalLeader.affectedItemIds = payload.memberIds;
            return finalLeader;
        }, function (error) {
            if (error && error.code === VMS.Constants.ERRORS.RECOVERY_REQUIRED) {
                return H.reject(error.code, error.safeMessage);
            }
            return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "Direct Payment recovery could not safely determine the complete outcome.");
        });
    };

    VMS.DirectPaymentBatchService = DirectPaymentBatchService;
}(window, window.jQuery));
