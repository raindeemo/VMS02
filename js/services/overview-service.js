(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function OverviewService(repositories, accessService, destinationResolverService) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.destinationResolverService = destinationResolverService;
    }

    OverviewService.prototype.GetRecentWork = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.OVERVIEW).then(function (user) {
            return self.repositories.history.query({ filters: [{ field: "ResultCode", op: "eq", value: "SUCCESS" }, { field: "CountsAsCompletedAction", op: "eq", value: true }, { field: "PerformedByUserKeySnapshot", op: "eq", value: user.UserKey }], select: ["ID", "EntityTypeCode", "EntityItemID", "EntityBusinessKeySnapshot", "ActionCode", "ActionDate", "ToStageCode", "ToStatusCode"], sort: [{ field: "ActionDate", direction: "DESC" }, { field: "ID", direction: "DESC" }], pageSize: 25 });
        }).then(function (result) {
            var output = [];
            var chain = $.Deferred().resolve().promise();
            $.each(result.items, function (_, item) {
                chain = chain.then(function () {
                    var repository = item.EntityTypeCode === "VENDOR" ? self.repositories.vendors : item.EntityTypeCode === "PR_PO" ? self.repositories.prpo : item.EntityTypeCode === "PO_LINE" ? self.repositories.poLines : (item.EntityTypeCode === "INVOICE" || item.EntityTypeCode === "DIRECT_PAYMENT_BATCH") ? self.repositories.invoices : null;
                    if (!repository || output.length >= 4) { return; }
                    return repository.getById(item.EntityItemID).then(function (record) {
                        if (!record) { return; }
                        return self.destinationResolverService.ResolveEntityDestination(item.EntityTypeCode === "DIRECT_PAYMENT_BATCH" ? "INVOICE" : item.EntityTypeCode, record).then(function (destination) {
                            item.destination = destination.url;
                            output.push(item);
                        }, function () {});
                    });
                });
            });
            return chain.then(function () { return output; });
        });
    };

    OverviewService.prototype.GetOpenWork = function () {
        var self = this;
        var user;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.OVERVIEW).then(function (value) {
            user = value;
            return $.when(self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.VENDOR, "OPEN_WORK"), self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PR_PO, "OPEN_WORK"), self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.PO_LINE, "OPEN_WORK"), self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "OPEN_WORK"));
        }).then(function (vendorContext, prpoContext, lineContext, invoiceContext) {
            return $.when(H.queryAll(self.repositories.vendors, { authorizationScope: vendorContext.scope }), H.queryAll(self.repositories.prpo, { authorizationScope: prpoContext.scope }), H.queryAll(self.repositories.poLines, { authorizationScope: lineContext.scope }), H.queryAll(self.repositories.invoices, { filters: [{ field: "IsActive", op: "eq", value: true }], authorizationScope: invoiceContext.scope }));
        }).then(function (vendors, prpos, lines, invoices) {
            var count = 0;
            var batchKeys = {};
            var operational = $.inArray(user.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0;
            var admin = $.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) >= 0;
            if (user.FunctionCode === "VENDOR_MANAGEMENT" || admin) {
                count += $.grep(vendors, function (row) { return row.StatusCode === "IN_PROGRESS"; }).length;
                if (operational || admin) {
                    count += $.grep(prpos, function (row) { return row.StageCode === "UPDATE_REQUIRED" || row.StageCode === "PENDING_GPS"; }).length;
                    count += $.grep(lines, function (row) { return row.IsActive === true && row.IsCancelled !== true && (row.LineRequestStageCode === "PLANNED" || row.LineRequestStageCode === "CREATION"); }).length;
                    $.each(invoices, function (_, row) {
                        if (row.DirectPayment === true && user.IsDirectPaymentAuthorized === true && $.inArray(row.StageCode, ["PAYMENT_AGGREGATION", "INVOICE_PROCESSING", "CHARGEBACK_PROCESSING"]) >= 0) {
                            if (row.StageCode === "PAYMENT_AGGREGATION" || row.AggregationReleaseDate) { batchKeys[row.AggregationBatchKey] = true; }
                        } else if (row.DirectPayment === true && row.StageCode === "DIRECT_PAYMENT_REVIEW" && (user.IsDirectPaymentAuthorized === true || admin)) {
                            count += 1;
                        } else if (row.DirectPayment !== true && $.inArray(row.StageCode, ["INVOICE_PROCESSING", "CHARGEBACK_PROCESSING"]) >= 0) {
                            count += 1;
                        }
                    });
                }
            }
            count += Object.keys(batchKeys).length;
            return { count: count };
        });
    };

    OverviewService.prototype.GetSummary = function () {
        var self = this;
        var user;
        var openWork;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.OVERVIEW).then(function (value) {
            user = value;
            return self.GetOpenWork();
        }).then(function (value) {
            openWork = value.count;
            return $.when(
                self.repositories.feedbackAssignments.count({ filters: [{ field: "AssignedUserEmail", op: "eq", value: user.Email }, { field: "AssignmentStatusCode", op: "eq", value: "OPEN" }, { field: "IsActive", op: "eq", value: true }], authorizationScope: { predicate: function (row) { return VMS.Utilities.normalizeKey(row.AssignedUserEmail) === user.UserKey; } } }),
                self.repositories.history.count({ filters: [{ field: "ResultCode", op: "eq", value: "SUCCESS" }, { field: "CountsAsCompletedAction", op: "eq", value: true }, { field: "PerformedByUserKeySnapshot", op: "eq", value: user.UserKey }] }),
                self.GetRecentWork(),
                H.setting(self.repositories, "POWER_BI_DASHBOARD_URL")
            );
        }).then(function (surveyCount, completedCount, recentWork, dashboard) {
            var pendingVisible = $.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN", "UPPER_MANAGEMENT"]) >= 0 || (user.RoleCode === "MANAGER" && user.FunctionCode === "VENDOR_MANAGEMENT");
            var feedbackVisible = $.inArray(user.RoleCode, ["MANAGER", "EMPLOYEE", "CO_OP"]) >= 0 && $.inArray(user.FunctionCode, ["LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP", "VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM"]) >= 0;
            return { openWorkItems: openWork, assignedSurveys: feedbackVisible ? surveyCount : null, pendingApprovalsVisible: pendingVisible, completedActions: completedCount, recentWork: recentWork, dashboardUrl: dashboard.TextValue || null };
        });
    };

    VMS.OverviewService = OverviewService;
}(window, window.jQuery));
