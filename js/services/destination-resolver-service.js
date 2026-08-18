(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function DestinationResolverService(accessService, config) {
        this.accessService = accessService;
        this.config = config;
    }

    DestinationResolverService.prototype._route = function (routeCode, params, interfaceCode) {
        var url = this.config.ROUTES[routeCode];
        var query = [];
        var name;
        for (name in (params || {})) {
            if (Object.prototype.hasOwnProperty.call(params, name) && params[name] !== null && params[name] !== undefined) {
                query.push(encodeURIComponent(name) + "=" + encodeURIComponent(params[name]));
            }
        }
        return { routeCode: routeCode, interfaceCode: interfaceCode || routeCode, url: url + (query.length ? "?" + query.join("&") : "") };
    };

    DestinationResolverService.prototype.ResolveNotificationDestination = function (entityType, record) {
        if (entityType === VMS.Constants.ENTITY_TYPES.VENDOR) {
            return $.inArray(record.StageCode, ["APPROVED", "REJECTED", "EXPIRED"]) >= 0 ? this._route("VENDOR_PROFILE", { id: record.ID, key: "VND-" + record.ID }) : this._route("VENDOR_LIST", {});
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.PR_PO) {
            return this._route("PRPO_APPROVAL", { id: record.ID, key: record.PRNumber });
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.PO_LINE) {
            return this._route("PO_LINE_WORKSPACE", { id: VMS.Utilities.lookupId(record.POHeader), key: record.POHeader ? record.POHeader.title : "" });
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.INVOICE || entityType === VMS.Constants.ENTITY_TYPES.DIRECT_PAYMENT_BATCH) {
            return record.DirectPayment === true && record.AggregationBatchKey ? this._route("DIRECT_PAYMENT_BATCH", { id: record.ID, key: record.AggregationBatchKey }) : this._route("INVOICE_DETAILS", { id: record.ID, key: record.InvoiceIdentifier });
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.FEEDBACK_ASSIGNMENT) {
            return this._route("FEEDBACK_FORM", { id: record.ID, key: "FDB-" + record.ID });
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.USER) {
            return this._route("OVERVIEW", {});
        }
        return null;
    };

    DestinationResolverService.prototype.ResolveEntityDestination = function (entityType, record) {
        var self = this;
        return this.accessService.AuthorizeRecord(entityType, record, "READ").then(function (context) {
            var user = context.user;
            var descriptor;
            if (entityType === VMS.Constants.ENTITY_TYPES.VENDOR) {
                descriptor = $.inArray(record.StageCode, ["APPROVED", "REJECTED", "EXPIRED"]) >= 0 ? self._route("VENDOR_PROFILE", { id: record.ID, key: "VND-" + record.ID }) : self._route("VENDOR_LIST", {});
            } else if (entityType === VMS.Constants.ENTITY_TYPES.PR_PO) {
                descriptor = record.StageCode === "PO_ACTIVE" && self.accessService.CanPerform(user, "PO_LINE_PROCESS", record) ? self._route("PO_LINE_WORKSPACE", { id: record.ID, key: record.PRNumber }) : self._route("PRPO_APPROVAL", { id: record.ID, key: record.PRNumber });
            } else if (entityType === VMS.Constants.ENTITY_TYPES.PO_LINE) {
                descriptor = self._route("PO_LINE_WORKSPACE", { id: VMS.Utilities.lookupId(record.POHeader), key: record.POHeader ? record.POHeader.title : "" });
            } else if (entityType === VMS.Constants.ENTITY_TYPES.INVOICE) {
                descriptor = self._route("INVOICE_DETAILS", { id: record.ID, key: record.InvoiceIdentifier });
                if (record.DirectPayment === true && record.StageCode === "DIRECT_PAYMENT_REVIEW" && self.accessService.CanPerform(user, "DP_REVIEW_DONE", record)) {
                    descriptor = self._route("DIRECT_PAYMENT_REVIEW", { id: record.ID, key: record.InvoiceIdentifier });
                } else if (record.DirectPayment === true && record.AggregationBatchKey && self.accessService.CanPerform(user, record.StageCode === "PENDING_APPROVAL" ? "DP_BATCH_APPROVE" : "DP_BATCH_PROCESS", record)) {
                    descriptor = self._route("DIRECT_PAYMENT_BATCH", { id: record.ID, key: record.AggregationBatchKey });
                } else if (record.DirectPayment !== true && record.StageCode === "INVOICE_PROCESSING" && self.accessService.CanPerform(user, "INVOICE_PROCESS", record)) {
                    descriptor = self._route("INVOICE_PROCESSING", { id: record.ID, key: record.InvoiceIdentifier });
                } else if (record.DirectPayment !== true && record.StageCode === "PENDING_APPROVAL" && self.accessService.CanPerform(user, "INVOICE_APPROVE", record)) {
                    descriptor = self._route("INVOICE_MANAGER_APPROVAL", { id: record.ID, key: record.InvoiceIdentifier });
                } else if (record.DirectPayment !== true && record.StageCode === "CHARGEBACK_PROCESSING" && self.accessService.CanPerform(user, "INVOICE_SETTLE", record)) {
                    descriptor = self._route("CHARGEBACK_PROCESSING", { id: record.ID, key: record.InvoiceIdentifier });
                }
            } else {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.UNSUPPORTED_OPERATION, safeMessage: "No destination is available." }).promise();
            }
            return self.accessService.AuthorizeRoute(descriptor.routeCode).then(function () { return descriptor; });
        });
    };

    DestinationResolverService.prototype.ResolveActionDestination = function (entityType, record) {
        return this.ResolveEntityDestination(entityType, record);
    };

    VMS.DestinationResolverService = DestinationResolverService;
}(window, window.jQuery));
