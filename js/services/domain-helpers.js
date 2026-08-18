(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    VMS.DomainHelpers = {
        reject: function (code, message, fieldErrors) {
            return $.Deferred().reject({ code: code, safeMessage: message, fieldErrors: fieldErrors || [] }).promise();
        },
        requireRecord: function (record) {
            if (!record) {
                return this.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested record is unavailable.");
            }
            return $.Deferred().resolve(record).promise();
        },
        verifyDeepLink: function (record, id, suppliedKey, expectedKey) {
            if (!record || Number(record.ID) !== Number(id) || VMS.Utilities.normalizeKey(suppliedKey) !== VMS.Utilities.normalizeKey(expectedKey)) {
                return this.reject(VMS.Constants.ERRORS.INVALID_LINK, "This VMS link is invalid or no longer available.");
            }
            return $.Deferred().resolve(record).promise();
        },
        actorContext: function (user) {
            return { actorPerson: { id: user.ID, title: user.UserName, email: user.Email } };
        },
        addDays: function (isoValue, days) {
            return new Date(new Date(isoValue).getTime() + (Number(days) * 86400000)).toISOString();
        },
        setting: function (repositories, itemCode) {
            return repositories.configuration.getByKey("SYSTEM_SETTING-" + itemCode).then(function (row) {
                if (!row || row.IsActive !== true) {
                    return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.CONFIGURATION_MISSING, "A required VMS setting is unavailable.");
                }
                return row;
            });
        },
        validateStage: function (record, stageCode, statusCode) {
            if (!record || record.StageCode !== stageCode || (statusCode && record.StatusCode !== statusCode)) {
                return this.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This action is not available in the record's current workflow state.");
            }
            return $.Deferred().resolve(record).promise();
        },
        queryAll: function (repository, spec) {
            var base = $.extend(true, {}, spec || {});
            var pageSize = Math.min(Number(base.pageSize || 500), 500);
            var maximum = Number(base.maximumRows || 10000);
            var items = [];
            var deferred = $.Deferred();
            delete base.maximumRows;
            function next(token) {
                var query = $.extend(true, {}, base, { pageSize: pageSize, continuationToken: token || "0" });
                repository.query(query).then(function (result) {
                    items = items.concat(result.items || []);
                    if (items.length > maximum || (result.continuationToken && items.length >= maximum)) {
                        deferred.reject({ code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The authorized query exceeds its bounded row limit." });
                        return;
                    }
                    if (result.continuationToken) {
                        next(result.continuationToken);
                    } else {
                        deferred.resolve(items);
                    }
                }, function (error) { deferred.reject(error); });
            }
            next("0");
            return deferred.promise();
        },
        normalizeSupplierInvoice: function (value) {
            return VMS.Utilities.collapseWhitespace(value).toLowerCase();
        }
    };
}(window, window.jQuery));
