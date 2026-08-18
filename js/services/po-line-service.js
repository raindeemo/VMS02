(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function POLineService(repositories, accessService, mutationRunner) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
    }

    POLineService.prototype._authorize = function (actionCode) {
        var self = this;
        return this.accessService.ResolveCurrentUser().then(function (user) {
            if (!self.accessService.CanPerform(user, actionCode, {})) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "You are not authorized to process PO Lines."); }
            return user;
        });
    };

    POLineService.prototype.QueryByHeader = function (headerId) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.PO_LINE_WORKSPACE).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PO_LINE, "REGISTER");
        }).then(function (context) {
            return self.repositories.poLines.query({ filters: [{ field: "POHeader.id", op: "eq", value: Number(headerId) }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "POLineNumber", direction: "ASC" }], pageSize: 25, authorizationScope: context.scope });
        });
    };

    POLineService.prototype.GetWorkspaceData = function (headerId) {
        var self = this;
        var context;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.PO_LINE_WORKSPACE).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PO_LINE, "REGISTER");
        }).then(function (value) {
            context = value;
            return $.when(
                H.queryAll(self.repositories.poLines, { filters: [{ field: "POHeader.id", op: "eq", value: Number(headerId) }], sort: [{ field: "POLineNumber", direction: "ASC" }], authorizationScope: context.scope }),
                H.setting(self.repositories, "MAX_PO_LINES")
            );
        }).then(function (rows, setting) {
            var maximum = Number(setting.NumericValue);
            var byNumber = {};
            var slots = [];
            var pending = [];
            var activeApprovedCount = 0;
            var thresholdReached = false;
            if (!isFinite(maximum) || Math.floor(maximum) !== maximum || maximum < 1 || maximum > 3) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "Maximum PO Lines configuration must be a whole number from one through three."); }
            $.each(rows, function (_, row) {
                byNumber[Number(row.POLineNumber)] = row;
                if (row.IsActive === true && row.IsCancelled !== true && row.LineRequestStageCode === "ACTIVE" && row.LineRequestStatusCode === "APPROVED") {
                    activeApprovedCount += 1;
                    if (row.POLineStatusCode === "THRESHOLD_REACHED") { thresholdReached = true; }
                }
                if (row.IsActive === true && row.IsCancelled !== true && ((row.LineRequestStageCode === "PLANNED" && row.LineRequestStatusCode === "PLANNED") || (row.LineRequestStageCode === "CREATION" && row.LineRequestStatusCode === "IN_PROGRESS"))) { pending.push(row); }
            });
            $.each(VMS.Constants.PO_LINE_NUMBERS.slice(0, maximum), function (index, number) {
                var row = byNumber[Number(number)];
                slots.push({ slotIndex: index + 1, lineNumber: String(number), record: row && row.IsActive === true && row.IsCancelled !== true ? row : null, initialLineMissing: index === 0 && !row });
            });
            return { maximumLines: maximum, activeApprovedCount: activeApprovedCount, thresholdReached: thresholdReached, slots: slots, pending: pending };
        });
    };

    POLineService.prototype.GetActionItem = function (id) {
        var self = this;
        return this._authorize("PO_LINE_PROCESS").then(function () { return self.repositories.poLines.getById(id); }).then(function (line) {
            if (!line) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested PO Line is unavailable."); }
            return line;
        });
    };

    POLineService.prototype.PlanAdditional = function (headerId, requestedLineNumber, actionRequestId) {
        var self = this;
        var actor;
        var header;
        return this._authorize("PO_LINE_PROCESS").then(function (user) { actor = user; return self.repositories.prpo.getById(headerId); }).then(function (value) {
            header = value;
            if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Additional Lines require an active approved PO."); }
            return $.when(H.queryAll(self.repositories.poLines, { filters: [{ field: "POHeader.id", op: "eq", value: Number(headerId) }], sort: [{ field: "POLineNumber", direction: "ASC" }] }), H.setting(self.repositories, "MAX_PO_LINES"));
        }).then(function (rows, setting) {
            var maximum = Number(setting.NumericValue);
            var slots = VMS.Constants.PO_LINE_NUMBERS.slice(0, maximum);
            var byNumber = {};
            var selected;
            if (!isFinite(maximum) || Math.floor(maximum) !== maximum || maximum < 1 || maximum > 3) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "Maximum PO Lines configuration must be a whole number from one through three."); }
            $.each(rows, function (_, row) { byNumber[Number(row.POLineNumber)] = row; });
            $.each(slots, function (_, number) {
                var eligible = !byNumber[number] || (byNumber[number].IsCancelled === true && byNumber[number].IsInitialLine !== true && byNumber[number].LineRequestStageCode !== "ACTIVE");
                if (!selected && eligible && (!requestedLineNumber || Number(requestedLineNumber) === Number(number))) { selected = byNumber[number] || { POLineNumber: String(number) }; }
            });
            if (!selected) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The configured PO Line limit has been reached."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PO_LINE_PLAN", entityTypeCode: "PO_LINE", entityItemId: selected.ID || 0, businessKey: header.PONumber + "-" + selected.POLineNumber, toStageCode: "PLANNED", toStatusCode: "PLANNED", successMessage: "Additional PO Line was planned." }, function () {
                var patch = { LineRequestStageCode: "PLANNED", LineRequestStatusCode: "PLANNED", POLineAmount: null, ConsumedAmount: 0, RemainingBalance: null, ThresholdPercentage: null, ThresholdAmount: null, AlertActivation: true, LastAlertDate: null, POLineStatusCode: "ACTIVE", IsCancelled: false, CancellationReason: "", IsActive: true };
                if (selected.ID) { return self.repositories.poLines.update(selected.ID, patch, selected._etag, H.actorContext(actor)); }
                patch.POHeader = { id: header.ID, title: header.PRNumber };
                patch.VendorCodeSnapshot = header.VendorCodeSnapshot;
                patch.PONumber = header.PONumber;
                patch.POLineNumber = selected.POLineNumber;
                patch.POLineKey = header.PONumber + "-" + selected.POLineNumber;
                patch.IsInitialLine = false;
                return self.repositories.poLines.create(patch, H.actorContext(actor));
            });
        });
    };

    POLineService.prototype.SaveDetails = function (id, expectedEtag, amount, actionRequestId) {
        var self = this;
        var actor;
        var line;
        var header;
        return this._authorize("PO_LINE_PROCESS").then(function (user) { actor = user; return self.repositories.poLines.getById(id); }).then(function (value) {
            line = value;
            if (!line || line.IsActive !== true || line.IsCancelled === true || line.LineRequestStageCode !== "PLANNED" || line.LineRequestStatusCode !== "PLANNED") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Line details can only be entered for a planned Line."); }
            return self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader));
        }).then(function (value) {
            header = value;
            amount = Number(amount);
            if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || !isFinite(amount) || amount <= 0 || amount > Number(header.PRAmount)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Line amount requires an active approved PO and must be greater than zero and no greater than the PR Amount."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PO_LINE_SAVE_DETAILS", entityTypeCode: "PO_LINE", entityItemId: id, businessKey: line.POLineKey, fromStageCode: line.LineRequestStageCode, fromStatusCode: line.LineRequestStatusCode, toStageCode: "CREATION", toStatusCode: "IN_PROGRESS", successMessage: "PO Line details were saved." }, function () {
                return self.repositories.poLines.update(id, { POLineAmount: VMS.Utilities.roundHalfAwayFromZero(amount, 2), LineRequestStageCode: "CREATION", LineRequestStatusCode: "IN_PROGRESS" }, expectedEtag || line._etag, H.actorContext(actor));
            });
        });
    };

    POLineService.prototype.Activate = function (id, expectedEtag, actionRequestId) {
        var self = this;
        var actor;
        var line;
        var header;
        return this._authorize("PO_LINE_PROCESS").then(function (user) { actor = user; return self.repositories.poLines.getById(id); }).then(function (value) {
            line = value;
            if (!line || line.IsActive !== true || line.IsCancelled === true || line.IsInitialLine === true || line.LineRequestStageCode !== "CREATION" || line.LineRequestStatusCode !== "IN_PROGRESS" || Number(line.POLineAmount) <= 0) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Only a completed additional-Line request can be activated."); }
            return $.when(H.setting(self.repositories, "THRESHOLD_PERCENTAGE"), self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader)), H.queryAll(self.repositories.poLines, { filters: [{ field: "POLineKey", op: "eq", value: line.POLineKey }] }));
        }).then(function (setting, headerValue, duplicates) {
            var percentage = Number(setting.NumericValue);
            var thresholdAmount;
            header = headerValue;
            if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || Number(line.POLineAmount) > Number(header.PRAmount) || duplicates.length !== 1 || duplicates[0].ID !== line.ID) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The PO Line parent, amount, or business key is invalid."); }
            if (!isFinite(percentage) || percentage <= 0 || percentage > 100) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "PO Line threshold configuration is invalid."); }
            thresholdAmount = VMS.Utilities.roundHalfAwayFromZero(Number(line.POLineAmount) * percentage / 100, 2);
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PO_LINE_ACTIVATE", entityTypeCode: "PO_LINE", entityItemId: id, businessKey: line.POLineKey, fromStageCode: line.LineRequestStageCode, fromStatusCode: line.LineRequestStatusCode, toStageCode: "ACTIVE", toStatusCode: "APPROVED", successMessage: "PO Line was activated." }, function () {
                return self.repositories.poLines.update(id, { LineRequestStageCode: "ACTIVE", LineRequestStatusCode: "APPROVED", ConsumedAmount: 0, RemainingBalance: line.POLineAmount, ThresholdPercentage: percentage, ThresholdAmount: thresholdAmount, POLineStatusCode: Number(line.POLineAmount) <= thresholdAmount ? "THRESHOLD_REACHED" : "ACTIVE", IsActive: true }, expectedEtag || line._etag, H.actorContext(actor));
            }, function (updated) {
                var events = [{ eventCode: "PO_LINE_ACTIVATED", context: { record: updated, header: header } }];
                if (updated.POLineStatusCode === "THRESHOLD_REACHED" && updated.AlertActivation === true) { events.push({ eventCode: "PO_LINE_THRESHOLD_REMINDER", context: { record: updated, header: header }, onDelivered: function (messages) { return self.repositories.poLines.update(updated.ID, { LastAlertDate: messages[0].sentAt }, updated._etag, H.actorContext(actor)); } }); }
                return { events: events };
            });
        });
    };

    POLineService.prototype.Cancel = function (id, expectedEtag, reason, actionRequestId) {
        var self = this;
        var actor;
        var line;
        return this._authorize("PO_LINE_PROCESS").then(function (user) { actor = user; return self.repositories.poLines.getById(id); }).then(function (value) {
            line = value;
            if (!line || line.IsInitialLine === true || line.IsActive !== true || line.IsCancelled === true || !((line.LineRequestStageCode === "PLANNED" && line.LineRequestStatusCode === "PLANNED") || (line.LineRequestStageCode === "CREATION" && line.LineRequestStatusCode === "IN_PROGRESS"))) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Only a planned or in-progress additional Line can be cancelled."); }
            if (!VMS.Utilities.trim(reason)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "A cancellation reason is required."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "PO_LINE_CANCEL", entityTypeCode: "PO_LINE", entityItemId: id, businessKey: line.POLineKey, fromStageCode: line.LineRequestStageCode, fromStatusCode: line.LineRequestStatusCode, toStageCode: line.LineRequestStageCode, toStatusCode: line.LineRequestStatusCode, comment: reason, successMessage: "PO Line request was cancelled." }, function () {
                return self.repositories.poLines.update(id, { IsCancelled: true, IsActive: false, CancellationReason: VMS.Utilities.trim(reason) }, expectedEtag || line._etag, H.actorContext(actor));
            });
        });
    };

    POLineService.prototype.SetAlertActivation = function (id, expectedEtag, enabled, actionRequestId) {
        var self = this;
        var actor;
        var line;
        return this._authorize("ADMIN_PO_LINE_ALERT").then(function (user) { actor = user; return self.repositories.poLines.getById(id); }).then(function (value) {
            line = value;
            if (!line || line.LineRequestStageCode !== "ACTIVE") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Alert settings apply only to active Lines."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_PO_LINE_ALERT", entityTypeCode: "PO_LINE", entityItemId: id, businessKey: line.POLineKey, fromStageCode: line.LineRequestStageCode, fromStatusCode: line.LineRequestStatusCode, toStageCode: line.LineRequestStageCode, toStatusCode: line.LineRequestStatusCode, countsAsCompletedAction: false, successMessage: "PO Line alert setting was updated." }, function () { return self.repositories.poLines.update(id, { AlertActivation: enabled === true }, expectedEtag || line._etag, H.actorContext(actor)); });
        });
    };

    POLineService.prototype.ConsumeForInvoiceApproval = function (lineId, amount, expectedEtag, actor) {
        var self = this;
        return this.repositories.poLines.getById(lineId).then(function (line) {
            var consumed;
            var remaining;
            var status;
            amount = VMS.FinancialCalculationService.sumMoney([amount]);
            if (!line || line.LineRequestStageCode !== "ACTIVE" || line.LineRequestStatusCode !== "APPROVED" || $.inArray(line.POLineStatusCode, ["ACTIVE", "THRESHOLD_REACHED"]) < 0 || line.IsCancelled === true || line.IsActive !== true) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "The selected PO Line is not active."); }
            if (expectedEtag && line._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The selected PO Line changed after it was loaded."); }
            if (amount === null || amount <= 0 || VMS.FinancialCalculationService.subtractMoney(line.RemainingBalance, amount) === null) { return H.reject(VMS.Constants.ERRORS.INSUFFICIENT_PO_BALANCE, "The selected PO Line has insufficient remaining balance."); }
            consumed = VMS.FinancialCalculationService.sumMoney([line.ConsumedAmount, amount]);
            remaining = VMS.FinancialCalculationService.subtractMoney(line.POLineAmount, consumed);
            if (consumed === null || remaining === null) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The PO Line financial state is invalid."); }
            status = remaining <= 0 ? "CONSUMED" : (remaining <= Number(line.ThresholdAmount) ? "THRESHOLD_REACHED" : "ACTIVE");
            return self.repositories.poLines.update(line.ID, { ConsumedAmount: consumed, RemainingBalance: remaining, POLineStatusCode: status }, line._etag, H.actorContext(actor));
        });
    };

    VMS.POLineService = POLineService;
}(window, window.jQuery));
