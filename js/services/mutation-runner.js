(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function MutationRunner(auditService, notificationService) {
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    MutationRunner.prototype.Run = function (definition, mutate, notificationFactory) {
        var self = this;
        var actionRequestId = definition.actionRequestId || VMS.Utilities.guid();
        var prepared;
        var committed;
        definition.actionRequestId = actionRequestId;
        return this.auditService.PrepareAction(definition).then(function (history) {
            prepared = history;
            if (history.ResultCode === "SUCCESS") {
                return VMS.Response.success("ALREADY_COMPLETED", "This action was already completed.", null, { actionRequestId: actionRequestId });
            }
            if (history.ResultCode === "FAILED") {
                return $.Deferred().reject({ code: "ACTION_ALREADY_FAILED", safeMessage: "This action request was already finalized as failed." }).promise();
            }
            if (history._isNewAction !== true) {
                return $.Deferred().reject({ code: definition.entityTypeCode === VMS.Constants.ENTITY_TYPES.DIRECT_PAYMENT_BATCH ? VMS.Constants.ERRORS.RECOVERY_REQUIRED : VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN, safeMessage: "This action request is already in a prepared state and will not be repeated until its persisted outcome is reconciled." }).promise();
            }
            return mutate(actionRequestId).then(function (result) {
                committed = result;
                return self.auditService.FinalizeSuccess(prepared, {
                    entityItemId: result && result.ID,
                    businessKey: result && (result.InvoiceIdentifier || result.PRNumber || result.POLineKey || result.VendorCode || definition.businessKey),
                    affectedItemIds: result && result.affectedItemIds,
                    deepLink: result && result.deepLink
                }).then(function () { return committed; }, function () {
                    return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN, safeMessage: "The business action committed, but its audit outcome could not be finalized safely." }).promise();
                });
            }, function (error) {
                if (!prepared || !prepared.ID || error && (error.code === VMS.Constants.ERRORS.RECOVERY_REQUIRED || error.code === VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN)) {
                    return $.Deferred().reject(error).promise();
                }
                return self.auditService.FinalizeFailure(prepared, error && error.code).then(function () {
                    return $.Deferred().reject(error).promise();
                }, function () {
                    return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN, safeMessage: "The action outcome could not be finalized safely." }).promise();
                });
            }).then(function () {
                var response = VMS.Response.success(definition.successCode || "SUCCESS", definition.successMessage || "The action was completed.", committed, { actionRequestId: actionRequestId });
                var notification;
                if (!notificationFactory) {
                    return response;
                }
                notification = notificationFactory(committed);
                if (!notification) { return response; }
                if (notification.events) {
                    var notificationChain = $.Deferred().resolve().promise();
                    $.each(notification.events, function (_, event) { notificationChain = notificationChain.then(function () { return self.notificationService.SendEventAfterCommit(event.eventCode, event.context, actionRequestId).then(function (delivery) { return event.onDelivered ? event.onDelivered(delivery) : delivery; }); }); });
                    return notificationChain.then(function () { return response; }, function () { response.warnings.push(VMS.Constants.WARNINGS.EMAIL_FAILED_AFTER_COMMIT); return response; });
                }
                return (notification.context ? self.notificationService.SendEventAfterCommit(notification.eventCode, notification.context, actionRequestId) : self.notificationService.SendAfterCommit(notification.eventCode, notification.recipients, notification.content, actionRequestId)).then(function () {
                    return response;
                }, function () {
                    response.warnings.push(VMS.Constants.WARNINGS.EMAIL_FAILED_AFTER_COMMIT);
                    return response;
                });
            });
        });
    };

    VMS.MutationRunner = MutationRunner;
}(window, window.jQuery));
