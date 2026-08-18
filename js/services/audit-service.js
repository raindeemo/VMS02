(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function AuditService(repositories, accessService) {
        this.repositories = repositories;
        this.accessService = accessService;
    }

    AuditService.prototype.GetByActionRequestId = function (actionRequestId) {
        return this.repositories.history.getByKey(actionRequestId);
    };

    AuditService.prototype.CountsAsCompletedAction = function (actionCode) {
        var code = String(actionCode || "");
        if (!code || code.indexOf("ADMIN_") === 0 || code === "EXPIRE_VENDOR" || code === "VENDOR_DEACTIVATE" || code === "VENDOR_REACTIVATE" || code.indexOf("SYSTEM_") === 0 || code.indexOf("REPORT_") === 0 || code.indexOf("EXPORT_") === 0) { return false; }
        return code.indexOf("VENDOR_") === 0 || code.indexOf("PRPO_") === 0 || code.indexOf("PO_") === 0 || code.indexOf("INVOICE_") === 0 || code.indexOf("DP_") === 0 || code === "FEEDBACK_SUBMIT";
    };

    AuditService.prototype.PrepareAction = function (definition) {
        var self = this;
        return this.GetByActionRequestId(definition.actionRequestId).then(function (existing) {
            if (existing) {
                existing._isNewAction = false;
                return existing;
            }
            return (definition.systemActor ? $.Deferred().resolve({ ID: definition.systemActor.id, UserName: definition.systemActor.title, Email: definition.systemActor.email, UserKey: definition.systemActor.userKey || VMS.Utilities.normalizeKey(definition.systemActor.email) }).promise() : self.accessService.ResolveCurrentUser()).then(function (user) {
                var actor = { id: user.ID, title: user.UserName, email: user.Email };
                return self.repositories.history.create({
                    ActionRequestId: definition.actionRequestId,
                    EntityTypeCode: definition.entityTypeCode,
                    EntityItemID: Number(definition.entityItemId || 0),
                    EntityBusinessKeySnapshot: definition.businessKey || "",
                    AffectedItemIdsJSON: definition.affectedItemIds ? JSON.stringify(definition.affectedItemIds) : "",
                    FromStageCode: definition.fromStageCode || "",
                    FromStatusCode: definition.fromStatusCode || "",
                    ToStageCode: definition.toStageCode || "",
                    ToStatusCode: definition.toStatusCode || "",
                    ActionCode: definition.actionCode,
                    ResultCode: "PREPARED",
                    CountsAsCompletedAction: false,
                    PerformedBy: actor,
                    PerformedByUserKeySnapshot: user.UserKey,
                    ActionDate: VMS.ClockService.utcNow(),
                    Comment: definition.comment || "",
                    RejectionReasonCode: definition.rejectionReasonCode || "",
                    RejectionReasonSnapshot: definition.rejectionReasonSnapshot || "",
                    ChangedFieldsJSON: definition.changedFields ? JSON.stringify(definition.changedFields) : "",
                    RecordDeepLinkSnapshot: definition.deepLink || "",
                    RecoveryContextJSON: definition.recoveryContext ? JSON.stringify(definition.recoveryContext) : "",
                    ErrorCode: ""
                }, { actorPerson: actor }).then(function (created) {
                    created._isNewAction = true;
                    return created;
                });
            });
        });
    };

    AuditService.prototype.FinalizeSuccess = function (history, completionDefinition) {
        var action = completionDefinition || {};
        return this.repositories.history.update(history.ID, {
            ResultCode: "SUCCESS",
            CountsAsCompletedAction: this.CountsAsCompletedAction(history.ActionCode),
            EntityItemID: Number(action.entityItemId || history.EntityItemID || 0),
            EntityBusinessKeySnapshot: action.businessKey || history.EntityBusinessKeySnapshot,
            AffectedItemIdsJSON: action.affectedItemIds ? JSON.stringify(action.affectedItemIds) : history.AffectedItemIdsJSON,
            RecordDeepLinkSnapshot: action.deepLink || history.RecordDeepLinkSnapshot,
            RecoveryContextJSON: "",
            ErrorCode: ""
        }, history._etag);
    };

    AuditService.prototype.FinalizeFailure = function (history, errorCode) {
        return this.repositories.history.update(history.ID, {
            ResultCode: "FAILED",
            CountsAsCompletedAction: false,
            ErrorCode: errorCode || VMS.Constants.ERRORS.SERVICE_UNAVAILABLE,
            RecoveryContextJSON: ""
        }, history._etag);
    };

    AuditService.prototype.VerifyPreparedOutcome = function (history, verifier) {
        return verifier(history);
    };

    VMS.AuditService = AuditService;
}(window, window.jQuery));
