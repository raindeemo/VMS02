(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    VMS.PageControllers.DIRECT_PAYMENT_REVIEW = {
        title: "Direct Payment Review",
        run: function () {
            var table;
            C.content('<p class="vms-context">Review individual Direct Payment requests before monthly aggregation.</p><section class="vms-panel"><div id="dp-review-table"></div></section>');
            table = new VMS.TableComponent("#dp-review-table", {
                id: "dp-review", searchPlaceholder: "Search Invoice or Focal Point", searchFields: ["InvoiceIdentifier", "FocalPointName"], sort: [{ field: "InvoiceInitiationDate", direction: "ASC" }],
                query: function (spec) { return VMS.App.directPaymentBatchService.QueryReview(spec); },
                columns: [
                    { label: "Invoice", render: function (row) { return '<strong>' + U.escapeHtml(row.InvoiceIdentifier) + "</strong>"; } },
                    { label: "Source", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.InvoiceSourceFunctionCode)); } },
                    { label: "Category", render: function (row) { return U.escapeHtml(VMS.UI.lookup(row.Category)); } },
                    { label: "Focal Point", render: function (row) { return U.escapeHtml(row.FocalPointName); } },
                    { label: "Initiated", render: function (row) { return VMS.UI.date(row.InvoiceInitiationDate); } }
                ],
                actions: function (row) { return C.actionButton("Done", "done", row.ID, "btn-primary") + C.actionButton("Reject", "reject", row.ID, "btn-danger"); },
                onAction: function (action, id) {
                    VMS.App.directPaymentBatchService.GetReviewOptions(id).then(function (options) {
                        var record = options.record;
                        if (action === "done") { C.confirmationThen({ title: "Complete Direct Payment Review", message: "Mark " + record.InvoiceIdentifier + " as Done and place it in the current monthly aggregation buffer?", actionLabel: "Done" }, function () { return VMS.App.invoiceService.ReviewDirectPaymentDone(record.ID, record._etag, U.guid()); }, function () { table.load(); }); }
                        if (action === "reject") { VMS.UI.modalForm({ title: "Reject Direct Payment", submitLabel: "Reject", bodyHtml: VMS.UI.field("reason", "Rejection Reason", "select", "", true, C.options(options.rejectionReasons, "ItemCode", "DisplayLabel")) + VMS.UI.field("comment", "Comment", "textarea", "", false), onSubmit: function (form) { return VMS.App.invoiceService.ReviewDirectPaymentReject(record.ID, record._etag, VMS.UI.formValue(form, "reason"), VMS.UI.formValue(form, "comment"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); table.load(); }); }
                    });
                }
            });
            table.render();
        }
    };

    function renderBatchMembers(members, actions) {
        var html = '<div class="vms-table-wrap"><table class="vms-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Source</th><th scope="col">Category</th><th scope="col">Supplier Number</th><th scope="col">Final Amount</th><th scope="col">State</th>' + (actions ? '<th scope="col">Actions</th>' : "") + '</tr></thead><tbody>';
        $.each(members, function (_, member) {
            html += '<tr><td><a href="' + VMS.Config.ROUTES.INVOICE_DETAILS + "?id=" + member.ID + "&key=" + encodeURIComponent(member.InvoiceIdentifier) + '">' + U.escapeHtml(member.InvoiceIdentifier) + '</a></td><td>' + U.escapeHtml(VMS.UI.titleize(member.InvoiceSourceFunctionCode)) + '</td><td>' + U.escapeHtml(VMS.UI.lookup(member.Category)) + '</td><td>' + U.escapeHtml(member.InvoiceNumber || "Not entered") + '</td><td>' + VMS.UI.money(member.FinalInvoiceAmount, member.CurrencyCodeSnapshot) + '</td><td>' + VMS.UI.status(member.StageCode) + '</td>' + (actions ? '<td class="vms-actions">' + actions(member) + "</td>" : "") + "</tr>";
        });
        return html + "</tbody></table></div>";
    }

    function openMemberFinancial(batch, member, refresh) {
        var body = VMS.UI.field("InvoiceNumber", "Supplier Invoice Number", "text", member.InvoiceNumber, true) + VMS.UI.field("CostCenter", "Cost Center", "text", member.CostCenter || "", true) + VMS.UI.field("TotalPrice", "Total Price", "number", member.TotalPrice, true) +
            '<div class="form-check mb-3"><input class="form-check-input" id="dp-has-discount" name="HasDiscount" type="checkbox"' + (member.HasDiscount ? " checked" : "") + '><label class="form-check-label" for="dp-has-discount">Has Discount</label></div>' + VMS.UI.field("DiscountInputTypeCode", "Discount Type", "select", member.DiscountInputTypeCode, false, [{ value: "PERCENTAGE", label: "Percentage" }, { value: "AMOUNT", label: "Amount" }]) + VMS.UI.field("DiscountInputValue", "Discount Value", "number", member.DiscountInputValue, false) +
            '<div class="form-check mb-3"><input class="form-check-input" id="dp-has-vat" name="HasVAT" type="checkbox"' + (member.HasVAT ? " checked" : "") + '><label class="form-check-label" for="dp-has-vat">Has VAT</label></div>' + VMS.UI.field("VATInputTypeCode", "VAT Type", "select", member.VATInputTypeCode, false, [{ value: "PERCENTAGE", label: "Percentage" }, { value: "AMOUNT", label: "Amount" }]) + VMS.UI.field("VATInputValue", "VAT Value", "number", member.VATInputValue, false);
        VMS.UI.modalForm({ title: "Process Batch Member", submitLabel: "Save Member Draft", bodyHtml: '<div class="vms-info-panel">Batch PO Line: ' + U.escapeHtml(batch.leader.POLineKeySnapshot) + " · Currency: " + U.escapeHtml(batch.leader.CurrencyCodeSnapshot) + "</div>" + body, onSubmit: function (form) { return VMS.App.directPaymentBatchService.SaveMemberDraft(batch.batchKey, member.ID, member._etag, batch.version, { InvoiceNumber: VMS.UI.formValue(form, "InvoiceNumber"), CostCenter: VMS.UI.formValue(form, "CostCenter"), TotalPrice: VMS.UI.formValue(form, "TotalPrice"), HasDiscount: form.find('[name="HasDiscount"]').is(":checked"), DiscountInputTypeCode: VMS.UI.formValue(form, "DiscountInputTypeCode"), DiscountInputValue: VMS.UI.formValue(form, "DiscountInputValue"), HasVAT: form.find('[name="HasVAT"]').is(":checked"), VATInputTypeCode: VMS.UI.formValue(form, "VATInputTypeCode"), VATInputValue: VMS.UI.formValue(form, "VATInputValue") }, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
    }

    function openMemberChargeback(batch, member, refresh) {
        var body = '<div class="vms-info-panel">Settlement applicability is derived per member. The complete batch remains one workflow unit.</div>';
        if (member.InvoiceSourceFunctionCode === "EXECUTION" && Number(member.GlobalLearnerCount) > 0) { body += VMS.UI.field("EBillingSettlement", "E-Billing Settlement", "select", member.EBillingSettlement === true ? "true" : member.EBillingSettlement === false ? "false" : "", true, [{ value: "true", label: "Completed" }, { value: "false", label: "Not Completed" }]); }
        if (member.InvoiceSourceFunctionCode === "EXECUTION" && Number(member.MEALearnerCount) > 0) { body += VMS.UI.field("LMSSettlement", "LMS Settlement", "select", member.LMSSettlement === true ? "true" : member.LMSSettlement === false ? "false" : "", true, [{ value: "true", label: "Completed" }, { value: "false", label: "Not Completed" }]); }
        body += VMS.UI.field("Comment", "Comment", "textarea", member.Comment, false);
        VMS.UI.modalForm({ title: "Chargeback Member", submitLabel: "Save Member", bodyHtml: body, onSubmit: function (form) { return VMS.App.directPaymentBatchService.SaveChargebackMember(batch.batchKey, member.ID, member._etag, batch.version, { EBillingSettlement: VMS.UI.formValue(form, "EBillingSettlement") === "true", LMSSettlement: VMS.UI.formValue(form, "LMSSettlement") === "true", Comment: VMS.UI.formValue(form, "Comment") }, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
    }

    function renderBatchWorkspace(batch, user) {
        var stage = batch.leader.StageCode;
        var blocked = $.inArray(batch.leader.BatchOperationStateCode, ["PREPARED", "RECOVERY_REQUIRED"]) >= 0;
        var processor = !blocked && VMS.App.accessService.CanPerform(user, stage === "CHARGEBACK_PROCESSING" ? "DP_BATCH_SETTLE" : "DP_BATCH_PROCESS", batch.leader);
        var manager = user.RoleCode === "MANAGER" && user.FunctionCode === "VENDOR_MANAGEMENT";
        var actions = null;
        var footer = "";
        var diagnostic = blocked ? '<div class="alert alert-warning" role="status">Normal batch actions are unavailable while this group is being recovered.' + (batch.leader.BatchOperationId ? " Operation ID: " + U.escapeHtml(batch.leader.BatchOperationId) : "") + "</div>" : "";
        if (stage === "INVOICE_PROCESSING" && processor) {
            actions = function (member) { return C.actionButton("Process", "process", member.ID, "btn-primary"); };
            footer = '<button id="dp-select-line" class="btn btn-secondary" type="button">' + (batch.leader.POLineKeySnapshot ? "Change Batch PO Line" : "Select Batch PO Line") + '</button> <button id="dp-submit-group" class="btn btn-primary" type="button">Submit Group for Approval</button>';
        } else if (stage === "PENDING_APPROVAL" && manager && !blocked) {
            footer = '<button id="dp-return-group" class="btn btn-secondary" type="button">Update Required Group</button> <button id="dp-approve-group" class="btn btn-primary" type="button">Approve Group</button>';
        } else if (stage === "CHARGEBACK_PROCESSING" && processor) {
            actions = function (member) { return C.actionButton("Complete", "chargeback", member.ID, "btn-primary"); };
            footer = '<button id="dp-settle-group" class="btn btn-primary" type="button">Settle Group</button>';
        }
        C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(batch.batchKey) + '</h2><p class="vms-context">One operational group · Version ' + batch.version + " · " + VMS.UI.status(stage) + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.DIRECT_PAYMENT_BATCH + '">Back to Batches</a></div>' + diagnostic + VMS.UI.summaryCards([{ label: "Invoices", value: batch.members.length }, { label: "Vendor", value: batch.leader.VendorNameSnapshot }, { label: "Batch PO Line", value: batch.leader.POLineKeySnapshot || "Not selected" }, { label: "Currency", value: batch.leader.CurrencyCodeSnapshot || "Not selected" }]) + '<section class="vms-panel">' + renderBatchMembers(batch.members, actions) + '</section><div class="text-right">' + footer + "</div>");
        $("#vms-main-content").on("click", "[data-action=process]", function () { var id = Number($(this).attr("data-id")); openMemberFinancial(batch, $.grep(batch.members, function (member) { return member.ID === id; })[0], function () { window.location.reload(); }); });
        $("#vms-main-content").on("click", "[data-action=chargeback]", function () { var id = Number($(this).attr("data-id")); openMemberChargeback(batch, $.grep(batch.members, function (member) { return member.ID === id; })[0], function () { window.location.reload(); }); });
        $("#dp-select-line").on("click", function () {
            VMS.App.directPaymentBatchService.GetBatchPOLines(batch.batchKey).then(function (lines) {
                VMS.UI.modalForm({ title: "Select Batch PO Line", submitLabel: "Apply to Complete Batch", bodyHtml: '<div class="vms-info-panel">The selected PO Line and its Currency apply to every batch member. Saved member calculations must be reviewed after a change.</div>' + VMS.UI.field("POLine", "Batch PO Line", "select", VMS.Utilities.lookupId(batch.leader.POLine), true, $.map(lines, function (line) { return { value: line.ID, label: line.PONumber + " · Line " + line.POLineNumber + " · " + line.CurrencyCode + " · Remaining " + Number(line.RemainingBalance).toFixed(2) }; })), onSubmit: function (form) { return VMS.App.directPaymentBatchService.SelectBatchPOLine(batch.batchKey, Number(VMS.UI.formValue(form, "POLine")), batch.version, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.reload(); });
            }, C.fail);
        });
        $("#dp-submit-group").on("click", function () { C.confirmationThen({ title: "Submit Complete Batch", message: "Submit every member of " + batch.batchKey + " for Manager approval as one group?", actionLabel: "Submit Group" }, function () { return VMS.App.directPaymentBatchService.SubmitGroup(batch.batchKey, batch.version, U.guid()); }, function () { window.location.reload(); }); });
        $("#dp-approve-group").on("click", function () { C.confirmationThen({ title: "Approve Complete Batch", message: "Approve every member and consume the one selected batch PO Line once by the combined amount?", actionLabel: "Approve Group" }, function () { return VMS.App.directPaymentBatchService.ApproveGroup(batch.batchKey, batch.version, U.guid()); }, function () { window.location.reload(); }); });
        $("#dp-return-group").on("click", function () { VMS.UI.modalForm({ title: "Update Required Group", submitLabel: "Return Complete Group", bodyHtml: VMS.UI.field("reason", "Reason", "textarea", "", true), onSubmit: function (form) { return VMS.App.directPaymentBatchService.ReturnGroup(batch.batchKey, batch.version, VMS.UI.formValue(form, "reason"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.reload(); }); });
        $("#dp-settle-group").on("click", function () { C.confirmationThen({ title: "Settle Complete Batch", message: "Settle every member of this Direct Payment batch? No PO Line amount will be consumed at Settlement.", actionLabel: "Settle Group" }, function () { return VMS.App.directPaymentBatchService.SettleGroup(batch.batchKey, batch.version, U.guid()); }, function () { window.location.reload(); }); });
    }

    function renderBuffers(user) {
        var canRelease = VMS.App.accessService.CanPerform(user, "DP_BATCH_RELEASE", {});
        $.when(VMS.App.directPaymentBatchService.QueryBuffers(), VMS.App.directPaymentBatchService.QueryReleasedBatches()).then(function (buffers, batches) {
            var bufferRows = "";
            var releasedRows = "";
            var actionHeading = canRelease ? '<th scope="col">Actions</th>' : "";
            $.each(buffers, function (_, group) {
                var action = canRelease ? '<td class="vms-actions">' + C.actionButton("Release", "release", group.leaderId, "btn-primary").replace('data-id="' + group.leaderId + '"', 'data-id="' + group.leaderId + '" data-period="' + group.period + '" data-version="' + group.version + '"') + "</td>" : "";
                bufferRows += '<tr><td><strong>' + U.escapeHtml(group.batchKey) + '</strong></td><td>' + U.escapeHtml(group.period) + '</td><td>' + U.escapeHtml(group.vendorName) + '</td><td>' + group.invoiceCount + "</td>" + action + "</tr>";
            });
            $.each(batches, function (_, batch) {
                releasedRows += '<tr><td><a href="' + VMS.Config.ROUTES.DIRECT_PAYMENT_BATCH + "?id=" + batch.leaderId + "&key=" + encodeURIComponent(batch.aggregationBatchKey) + '">' + U.escapeHtml(batch.aggregationBatchKey) + '</a></td><td>' + batch.invoiceCount + '</td><td>' + U.escapeHtml(batch.poLineKey || "Not selected") + '</td><td>' + U.escapeHtml(batch.currency || "Not selected") + '</td><td>' + VMS.UI.status(batch.operationStateCode === "RECOVERY_REQUIRED" ? "RECOVERY_REQUIRED" : batch.stageCode) + "</td></tr>";
            });
            C.content('<p class="vms-context">Monthly Direct Payment buffers and released operational groups.</p><section class="vms-panel"><h2 class="vms-section-heading">Monthly Aggregation Buffers</h2>' + (bufferRows ? '<div class="vms-table-wrap"><table class="vms-table"><thead><tr><th scope="col">Batch</th><th scope="col">Period</th><th scope="col">Fixed Vendor</th><th scope="col">Invoices</th>' + actionHeading + "</tr></thead><tbody>" + bufferRows + "</tbody></table></div>" : '<div class="vms-table-state">No monthly buffers are ready.</div>') + '</section><section class="vms-panel"><h2 class="vms-section-heading">Released Batches</h2>' + (releasedRows ? '<div class="vms-table-wrap"><table class="vms-table"><thead><tr><th scope="col">Batch</th><th scope="col">Invoices</th><th scope="col">PO Line</th><th scope="col">Currency</th><th scope="col">State</th></tr></thead><tbody>' + releasedRows + "</tbody></table></div>" : '<div class="vms-table-state">No released batches are available.</div>') + "</section>");
            if (!canRelease) { return; }
            $("#vms-main-content").on("click", "[data-action=release]", function () {
                var period = $(this).attr("data-period");
                var version = Number($(this).attr("data-version"));
                C.confirmationThen({ title: "Release Direct Payment Batch", message: "Release every eligible member of DP-" + period + " to grouped Invoice Processing? The batch PO Line will be selected in the processing workspace.", actionLabel: "Release Complete Batch" }, function () { return VMS.App.directPaymentBatchService.Release(period, version, U.guid()); }, function (response) { window.location.href = VMS.Config.ROUTES.DIRECT_PAYMENT_BATCH + "?id=" + response.data.ID + "&key=" + encodeURIComponent("DP-" + period); });
            });
        }, C.fail);
    }

    VMS.PageControllers.DIRECT_PAYMENT_BATCH = {
        title: "Direct Payment Batch",
        run: function (user) {
            var query = C.query();
            if (!query.id || !query.key) { renderBuffers(user); return; }
            C.loading("Loading complete Direct Payment batch...");
            VMS.App.directPaymentBatchService.GetBatch(query.id, query.key).then(function (batch) { renderBatchWorkspace(batch, user); }, C.fail);
        }
    };
}(window, window.jQuery));
