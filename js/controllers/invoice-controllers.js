(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    function openInvoiceCreate(sourceFunction, refresh) {
        VMS.App.invoiceService.GetCreationLookups(sourceFunction).then(function (lookups) {
            var vendors = lookups.vendors;
            var categories = lookups.categories;
            var focals = lookups.focalPoints;
            var configuration = lookups.configuration;
            var regions = $.grep(configuration, function (row) { return row.GroupCode === "REGION"; });
            var managed = $.grep(configuration, function (row) { return row.GroupCode === "INVOICE_MANAGED_BY"; });
            categories = $.grep(categories, function (row) { return sourceFunction === "EDUCATION_PROGRAM" ? row.FunctionCode === "EDUCATION_PROGRAM" : row.FunctionCode !== "EDUCATION_PROGRAM" && row.FunctionCode !== "ADMINISTRATION"; });
            var body = '<div class="vms-info-panel">Source Function: <strong>' + U.escapeHtml(VMS.UI.titleize(sourceFunction)) + '</strong></div>' +
                '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("Vendor", "Vendor", "select", "", true, C.lookupOptions(vendors, "DisplayName")) + '</div><div class="col-md-6">' + VMS.UI.field("Category", "Category", "select", "", true, C.lookupOptions(categories, "DisplayLabel")) + "</div></div>" +
                VMS.UI.field("FocalPointEmail", "Focal Point", "select", "", true, C.options(focals, "Email", "UserName"));
            if (sourceFunction === "EXECUTION") {
                body += '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("RegionCode", "Region", "select", "", true, C.options(regions, "ItemCode", "DisplayLabel")) + '</div><div class="col-md-6">' + VMS.UI.field("ManagedByCode", "Managed By", "select", "", true, C.options(managed, "ItemCode", "DisplayLabel")) + "</div></div>" +
                    '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("ClassStartDate", "Class Start Date", "date", "", true) + '</div><div class="col-md-6">' + VMS.UI.field("ClassEndDate", "Class End Date", "date", "", true) + "</div></div>" +
                    '<div class="form-row"><div class="col-md-4">' + VMS.UI.field("ClassCode1", "Class Code 1", "text", "", true) + '</div><div class="col-md-4">' + VMS.UI.field("ClassCode2", "Class Code 2", "text", "", false) + '</div><div class="col-md-4">' + VMS.UI.field("ClassCode3", "Class Code 3", "text", "", false) + "</div></div>" +
                    '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("MEALearnerCount", "MEA Learner Count", "number", "0", true) + '</div><div class="col-md-6">' + VMS.UI.field("GlobalLearnerCount", "Global Learner Count", "number", "0", true) + "</div></div>";
            } else {
                body += VMS.UI.field("StudentCount", "Student Count (optional)", "number", "", false);
            }
            body += '<div class="form-check mb-3"><input class="form-check-input" id="direct-payment" name="DirectPayment" type="checkbox"><label class="form-check-label" for="direct-payment">Direct Payment</label></div><div class="form-check mb-3"><input class="form-check-input" id="advance-payment" name="AdvancePayment" type="checkbox"><label class="form-check-label" for="advance-payment">Advance Payment</label></div>' +
                VMS.UI.field("PaymentLink", "Payment Link (HTTPS for Direct Payment)", "url", "", false) + VMS.UI.field("DirectInformation", "Direct Information", "textarea", "", false) + VMS.UI.field("Comment", "Comment", "textarea", "", false) + VMS.App.fileHandlingService.attachmentField("Attachments", "Invoice attachments", true, ".pdf,.docx");
            VMS.UI.modalForm({ title: sourceFunction === "EXECUTION" ? "Add Execution Invoice" : "Add Education Program Invoice", size: "modal-lg", submitLabel: "Create Invoice", bodyHtml: body, onSubmit: function (form) {
                var input = { Vendor: Number(VMS.UI.formValue(form, "Vendor")), Category: Number(VMS.UI.formValue(form, "Category")), FocalPointEmail: VMS.UI.formValue(form, "FocalPointEmail"), RegionCode: VMS.UI.formValue(form, "RegionCode"), ManagedByCode: VMS.UI.formValue(form, "ManagedByCode"), ClassStartDate: VMS.UI.formValue(form, "ClassStartDate"), ClassEndDate: VMS.UI.formValue(form, "ClassEndDate"), ClassCode1: VMS.UI.formValue(form, "ClassCode1"), ClassCode2: VMS.UI.formValue(form, "ClassCode2"), ClassCode3: VMS.UI.formValue(form, "ClassCode3"), MEALearnerCount: VMS.UI.formValue(form, "MEALearnerCount"), GlobalLearnerCount: VMS.UI.formValue(form, "GlobalLearnerCount"), StudentCount: VMS.UI.formValue(form, "StudentCount"), DirectPayment: form.find('[name="DirectPayment"]').is(":checked"), AdvancePayment: form.find('[name="AdvancePayment"]').is(":checked"), PaymentLink: VMS.UI.formValue(form, "PaymentLink"), DirectInformation: VMS.UI.formValue(form, "DirectInformation"), Comment: VMS.UI.formValue(form, "Comment"), Attachments: VMS.App.fileHandlingService.fromInput(form.find('[name="Attachments"]')[0]) };
                return sourceFunction === "EXECUTION" ? VMS.App.invoiceService.CreateExecution(input, U.guid()) : VMS.App.invoiceService.CreateEducationProgram(input, U.guid());
            } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
        }, VMS.UI.handleError);
    }

    function invoiceDestination(row) {
        if (row.DirectPayment === true && row.StageCode === "DIRECT_PAYMENT_REVIEW") { return VMS.Config.ROUTES.DIRECT_PAYMENT_REVIEW + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier); }
        if (row.DirectPayment === true && row.AggregationBatchKey) { return VMS.Config.ROUTES.INVOICE_DETAILS + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier); }
        if (row.StageCode === "INVOICE_PROCESSING") { return VMS.Config.ROUTES.INVOICE_PROCESSING + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier); }
        if (row.StageCode === "PENDING_APPROVAL") { return VMS.Config.ROUTES.INVOICE_MANAGER_APPROVAL + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier); }
        if (row.StageCode === "CHARGEBACK_PROCESSING") { return VMS.Config.ROUTES.CHARGEBACK_PROCESSING + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier); }
        return VMS.Config.ROUTES.INVOICE_DETAILS + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier);
    }

    function openInvoiceAdmin(id, refresh) {
        VMS.App.invoiceService.GetAdministrationItem(id).then(function (context) {
            var record = context.record;
            if (context.creationMetadataLocked) { VMS.UI.toast("warning", "Metadata locked", "Invoice creation metadata is locked after first submission to Manager approval."); return; }
            VMS.App.invoiceService.GetCreationLookups(record.InvoiceSourceFunctionCode).then(function (lookups) {
                var categories = $.grep(lookups.categories, function (row) { return record.InvoiceSourceFunctionCode === "EDUCATION_PROGRAM" ? row.FunctionCode === "EDUCATION_PROGRAM" : row.FunctionCode !== "EDUCATION_PROGRAM" && row.FunctionCode !== "ADMINISTRATION"; });
                var regions = $.grep(lookups.configuration, function (row) { return row.GroupCode === "REGION"; });
                var managed = $.grep(lookups.configuration, function (row) { return row.GroupCode === "INVOICE_MANAGED_BY"; });
                var body = '<div class="vms-info-panel">Invoice identity, Vendor, source Function, financial processing, workflow, batch, and PO-consumption fields remain locked.</div>' + VMS.UI.field("Category", "Category", "select", U.lookupId(record.Category), true, C.lookupOptions(categories, "DisplayLabel")) + VMS.UI.field("FocalPointEmail", "Focal Point", "select", record.FocalPointEmail, true, C.options(lookups.focalPoints, "Email", "UserName"));
                if (record.InvoiceSourceFunctionCode === "EXECUTION") {
                    body += '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("RegionCode", "Region", "select", record.RegionCode, true, C.options(regions, "ItemCode", "DisplayLabel")) + '</div><div class="col-md-6">' + VMS.UI.field("ManagedByCode", "Managed By", "select", record.ManagedByCode, true, C.options(managed, "ItemCode", "DisplayLabel")) + "</div></div>" +
                        '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("ClassStartDate", "Class Start Date", "date", record.ClassStartDate ? record.ClassStartDate.substring(0, 10) : "", true) + '</div><div class="col-md-6">' + VMS.UI.field("ClassEndDate", "Class End Date", "date", record.ClassEndDate ? record.ClassEndDate.substring(0, 10) : "", true) + "</div></div>" +
                        '<div class="form-row"><div class="col-md-4">' + VMS.UI.field("ClassCode1", "Class Code 1", "text", record.ClassCode1, true) + '</div><div class="col-md-4">' + VMS.UI.field("ClassCode2", "Class Code 2", "text", record.ClassCode2, false) + '</div><div class="col-md-4">' + VMS.UI.field("ClassCode3", "Class Code 3", "text", record.ClassCode3, false) + "</div></div>" +
                        '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("MEALearnerCount", "MEA Learner Count", "number", record.MEALearnerCount, true) + '</div><div class="col-md-6">' + VMS.UI.field("GlobalLearnerCount", "Global Learner Count", "number", record.GlobalLearnerCount, true) + "</div></div>";
                } else {
                    body += VMS.UI.field("StudentCount", "Student Count (optional)", "number", record.StudentCount, false);
                }
                body += '<div class="form-check mb-3"><input class="form-check-input" id="admin-advance-payment" name="AdvancePayment" type="checkbox"' + (record.AdvancePayment ? " checked" : "") + '><label class="form-check-label" for="admin-advance-payment">Advance Payment</label></div>';
                if (record.DirectPayment === true && !context.directReviewMetadataLocked) { body += VMS.UI.field("PaymentLink", "Payment Link", "url", record.PaymentLink, true) + VMS.UI.field("DirectInformation", "Direct Information", "textarea", record.DirectInformation, true); }
                body += VMS.UI.field("Comment", "Comment", "textarea", record.Comment, false) + VMS.UI.field("AdministrativeReason", "Administrative Reason", "textarea", "", true) + '<div class="form-check mb-3"><input class="form-check-input" id="confirm-invoice-admin" name="Confirmed" type="checkbox"><label class="form-check-label" for="confirm-invoice-admin">I confirm this controlled administrative correction.</label></div>';
                VMS.UI.modalForm({ title: "Invoice Administration", size: "modal-lg", submitLabel: "Save Administrative Correction", bodyHtml: body, onSubmit: function (form) {
                    return VMS.App.invoiceService.AdminUpdateMetadata(record.ID, record._etag, { Category: Number(VMS.UI.formValue(form, "Category")), FocalPointEmail: VMS.UI.formValue(form, "FocalPointEmail"), RegionCode: VMS.UI.formValue(form, "RegionCode"), ManagedByCode: VMS.UI.formValue(form, "ManagedByCode"), ClassStartDate: VMS.UI.formValue(form, "ClassStartDate"), ClassEndDate: VMS.UI.formValue(form, "ClassEndDate"), ClassCode1: VMS.UI.formValue(form, "ClassCode1"), ClassCode2: VMS.UI.formValue(form, "ClassCode2"), ClassCode3: VMS.UI.formValue(form, "ClassCode3"), MEALearnerCount: VMS.UI.formValue(form, "MEALearnerCount"), GlobalLearnerCount: VMS.UI.formValue(form, "GlobalLearnerCount"), StudentCount: VMS.UI.formValue(form, "StudentCount"), AdvancePayment: form.find('[name="AdvancePayment"]').is(":checked"), PaymentLink: context.directReviewMetadataLocked ? record.PaymentLink : VMS.UI.formValue(form, "PaymentLink"), DirectInformation: context.directReviewMetadataLocked ? record.DirectInformation : VMS.UI.formValue(form, "DirectInformation"), Comment: VMS.UI.formValue(form, "Comment"), AdministrativeReason: VMS.UI.formValue(form, "AdministrativeReason"), Confirmed: form.find('[name="Confirmed"]').is(":checked") }, U.guid());
                } }).then(function (response) { VMS.UI.handleResponse(response); refresh(response.data); });
            }, VMS.UI.handleError);
        }, VMS.UI.handleError);
    }

    function openInvoiceAdminAttachments(id, refresh) {
        VMS.App.invoiceService.GetAdministrationItem(id).then(function (context) {
            if (context.creationMetadataLocked) { VMS.UI.toast("warning", "Attachments locked", "Invoice attachments are locked after first submission to Manager approval."); return; }
            var body = '<p>At least one valid Invoice attachment must remain.</p><div class="form-group"><span class="vms-form-label">Current attachments</span>';
            $.each(context.attachments, function (index, file) { body += '<div class="form-check"><input class="form-check-input" type="checkbox" checked name="RetainedAttachment" value="' + index + '" id="retain-invoice-' + index + '"><label class="form-check-label" for="retain-invoice-' + index + '">' + U.escapeHtml(file.name) + "</label></div>"; });
            body += "</div>" + VMS.App.fileHandlingService.attachmentField("Attachments", "Add attachments", false, ".pdf,.docx") + VMS.UI.field("AdministrativeReason", "Administrative Reason", "textarea", "", true) + '<div class="form-check mb-3"><input class="form-check-input" id="confirm-invoice-attachments" name="Confirmed" type="checkbox"><label class="form-check-label" for="confirm-invoice-attachments">I confirm this controlled attachment correction.</label></div>';
            VMS.UI.modalForm({ title: "Invoice Attachment Administration", submitLabel: "Save Attachments", bodyHtml: body, onSubmit: function (form) {
                var retained = $.map(form.find('[name="RetainedAttachment"]:checked'), function (item) { return context.attachments[Number(item.value)]; });
                return VMS.App.invoiceService.ReplaceAdminAttachments(context.record.ID, context.record._etag, retained.concat(VMS.App.fileHandlingService.fromInput(form.find('[name="Attachments"]')[0])), VMS.UI.formValue(form, "AdministrativeReason"), form.find('[name="Confirmed"]').is(":checked"), U.guid());
            } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
        }, VMS.UI.handleError);
    }

    VMS.PageControllers.INVOICE_REGISTER = {
        title: "Invoice Register",
        run: function (user) {
            var table;
            var canExecution = VMS.App.accessService.CanPerform(user, "INVOICE_CREATE_EXECUTION", {});
            var canEducation = VMS.App.accessService.CanPerform(user, "INVOICE_CREATE_EDUCATION_PROGRAM", {});
            var canAdmin = VMS.App.accessService.CanPerform(user, "ADMIN_INVOICE_UPDATE", {});
            var toolbar = (canExecution ? '<button class="btn btn-primary vms-add-execution" type="button">Add Execution Invoice</button> ' : "") + (canEducation ? '<button class="btn btn-secondary vms-add-education" type="button">Add Education Program Invoice</button>' : "");
            C.content('<p class="vms-context">Authorized standard and Direct Payment invoices across their complete lifecycle.</p><div id="invoice-summary"></div><section class="vms-panel"><div id="invoice-table"></div></section>');
            function summary() { VMS.App.invoiceService.GetRegisterSummary().then(function (s) { $("#invoice-summary").html(VMS.UI.summaryCards([{ label: "In Progress", value: s.inProgress, className: "vms-card-yellow" }, { label: "Rejected", value: s.rejected, className: "vms-card-danger" }, { label: "Settled", value: s.settled }])); }); }
            table = new VMS.TableComponent("#invoice-table", {
                id: "invoices", searchPlaceholder: "Search Invoice, supplier number, or Vendor", searchFields: ["InvoiceIdentifier", "InvoiceNumber", "VendorNameSnapshot"], sort: [{ field: "InvoiceInitiationDate", direction: "DESC" }], toolbarHtml: toolbar,
                onToolbarReady: function (container) { container.find(".vms-add-execution").on("click", function () { openInvoiceCreate("EXECUTION", function () { table.load(); summary(); }); }); container.find(".vms-add-education").on("click", function () { openInvoiceCreate("EDUCATION_PROGRAM", function () { table.load(); summary(); }); }); },
                query: function (spec) { return VMS.App.invoiceService.Query(spec); },
                columns: [
                    { label: "Invoice", render: function (row) { return '<strong>' + U.escapeHtml(row.InvoiceIdentifier) + "</strong>"; } },
                    { label: "Vendor", render: function (row) { return U.escapeHtml(row.VendorNameSnapshot); } },
                    { label: "Source", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.InvoiceSourceFunctionCode)); } },
                    { label: "Category", render: function (row) { return U.escapeHtml(VMS.UI.lookup(row.Category)); } },
                    { label: "Amount", render: function (row) { return VMS.UI.money(row.FinalInvoiceAmount, row.CurrencyCodeSnapshot); } },
                    { label: "Stage", render: function (row) { return VMS.UI.status(row.StageCode); } },
                    { label: "Status", render: function (row) { return VMS.UI.status(row.StatusCode); } }
                ],
                actions: function (row) { var html = C.linkButton(row.StatusCode === "IN_PROGRESS" ? "Open" : "View", invoiceDestination(row), row.StatusCode === "IN_PROGRESS" ? "btn-primary" : "btn-secondary"); if (canAdmin) { html += C.actionButton("Admin", "admin", row.ID, "btn-secondary") + C.actionButton("Attachments", "attachments", row.ID, "btn-secondary"); } return html; },
                onAction: function (action, id) { if (action === "admin") { openInvoiceAdmin(id, function () { table.load(); summary(); }); } if (action === "attachments") { openInvoiceAdminAttachments(id, function () { table.load(); }); } }
            });
            summary();
            table.render();
        }
    };

    function invoiceDetailsHtml(record) {
        return VMS.UI.keyValues([
            { label: "Invoice Identifier", value: record.InvoiceIdentifier }, { label: "Supplier Invoice Number", value: record.InvoiceNumber },
            { label: "Source Function", value: VMS.UI.titleize(record.InvoiceSourceFunctionCode) }, { label: "Vendor", value: record.VendorNameSnapshot },
            { label: "Category", value: VMS.UI.lookup(record.Category) }, { label: "Focal Point", value: record.FocalPointName },
            { label: "Direct Payment", value: C.bool(record.DirectPayment) }, { label: "Advance Payment", value: C.bool(record.AdvancePayment) },
            { label: "PO Line", value: record.POLineKeySnapshot }, { label: "Currency", value: record.CurrencyCodeSnapshot },
            { label: "Total Price", value: record.TotalPrice === null ? "Not available" : VMS.UI.money(record.TotalPrice, record.CurrencyCodeSnapshot), html: true },
            { label: "Discount Amount", value: record.DiscountAmount === null ? "Not available" : VMS.UI.money(record.DiscountAmount, record.CurrencyCodeSnapshot), html: true },
            { label: "VAT Amount", value: record.VATAmount === null ? "Not available" : VMS.UI.money(record.VATAmount, record.CurrencyCodeSnapshot), html: true },
            { label: "Final Invoice Amount", value: record.FinalInvoiceAmount === null ? "Not available" : VMS.UI.money(record.FinalInvoiceAmount, record.CurrencyCodeSnapshot), html: true },
            { label: "Final Amount in SAR", value: record.FinalInvoiceAmountInSAR === null ? "Not available" : VMS.UI.money(record.FinalInvoiceAmountInSAR, "SAR"), html: true },
            { label: "Initiation Date", value: VMS.ClockService.formatRiyadh(record.InvoiceInitiationDate, false) }, { label: "Settlement Date", value: record.SettlementDate ? VMS.ClockService.formatRiyadh(record.SettlementDate, false) : "Not available" }
        ]);
    }

    VMS.PageControllers.INVOICE_DETAILS = {
        title: "Invoice Details",
        run: function (user) {
            var query = C.query();
            C.loading("Loading authorized Invoice details...");
            VMS.App.invoiceService.Get(query.id, query.key).then(function (record) { var admin = VMS.App.accessService.CanPerform(user, "ADMIN_INVOICE_UPDATE", {}) ? '<button id="invoice-admin" class="btn btn-secondary" type="button">Administration</button> <button id="invoice-admin-attachments" class="btn btn-secondary" type="button">Attachments</button> ' : ""; C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(record.InvoiceIdentifier) + '</h2><p class="vms-context">' + VMS.UI.status(record.StageCode) + " " + VMS.UI.status(record.StatusCode) + '</p></div><div>' + admin + '<a class="btn btn-secondary" href="' + VMS.Config.ROUTES.INVOICE_REGISTER + '">Back to Register</a></div></div><section class="vms-panel">' + invoiceDetailsHtml(record) + "</section>"); $("#invoice-admin").on("click", function () { openInvoiceAdmin(record.ID, function () { window.location.reload(); }); }); $("#invoice-admin-attachments").on("click", function () { openInvoiceAdminAttachments(record.ID, function () { window.location.reload(); }); }); }, C.fail);
        }
    };

    function financialFields(record, defaultCostCenter) {
        return '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("InvoiceNumber", "Supplier Invoice Number", "text", record.InvoiceNumber, true) + '</div><div class="col-md-6">' + VMS.UI.field("POLine", "PO Line", "select", record.POLine ? record.POLine.id : "", true, []) + "</div></div>" +
            '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("SESNumber", "SES Number", "text", record.SESNumber, true) + '</div><div class="col-md-6">' + VMS.UI.field("SESDate", "SES Date", "date", record.SESDate ? record.SESDate.substring(0, 10) : "", true) + "</div></div>" +
            VMS.UI.field("CostCenter", "Cost Center", "text", record.CostCenter || defaultCostCenter || "", true) +
            '<div class="form-row"><div class="col-md-4">' + VMS.UI.field("TotalPrice", "Total Price", "number", record.TotalPrice, true) + '</div><div class="col-md-4">' + VMS.UI.field("DiscountInputTypeCode", "Discount Type", "select", record.DiscountInputTypeCode, false, [{ value: "PERCENTAGE", label: "Percentage" }, { value: "AMOUNT", label: "Amount" }]) + '</div><div class="col-md-4">' + VMS.UI.field("DiscountInputValue", "Discount Value", "number", record.DiscountInputValue, false) + "</div></div>" +
            '<div class="form-row"><div class="col-md-4"><div class="form-check mt-4"><input class="form-check-input" id="has-discount" name="HasDiscount" type="checkbox"' + (record.HasDiscount ? " checked" : "") + '><label class="form-check-label" for="has-discount">Has Discount</label></div></div><div class="col-md-4">' + VMS.UI.field("VATInputTypeCode", "VAT Type", "select", record.VATInputTypeCode, false, [{ value: "PERCENTAGE", label: "Percentage" }, { value: "AMOUNT", label: "Amount" }]) + '</div><div class="col-md-4">' + VMS.UI.field("VATInputValue", "VAT Value", "number", record.VATInputValue, false) + '</div></div><div class="form-check mb-3"><input class="form-check-input" id="has-vat" name="HasVAT" type="checkbox"' + (record.HasVAT ? " checked" : "") + '><label class="form-check-label" for="has-vat">Has VAT</label></div>';
    }

    VMS.PageControllers.INVOICE_PROCESSING = {
        title: "Invoice Processing",
        run: function () {
            var query = C.query();
            var record;
            var confirmedCalculation = null;
            var currentInput = null;
            C.loading("Loading authorized Invoice Processing...");
            VMS.App.invoiceService.Get(query.id, query.key).then(function (value) {
                record = value;
                if (record.DirectPayment === true) { throw { code: "INVALID_STAGE", safeMessage: "Released Direct Payment Invoices are processed through the complete batch workspace." }; }
                return VMS.App.invoiceService.GetProcessingOptions(record.ID);
            }).then(function (options) {
                var lines = options.lines;
                var body = financialFields(record, options.costCenter);
                var rejectionOptions = C.options(options.rejectionReasons, "ItemCode", "DisplayLabel");
                function readInput(form) {
                    return { InvoiceNumber: VMS.UI.formValue(form, "InvoiceNumber"), POLine: Number(VMS.UI.formValue(form, "POLine")), SESNumber: VMS.UI.formValue(form, "SESNumber"), SESDate: VMS.UI.formValue(form, "SESDate"), CostCenter: VMS.UI.formValue(form, "CostCenter"), TotalPrice: VMS.UI.formValue(form, "TotalPrice"), HasDiscount: form.find('[name="HasDiscount"]').is(":checked"), DiscountInputTypeCode: VMS.UI.formValue(form, "DiscountInputTypeCode"), DiscountInputValue: VMS.UI.formValue(form, "DiscountInputValue"), HasVAT: form.find('[name="HasVAT"]').is(":checked"), VATInputTypeCode: VMS.UI.formValue(form, "VATInputTypeCode"), VATInputValue: VMS.UI.formValue(form, "VATInputValue") };
                }
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(record.InvoiceIdentifier) + '</h2><p class="vms-context">' + U.escapeHtml(record.VendorNameSnapshot) + " · " + VMS.UI.status(record.StageCode) + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.INVOICE_REGISTER + '">Back to Register</a></div><section class="vms-panel"><form id="invoice-processing-form" novalidate>' + body + '<div id="financial-preview" class="vms-info-panel">Calculate to confirm the authoritative financial values before submission. Standard Invoice processing is committed only on Submit for Approval.</div><div class="text-right"><button id="reject-invoice" type="button" class="btn btn-danger">Reject Invoice</button> <button type="submit" class="btn btn-secondary">Calculate</button> <button id="submit-invoice" type="button" class="btn btn-primary">Submit for Approval</button></div></form></section>');
                var select = $("#vms-field-POLine");
                select.html('<option value="">Select</option>');
                $.each(lines, function (_, line) { select.append('<option value="' + line.ID + '"' + (record.POLine && record.POLine.id === line.ID ? " selected" : "") + '>' + U.escapeHtml(line.POLineKey + " — " + line.RemainingBalance.toFixed(2)) + "</option>"); });
                $("#invoice-processing-form").on("submit", function (event) {
                    var form = $(this);
                    event.preventDefault();
                    currentInput = readInput(form);
                    VMS.App.invoiceService.CalculateProcessing(record.ID, currentInput).then(function (calculation) { confirmedCalculation = calculation; currentInput.ConversionRateUsed = calculation.values.ConversionRateUsed; currentInput.ConversionRateModifiedDate = calculation.conversionRateModifiedDate; $("#financial-preview").html("Total: <strong>" + VMS.UI.money(calculation.values.TotalPrice, calculation.currencyCode) + "</strong> · Discount: <strong>" + VMS.UI.money(calculation.values.DiscountAmount, calculation.currencyCode) + "</strong> · Net: <strong>" + VMS.UI.money(calculation.values.NetAmountBeforeVAT, calculation.currencyCode) + "</strong> · VAT: <strong>" + VMS.UI.money(calculation.values.VATAmount, calculation.currencyCode) + "</strong> · Final: <strong>" + VMS.UI.money(calculation.values.FinalInvoiceAmount, calculation.currencyCode) + "</strong> · SAR: <strong>" + VMS.UI.money(calculation.values.FinalInvoiceAmountInSAR, "SAR") + "</strong> · Rate: <strong>" + U.escapeHtml(calculation.values.ConversionRateUsed) + "</strong>"); }, VMS.UI.handleError);
                });
                $("#invoice-processing-form").on("input change", function () { confirmedCalculation = null; });
                $("#submit-invoice").on("click", function () { if (!confirmedCalculation || !currentInput) { VMS.UI.toast("warning", "Calculation required", "Calculate the authoritative financial values before submission."); return; } C.confirmationThen({ title: "Submit Invoice", message: "Submit this complete Invoice for Vendor Management Manager approval?", actionLabel: "Submit for Approval" }, function () { return VMS.App.invoiceService.SubmitForApproval(record.ID, record._etag, currentInput, U.guid()); }, function () { window.location.href = VMS.Config.ROUTES.INVOICE_REGISTER; }); });
                $("#reject-invoice").on("click", function () { VMS.UI.modalForm({ title: "Reject Invoice", submitLabel: "Reject Invoice", bodyHtml: VMS.UI.field("reason", "Rejection Reason", "select", "", true, rejectionOptions) + VMS.UI.field("comment", "Comment", "textarea", "", false), onSubmit: function (form) { return VMS.App.invoiceService.RejectAtProcessing(record.ID, record._etag, VMS.UI.formValue(form, "reason"), VMS.UI.formValue(form, "comment"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.href = VMS.Config.ROUTES.INVOICE_REGISTER; }); });
            }, C.fail);
        }
    };

    VMS.PageControllers.INVOICE_MANAGER_APPROVAL = {
        title: "Invoice Manager Approval",
        run: function () {
            var query = C.query();
            C.loading("Loading Invoice approval...");
            VMS.App.invoiceService.Get(query.id, query.key).then(function (record) {
                if (record.DirectPayment === true) { throw { code: "INVALID_STAGE", safeMessage: "Direct Payment approval is a complete batch action." }; }
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(record.InvoiceIdentifier) + '</h2><p class="vms-context">Manager approval · ' + VMS.UI.status(record.StageCode) + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.PENDING_APPROVALS + '">Back to Approvals</a></div><section class="vms-panel">' + invoiceDetailsHtml(record) + '</section><div class="text-right"><button id="invoice-return" class="btn btn-secondary" type="button">Update Required</button> <button id="invoice-approve" class="btn btn-primary" type="button">Approve Invoice</button></div>');
                $("#invoice-approve").on("click", function () { C.confirmationThen({ title: "Approve Invoice", message: "Approve this Invoice and consume " + record.FinalInvoiceAmount + " " + record.CurrencyCodeSnapshot + " from " + record.POLineKeySnapshot + "?", actionLabel: "Approve Invoice" }, function () { return VMS.App.invoiceService.Approve(record.ID, record._etag, null, U.guid()); }, function () { window.location.href = VMS.Config.ROUTES.PENDING_APPROVALS; }); });
                $("#invoice-return").on("click", function () { VMS.UI.modalForm({ title: "Update Required", submitLabel: "Return for Update", bodyHtml: VMS.UI.field("reason", "Reason", "textarea", "", true), onSubmit: function (form) { return VMS.App.invoiceService.ReturnForUpdate(record.ID, record._etag, VMS.UI.formValue(form, "reason"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.href = VMS.Config.ROUTES.PENDING_APPROVALS; }); });
            }, C.fail);
        }
    };

    VMS.PageControllers.CHARGEBACK_PROCESSING = {
        title: "Chargeback Processing",
        run: function () {
            var query = C.query();
            C.loading("Loading Chargeback Processing...");
            VMS.App.invoiceService.Get(query.id, query.key).then(function (record) {
                if (record.DirectPayment === true) { throw { code: "INVALID_STAGE", safeMessage: "Direct Payment Settlement is completed through the batch workspace." }; }
                var eBilling = record.InvoiceSourceFunctionCode === "EXECUTION" && Number(record.GlobalLearnerCount) > 0;
                var lms = record.InvoiceSourceFunctionCode === "EXECUTION" && Number(record.MEALearnerCount) > 0;
                var fields = '<div class="vms-info-panel">Education Program settlement fields are Not Applicable. Execution applicability is derived from learner counts.</div>';
                if (eBilling) { fields += VMS.UI.field("EBillingSettlement", "E-Billing Settlement", "select", record.EBillingSettlement === true ? "true" : record.EBillingSettlement === false ? "false" : "", true, [{ value: "true", label: "Completed" }, { value: "false", label: "Not Completed" }]); }
                if (lms) { fields += VMS.UI.field("LMSSettlement", "LMS Settlement", "select", record.LMSSettlement === true ? "true" : record.LMSSettlement === false ? "false" : "", true, [{ value: "true", label: "Completed" }, { value: "false", label: "Not Completed" }]); }
                fields += VMS.UI.field("Comment", "Comment", "textarea", record.Comment, false);
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(record.InvoiceIdentifier) + '</h2><p class="vms-context">' + U.escapeHtml(record.VendorNameSnapshot) + " · " + VMS.UI.status(record.StageCode) + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.INVOICE_REGISTER + '">Back to Register</a></div><section class="vms-panel"><form id="chargeback-form">' + fields + '<div class="text-right"><button type="submit" class="btn btn-secondary">Save Draft</button> <button id="settle-invoice" type="button" class="btn btn-primary">Settle Invoice</button></div></form></section>');
                $("#chargeback-form").on("submit", function (event) { var form = $(this); event.preventDefault(); C.showMutation(VMS.App.invoiceService.SaveChargebackDraft(record.ID, record._etag, { EBillingSettlement: VMS.UI.formValue(form, "EBillingSettlement") === "true", LMSSettlement: VMS.UI.formValue(form, "LMSSettlement") === "true", Comment: VMS.UI.formValue(form, "Comment") }, U.guid()), function (response) { record = response.data; }); });
                $("#settle-invoice").on("click", function () { C.confirmationThen({ title: "Settle Invoice", message: "Settle this Invoice? Settlement does not consume the PO Line again.", actionLabel: "Settle Invoice" }, function () { return VMS.App.invoiceService.Settle(record.ID, record._etag, U.guid()); }, function () { window.location.href = VMS.Config.ROUTES.INVOICE_REGISTER; }); });
            }, C.fail);
        }
    };
}(window, window.jQuery));
