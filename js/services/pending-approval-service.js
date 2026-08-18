(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function PendingApprovalService(repositories, accessService) {
        this.repositories = repositories;
        this.accessService = accessService;
    }

    PendingApprovalService.prototype._authorize = function () {
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.PENDING_APPROVALS);
    };

    PendingApprovalService.prototype.QueryPRPO = function (querySpec) {
        var self = this;
        return this._authorize().then(function () { return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PR_PO, "PENDING_APPROVALS"); }).then(function (context) {
            var spec = $.extend(true, {}, querySpec || {}, { authorizationScope: context.scope });
            spec.filters = (spec.filters || []).concat([{ field: "StageCode", op: "eq", value: "MANAGER_REVIEW" }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }]);
            spec.sort = [{ field: "CreationDate", direction: "ASC" }, { field: "ID", direction: "ASC" }];
            return self.repositories.prpo.query(spec);
        });
    };

    PendingApprovalService.prototype.QueryStandardInvoices = function (querySpec) {
        var self = this;
        return this._authorize().then(function () { return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "PENDING_APPROVALS"); }).then(function (context) {
            var spec = $.extend(true, {}, querySpec || {}, { authorizationScope: context.scope });
            spec.filters = (spec.filters || []).concat([{ field: "DirectPayment", op: "eq", value: false }, { field: "StageCode", op: "eq", value: "PENDING_APPROVAL" }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "IsActive", op: "eq", value: true }]);
            spec.sort = [{ field: "ProcessingDate", direction: "ASC" }, { field: "ID", direction: "ASC" }];
            return self.repositories.invoices.query(spec);
        });
    };

    PendingApprovalService.prototype.QueryDirectPaymentBatches = function () {
        var self = this;
        return this._authorize().then(function () { return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "PENDING_APPROVALS"); }).then(function (context) {
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "DirectPayment", op: "eq", value: true }, { field: "StageCode", op: "eq", value: "PENDING_APPROVAL" }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "IsActive", op: "eq", value: true }], authorizationScope: context.scope, sort: [{ field: "InvoiceInitiationDate", direction: "ASC" }] });
        }).then(function (rows) {
            var batches = {};
            $.each(rows, function (_, row) {
                var key = row.AggregationBatchKey;
                if (!batches[key]) { batches[key] = { aggregationBatchKey: key, aggregationPeriod: row.AggregationPeriod, leaderId: row.ID, vendor: row.VendorNameSnapshot, invoiceCount: 0, poLine: row.POLineKeySnapshot, currency: row.CurrencyCodeSnapshot, combinedAmount: 0, combinedAmountSAR: 0, oldestInvoiceInitiationDate: row.InvoiceInitiationDate, batchVersion: row.BatchVersion }; }
                batches[key].invoiceCount += 1;
                batches[key].combinedAmount += Number(row.FinalInvoiceAmount || 0);
                batches[key].combinedAmountSAR += Number(row.FinalInvoiceAmountInSAR || 0);
            });
            return $.map(batches, function (batch) { batch.combinedAmount = VMS.Utilities.roundHalfAwayFromZero(batch.combinedAmount, 2); batch.combinedAmountSAR = VMS.Utilities.roundHalfAwayFromZero(batch.combinedAmountSAR, 2); return batch; });
        });
    };

    PendingApprovalService.prototype.GetCounts = function () {
        var self = this;
        return $.when(this.QueryPRPO({ pageSize: 1 }), this.QueryStandardInvoices({ pageSize: 1 }), this.QueryDirectPaymentBatches()).then(function (prpo, invoice, batches) {
            return { prpo: prpo.totalCount, standardInvoices: invoice.totalCount, directPaymentBatches: batches.length, total: prpo.totalCount + invoice.totalCount + batches.length };
        });
    };

    VMS.PendingApprovalService = PendingApprovalService;
}(window, window.jQuery));
