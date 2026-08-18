(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    function drawSimpleTable(container, columns, rows, emptyMessage) {
        var html;
        if (!rows.length) { $(container).html('<div class="vms-table-state">' + U.escapeHtml(emptyMessage) + "</div>"); return; }
        html = '<div class="vms-table-wrap"><table class="vms-table"><thead><tr>';
        $.each(columns, function (_, item) { html += '<th scope="col">' + U.escapeHtml(item.label) + "</th>"; });
        html += "</tr></thead><tbody>";
        $.each(rows, function (_, row) { html += "<tr>"; $.each(columns, function (_, item) { html += "<td>" + item.render(row) + "</td>"; }); html += "</tr>"; });
        $(container).html(html + "</tbody></table></div>");
    }

    VMS.PageControllers.PENDING_APPROVALS = {
        title: "Pending Approvals",
        run: function (user) {
            var actionable = user.RoleCode === "MANAGER" && user.FunctionCode === "VENDOR_MANAGEMENT";
            C.content('<p class="vms-context">Three independently queried approval queues. ' + (actionable ? "Actions use the same canonical workflow services as the dedicated workspaces." : "Your access is read-only; Manager approval actions are not available.") + '</p><div id="pending-summary"></div><section class="vms-panel"><h2 class="vms-section-heading">PR / PO Approvals</h2><div id="pending-prpo" class="vms-table-state">Loading...</div></section><section class="vms-panel"><h2 class="vms-section-heading">Standard Invoice Approvals</h2><div id="pending-invoices" class="vms-table-state">Loading...</div></section><section class="vms-panel"><h2 class="vms-section-heading">Direct Payment Batch Approvals</h2><div id="pending-batches" class="vms-table-state">Loading...</div></section>');
            VMS.App.pendingApprovalService.GetCounts().then(function (counts) { $("#pending-summary").html(VMS.UI.summaryCards([{ label: "PR / PO", value: counts.prpo }, { label: "Standard Invoices", value: counts.standardInvoices }, { label: "Direct Payment Batches", value: counts.directPaymentBatches }, { label: "Total Approval Units", value: counts.total }])); });
            VMS.App.pendingApprovalService.QueryPRPO({ pageSize: 25 }).then(function (result) { drawSimpleTable("#pending-prpo", [{ label: "PR Number", render: function (row) { return "<strong>" + U.escapeHtml(row.PRNumber) + "</strong>"; } }, { label: "Vendor", render: function (row) { return U.escapeHtml(row.VendorNameSnapshot); } }, { label: "Amount", render: function (row) { return VMS.UI.money(row.PRAmount, VMS.UI.lookup(row.Currency)); } }, { label: "Creation Date", render: function (row) { return VMS.UI.date(row.CreationDate); } }, { label: "Action", render: function (row) { return C.linkButton(actionable ? "Review" : "View", VMS.Config.ROUTES.PRPO_APPROVAL + "?id=" + row.ID + "&key=" + encodeURIComponent(row.PRNumber), actionable ? "btn-primary" : "btn-secondary"); } }], result.items, "No PR / PO approvals are pending."); }, function (error) { $("#pending-prpo").text(error.safeMessage); });
            VMS.App.pendingApprovalService.QueryStandardInvoices({ pageSize: 25 }).then(function (result) { drawSimpleTable("#pending-invoices", [{ label: "Invoice", render: function (row) { return "<strong>" + U.escapeHtml(row.InvoiceIdentifier) + "</strong>"; } }, { label: "Vendor", render: function (row) { return U.escapeHtml(row.VendorNameSnapshot); } }, { label: "Category", render: function (row) { return U.escapeHtml(VMS.UI.lookup(row.Category)); } }, { label: "Final Amount", render: function (row) { return VMS.UI.money(row.FinalInvoiceAmount, row.CurrencyCodeSnapshot); } }, { label: "Action", render: function (row) { var route = actionable ? VMS.Config.ROUTES.INVOICE_MANAGER_APPROVAL : VMS.Config.ROUTES.INVOICE_DETAILS; return C.linkButton(actionable ? "Review" : "View", route + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier), actionable ? "btn-primary" : "btn-secondary"); } }], result.items, "No standard Invoice approvals are pending."); }, function (error) { $("#pending-invoices").text(error.safeMessage); });
            VMS.App.pendingApprovalService.QueryDirectPaymentBatches().then(function (batches) { drawSimpleTable("#pending-batches", [{ label: "Batch", render: function (row) { return "<strong>" + U.escapeHtml(row.aggregationBatchKey) + "</strong>"; } }, { label: "Vendor", render: function (row) { return U.escapeHtml(row.vendor); } }, { label: "Invoices", render: function (row) { return U.escapeHtml(row.invoiceCount); } }, { label: "PO Line / Currency", render: function (row) { return U.escapeHtml(row.poLine + " · " + row.currency); } }, { label: "Combined Amount", render: function (row) { return VMS.UI.money(row.combinedAmount, row.currency); } }, { label: "Action", render: function (row) { return C.linkButton(actionable ? "Review Group" : "View Group", VMS.Config.ROUTES.DIRECT_PAYMENT_BATCH + "?id=" + row.leaderId + "&key=" + encodeURIComponent(row.aggregationBatchKey), actionable ? "btn-primary" : "btn-secondary"); } }], batches, "No Direct Payment batch approvals are pending."); }, function (error) { $("#pending-batches").text(error.safeMessage); });
        }
    };
}(window, window.jQuery));
