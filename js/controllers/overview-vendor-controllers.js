(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    VMS.PageControllers.OVERVIEW = {
        title: "Overview",
        run: function () {
            C.loading("Loading your authorized work summary...");
            VMS.App.overviewService.GetSummary().then(function (summary) {
                var cards = [
                    { label: "Open Work Items", value: summary.openWorkItems },
                    { label: "Completed Actions", value: summary.completedActions, className: "vms-card-yellow" }
                ];
                var recent = "";
                if (summary.assignedSurveys !== null) { cards.push({ label: "Assigned Surveys", value: summary.assignedSurveys, link: { label: "Open Feedback", url: VMS.Config.ROUTES.FEEDBACK_ASSIGNMENTS } }); }
                if (summary.pendingApprovalsVisible) { cards.push({ label: "Pending Approvals", value: "View", link: { label: "Open approvals", url: VMS.Config.ROUTES.PENDING_APPROVALS } }); }
                $.each(summary.recentWork, function (_, item) { recent += '<tr><td>' + U.escapeHtml(VMS.UI.titleize(item.ActionCode)) + '</td><td><a href="' + U.escapeHtml(item.destination) + '">' + U.escapeHtml(item.EntityBusinessKeySnapshot) + '</a></td><td>' + VMS.UI.status(item.ToStatusCode) + '</td><td>' + VMS.UI.date(item.ActionDate) + "</td></tr>"; });
                C.content('<p class="vms-context">Your personal operational workload and recent completed actions.</p>' + VMS.UI.summaryCards(cards) + '<section class="vms-panel vms-section"><div class="vms-toolbar"><h2 class="vms-section-heading">My Recent Work</h2>' + (summary.dashboardUrl ? '<a class="btn btn-primary" href="' + U.escapeHtml(summary.dashboardUrl) + '" target="_blank" rel="noopener">Open Power BI Dashboard</a>' : '<button class="btn btn-secondary" disabled>Dashboard unavailable</button>') + '</div>' + (recent ? '<div class="vms-table-wrap"><table class="vms-table"><thead><tr><th scope="col">Action</th><th scope="col">Record</th><th scope="col">Result</th><th scope="col">Action Date</th></tr></thead><tbody>' + recent + "</tbody></table></div>" : '<div class="vms-table-state">No completed operational actions are available yet.</div>') + "</section>");
            }, C.fail);
        }
    };

    function openVendorDecision(record, type, refresh) {
        var isInterview = type === "interview";
        var body = VMS.UI.field("resultCode", "Decision", "select", "", true, [{ value: "PASSED", label: "Passed" }, { value: "FAILED", label: "Failed" }]) +
            (isInterview ? VMS.UI.field("vendorCode", "Vendor Code when passed", "text", "", false) : "") +
            VMS.UI.field("reason", "Reason when failed", "textarea", "", false);
        VMS.UI.modalForm({ title: isInterview ? "Interview Decision" : "Documents & Evaluation", submitLabel: "Save Decision", bodyHtml: body, onSubmit: function (form) {
            var payload = { resultCode: C.formValue ? C.formValue(form, "resultCode") : VMS.UI.formValue(form, "resultCode"), vendorCode: VMS.UI.formValue(form, "vendorCode"), reason: VMS.UI.formValue(form, "reason") };
            return isInterview ? VMS.App.vendorService.Interview(record.ID, record._etag, payload, U.guid()) : VMS.App.vendorService.Evaluate(record.ID, record._etag, payload, U.guid());
        } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
    }

    function openAddVendor(refresh) {
        VMS.App.vendorService.GetCreationLookups().then(function (lookups) {
            var countries = lookups.countries;
            var cities = lookups.cities;
            var categories = lookups.categories;
            var configuration = lookups.configuration;
            var requesters = lookups.requesters;
            var classifications = $.grep(configuration, function (row) { return row.GroupCode === "VENDOR_CLASSIFICATION"; });
            var processing = $.grep(configuration, function (row) { return row.GroupCode === "VENDOR_PROCESSING_TYPE"; });
            var categoryField = VMS.UI.field("Category", "Vendor Categories", "select", "", true, C.lookupOptions(categories, "DisplayLabel")).replace('class="custom-select"', 'class="custom-select" multiple size="5"');
            var body = '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("VendorName", "Vendor Name", "text", "", true) + '</div><div class="col-md-6">' + VMS.UI.field("Email", "Vendor Email addresses", "text", "", true) + "</div></div>" +
                '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("Country", "Country", "select", "", true, C.lookupOptions(countries, "CountryName")) + '</div><div class="col-md-6">' + VMS.UI.field("City", "City", "select", "", true, C.lookupOptions(cities, "CityName")) + "</div></div>" +
                '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("PhoneNumber", "Phone Number", "text", "", true) + '</div><div class="col-md-6">' + categoryField + "</div></div>" +
                '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("VendorClassificationCode", "Classification", "select", "", true, C.options(classifications, "ItemCode", "DisplayLabel")) + '</div><div class="col-md-6">' + VMS.UI.field("VendorProcessingTypeCode", "Processing Type", "select", "", true, C.options(processing, "ItemCode", "DisplayLabel")) + "</div></div>" +
                VMS.UI.field("RequestedBy", "Requested By (optional)", "select", "", false, C.options(requesters, "ID", "UserName")) + VMS.UI.field("PostalCode", "Postal Code", "text", "", false) + VMS.UI.field("Address", "Address", "textarea", "", true) + VMS.App.fileHandlingService.attachmentField("Attachments", "Vendor documents", false, ".pdf,.xlsx,.docx");
            VMS.UI.modalForm({ title: "Add Vendor", size: "modal-lg", submitLabel: "Create Vendor", bodyHtml: body, onSubmit: function (form) {
                var selectedCategories = $.map(form.find('[name="Category"] option:selected'), function (option) { return option.value ? { id: Number(option.value), title: $(option).text() } : null; });
                return VMS.App.vendorService.Create({ VendorName: VMS.UI.formValue(form, "VendorName"), Email: VMS.UI.formValue(form, "Email"), Country: Number(VMS.UI.formValue(form, "Country")), City: Number(VMS.UI.formValue(form, "City")), PhoneNumber: VMS.UI.formValue(form, "PhoneNumber"), RequestedBy: VMS.UI.formValue(form, "RequestedBy") ? Number(VMS.UI.formValue(form, "RequestedBy")) : null, Category: selectedCategories, VendorClassificationCode: VMS.UI.formValue(form, "VendorClassificationCode"), VendorProcessingTypeCode: VMS.UI.formValue(form, "VendorProcessingTypeCode"), PostalCode: VMS.UI.formValue(form, "PostalCode"), Address: VMS.UI.formValue(form, "Address"), Attachments: VMS.App.fileHandlingService.fromInput(form.find('[name="Attachments"]')[0]) }, U.guid());
            } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
        }, VMS.UI.handleError);
    }

    function vendorBusinessFields(record, lookups, includeWorkflow) {
        var configuration = lookups.configuration;
        var classifications = $.grep(configuration, function (row) { return row.GroupCode === "VENDOR_CLASSIFICATION"; });
        var processing = $.grep(configuration, function (row) { return row.GroupCode === "VENDOR_PROCESSING_TYPE"; });
        var html = '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("VendorName", "Vendor Name", "text", record.VendorName, true) + '</div><div class="col-md-6">' + VMS.UI.field("Email", "Vendor Email addresses", "text", record.Email, true) + "</div></div>" +
            '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("Country", "Country", "select", U.lookupId(record.Country), true, C.lookupOptions(lookups.countries, "CountryName")) + '</div><div class="col-md-6">' + VMS.UI.field("City", "City", "select", U.lookupId(record.City), true, C.lookupOptions(lookups.cities, "CityName")) + "</div></div>" +
            '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("PhoneNumber", "Phone Number", "text", record.PhoneNumber, true) + '</div><div class="col-md-6">' + VMS.UI.multiSelectField("Category", "Vendor Categories", C.lookupOptions(lookups.categories, "DisplayLabel"), record.Category, true) + "</div></div>" +
            '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("VendorClassificationCode", "Classification", "select", record.VendorClassificationCode, true, C.options(classifications, "ItemCode", "DisplayLabel")) + '</div><div class="col-md-6">' + VMS.UI.field("VendorProcessingTypeCode", "Processing Type", "select", record.VendorProcessingTypeCode, true, C.options(processing, "ItemCode", "DisplayLabel")) + "</div></div>" +
            VMS.UI.field("RequestedBy", "Requested By (optional)", "select", U.lookupId(record.RequestedBy), false, C.options(lookups.requesters, "ID", "UserName")) + VMS.UI.field("PostalCode", "Postal Code", "text", record.PostalCode, false) + VMS.UI.field("Address", "Address", "textarea", record.Address, true);
        if (includeWorkflow) {
            html += '<div class="vms-info-panel">Vendor Code is read-only. Corrected workflow fields must form one of the canonical Vendor states.</div>' +
                '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("StageCode", "Stage", "select", record.StageCode, true, C.options([{ code: "DOCUMENT_EVALUATION", label: "Document Evaluation" }, { code: "INTERVIEW", label: "Interview" }, { code: "APPROVED", label: "Approved" }, { code: "REJECTED", label: "Rejected" }, { code: "EXPIRED", label: "Expired" }], "code", "label")) + '</div><div class="col-md-6">' + VMS.UI.field("StatusCode", "Status", "select", record.StatusCode, true, C.options([{ code: "IN_PROGRESS", label: "In Progress" }, { code: "APPROVED", label: "Approved" }, { code: "REJECTED", label: "Rejected" }, { code: "EXPIRED", label: "Expired" }], "code", "label")) + "</div></div>" +
                '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("EvaluationResultCode", "Evaluation Result", "select", record.EvaluationResultCode, true, C.options([{ code: "PENDING", label: "Pending" }, { code: "PASSED", label: "Passed" }, { code: "FAILED", label: "Failed" }], "code", "label")) + '</div><div class="col-md-6">' + VMS.UI.field("InterviewResultCode", "Interview Result", "select", record.InterviewResultCode, true, C.options([{ code: "PENDING", label: "Pending" }, { code: "PASSED", label: "Passed" }, { code: "FAILED", label: "Failed" }], "code", "label")) + "</div></div>";
        }
        return html;
    }

    function vendorPatch(form, includeWorkflow) {
        var patch = { VendorName: VMS.UI.formValue(form, "VendorName"), Email: VMS.UI.formValue(form, "Email"), PhoneNumber: VMS.UI.formValue(form, "PhoneNumber"), RequestedBy: VMS.UI.formValue(form, "RequestedBy") ? Number(VMS.UI.formValue(form, "RequestedBy")) : null, Country: Number(VMS.UI.formValue(form, "Country")), City: Number(VMS.UI.formValue(form, "City")), Category: $.map(VMS.UI.formValues(form, "Category"), Number), PostalCode: VMS.UI.formValue(form, "PostalCode"), Address: VMS.UI.formValue(form, "Address"), VendorClassificationCode: VMS.UI.formValue(form, "VendorClassificationCode"), VendorProcessingTypeCode: VMS.UI.formValue(form, "VendorProcessingTypeCode") };
        if (includeWorkflow) { $.extend(patch, { StageCode: VMS.UI.formValue(form, "StageCode"), StatusCode: VMS.UI.formValue(form, "StatusCode"), EvaluationResultCode: VMS.UI.formValue(form, "EvaluationResultCode"), InterviewResultCode: VMS.UI.formValue(form, "InterviewResultCode"), AdministrativeReason: VMS.UI.formValue(form, "AdministrativeReason"), Confirmed: form.find('[name="Confirmed"]').is(":checked") }); }
        return patch;
    }

    function openVendorCorrection(record, administrative, refresh) {
        VMS.App.vendorService.GetCreationLookups().then(function (lookups) {
            var body = vendorBusinessFields(record, lookups, administrative);
            if (administrative) { body += VMS.UI.field("AdministrativeReason", "Administrative Reason", "textarea", "", true) + '<div class="form-check mb-3"><input class="form-check-input" id="confirm-vendor-admin" name="Confirmed" type="checkbox"><label class="form-check-label" for="confirm-vendor-admin">I confirm this controlled administrative correction.</label></div>'; }
            VMS.UI.modalForm({ title: administrative ? "Vendor Administration" : "Correct Vendor Onboarding", size: "modal-lg", submitLabel: "Save Correction", bodyHtml: body, onSubmit: function (form) { var patch = vendorPatch(form, administrative); return administrative ? VMS.App.vendorService.AdminUpdate(record.ID, record._etag, patch, U.guid()) : VMS.App.vendorService.UpdateOnboarding(record.ID, record._etag, patch, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); refresh(response.data); });
        }, VMS.UI.handleError);
    }

    function openVendorAttachments(id, refresh) {
        VMS.App.vendorService.GetOnboardingAttachmentItem(id).then(function (context) {
            var body = '<p>Select the retained documents and add any new files.</p><div class="form-group"><span class="vms-form-label">Current documents</span>';
            $.each(context.attachments, function (index, file) { body += '<div class="form-check"><input class="form-check-input" type="checkbox" checked name="RetainedAttachment" value="' + index + '" id="retain-vendor-' + index + '"><label class="form-check-label" for="retain-vendor-' + index + '">' + U.escapeHtml(file.name) + "</label></div>"; });
            body += "</div>" + VMS.App.fileHandlingService.attachmentField("Attachments", "Add documents", false, ".pdf,.xlsx,.docx");
            VMS.UI.modalForm({ title: "Vendor Onboarding Documents", submitLabel: "Save Documents", bodyHtml: body, onSubmit: function (form) {
                var retained = $.map(form.find('[name="RetainedAttachment"]:checked'), function (item) { return context.attachments[Number(item.value)]; });
                return VMS.App.vendorService.ReplaceOnboardingAttachments(context.record.ID, context.record._etag, retained.concat(VMS.App.fileHandlingService.fromInput(form.find('[name="Attachments"]')[0])), U.guid());
            } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
        }, VMS.UI.handleError);
    }

    VMS.PageControllers.VENDOR_LIST = {
        title: "Vendors",
        run: function (user) {
            var table;
            var canOperate = VMS.App.accessService.CanPerform(user, "VENDOR_CREATE", {});
            var canAdmin = VMS.App.accessService.CanPerform(user, "ADMIN_VENDOR_UPDATE", {});
            C.content('<p class="vms-context">Vendor onboarding, lifecycle status, and approved master records.</p><div id="vendor-summary"></div><section class="vms-panel"><div id="vendor-table"></div></section>');
            function loadSummary() {
                VMS.App.vendorService.GetListSummary().then(function (s) { $("#vendor-summary").html(VMS.UI.summaryCards([{ label: "Total Vendors", value: s.total }, { label: "In Progress", value: s.inProgress, className: "vms-card-yellow" }, { label: "Approved", value: s.approved }, { label: "Expired", value: s.expired, className: "vms-card-danger" }, { label: "Rejected", value: s.rejected, className: "vms-card-danger" }])); });
            }
            table = new VMS.TableComponent("#vendor-table", {
                id: "vendors", searchPlaceholder: "Search Vendor name or code", searchFields: ["VendorName", "VendorCode"], sort: [{ field: "DisplayName", direction: "DESC" }],
                toolbarHtml: canOperate ? '<button type="button" class="btn btn-primary vms-add-vendor">Add Vendor</button>' : "",
                onToolbarReady: function (container) { container.find(".vms-add-vendor").on("click", function () { openAddVendor(function () { table.load(); loadSummary(); }); }); },
                query: function (spec) { return VMS.App.vendorService.Query(spec); },
                columns: [
                    { label: "Vendor", render: function (row) { return '<strong>' + U.escapeHtml(row.DisplayName) + "</strong>"; } },
                    { label: "Processing Type", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.VendorProcessingTypeCode)); } },
                    { label: "Stage", render: function (row) { return VMS.UI.status(row.StageCode); } },
                    { label: "Status", render: function (row) { return VMS.UI.status(row.StatusCode); } },
                    { label: "Active", render: function (row) { return C.activeLabel(row.IsActive); } }
                ],
                actions: function (row) {
                    var finalState = $.inArray(row.StageCode, ["APPROVED", "REJECTED", "EXPIRED"]) >= 0;
                    var html = finalState ? C.linkButton("View", VMS.Config.ROUTES.VENDOR_PROFILE + "?id=" + row.ID + "&key=VND-" + row.ID) : "";
                    if (canOperate && row.StageCode === "DOCUMENT_EVALUATION") { html += C.actionButton("Evaluate", "evaluate", row.ID, "btn-primary"); }
                    if (canOperate && row.StageCode === "DOCUMENT_EVALUATION") { html += C.actionButton("Correct", "correct", row.ID, "btn-secondary") + C.actionButton("Documents", "documents", row.ID, "btn-secondary"); }
                    if (canOperate && row.StageCode === "INTERVIEW") { html += C.actionButton("Interview", "interview", row.ID, "btn-primary"); }
                    if (canAdmin) { html += C.actionButton("Admin", "admin", row.ID, "btn-secondary"); }
                    return html || '<span class="text-muted">No action</span>';
                },
                onAction: function (action, id) {
                    if (action === "documents") { openVendorAttachments(id, function () { table.load(); }); return; }
                    if (action === "correct") { VMS.App.vendorService.GetDecisionItem(id, "VENDOR_EVALUATE").then(function (row) { openVendorCorrection(row, false, function () { table.load(); loadSummary(); }); }, VMS.UI.handleError); return; }
                    if (action === "admin") { VMS.App.vendorService.GetDecisionItem(id, "ADMIN_VENDOR_UPDATE").then(function (row) { openVendorCorrection(row, true, function () { table.load(); loadSummary(); }); }, VMS.UI.handleError); return; }
                    VMS.App.vendorService.GetDecisionItem(id, action === "evaluate" ? "VENDOR_EVALUATE" : "VENDOR_INTERVIEW").then(function (row) { openVendorDecision(row, action, function () { table.load(); loadSummary(); }); }, VMS.UI.handleError);
                }
            });
            loadSummary();
            table.render();
        }
    };

    VMS.PageControllers.VENDOR_PROFILE = {
        title: "Vendor Profile",
        run: function (user) {
            var query = C.query();
            var activeTab = query.tab || "general";
            C.loading("Loading authorized Vendor profile...");
            VMS.App.vendorService.GetProfile(query.id, query.key).then(function (vendor) {
                var tabs = [
                    { code: "general", label: "General" }, { code: "documents", label: "Documents" }, { code: "prpo", label: "PR / PO" }, { code: "invoices", label: "Invoices" }, { code: "performance", label: "Performance" }
                ];
                var nav = '<ul class="vms-tabs" role="tablist">';
                $.each(tabs, function (_, tab) { nav += '<li><a href="' + VMS.Config.ROUTES.VENDOR_PROFILE + "?id=" + vendor.ID + "&key=VND-" + vendor.ID + "&tab=" + tab.code + '"' + (activeTab === tab.code ? ' aria-current="page"' : "") + '>' + U.escapeHtml(tab.label) + "</a></li>"; });
                nav += "</ul>";
                var adminButton = VMS.App.accessService.CanPerform(user, "ADMIN_VENDOR_UPDATE", {}) ? '<button id="vendor-admin" class="btn btn-secondary" type="button">Administration</button> ' + (vendor.StageCode === "APPROVED" ? '<button id="vendor-active" class="btn ' + (vendor.IsActive ? "btn-danger" : "btn-secondary") + '" type="button">' + (vendor.IsActive ? "Deactivate" : "Reactivate") + "</button>" : "") : "";
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(vendor.DisplayName) + '</h2><p class="vms-context">' + VMS.UI.status(vendor.StageCode) + " " + VMS.UI.status(vendor.StatusCode) + '</p></div><div>' + adminButton + '<a class="btn btn-secondary" href="' + VMS.Config.ROUTES.VENDOR_LIST + '">Back to Vendors</a></div></div>' + nav + '<section id="vendor-tab" class="vms-panel"></section>');
                $("#vendor-admin").on("click", function () { openVendorCorrection(vendor, true, function () { window.location.reload(); }); });
                $("#vendor-active").on("click", function () { VMS.UI.modalForm({ title: vendor.IsActive ? "Deactivate Vendor" : "Reactivate Vendor", submitLabel: vendor.IsActive ? "Deactivate" : "Reactivate", bodyHtml: VMS.UI.field("Reason", "Administrative Reason", "textarea", "", true), onSubmit: function (form) { return VMS.App.vendorService.SetActive(vendor.ID, vendor._etag, !vendor.IsActive, VMS.UI.formValue(form, "Reason"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.reload(); }); });
                if (activeTab === "general") {
                    $("#vendor-tab").html(VMS.UI.keyValues([{ label: "Vendor Name", value: vendor.VendorName }, { label: "Vendor Code", value: vendor.VendorCode }, { label: "Classification", value: VMS.UI.titleize(vendor.VendorClassificationCode) }, { label: "Processing Type", value: VMS.UI.titleize(vendor.VendorProcessingTypeCode) }, { label: "Country", value: VMS.UI.lookup(vendor.Country) }, { label: "City", value: VMS.UI.lookup(vendor.City) }, { label: "Address", value: vendor.Address }, { label: "Registration Date", value: VMS.ClockService.formatRiyadh(vendor.RegistrationDate, false) }, { label: "Expiry Due Date", value: VMS.ClockService.formatRiyadh(vendor.ExpiryDueDate, false) }, { label: "Active", value: C.bool(vendor.IsActive) }]));
                } else if (activeTab === "documents") {
                    VMS.App.vendorService.GetDocuments(vendor.ID, query.key).then(function (files) { var html = '<h2 class="vms-section-heading">Documents</h2>'; if (!files.length) { html += '<p>No Vendor documents are attached.</p>'; } else { html += "<ul>"; $.each(files, function (_, file) { html += "<li>" + U.escapeHtml(file.name) + "</li>"; }); html += "</ul>"; } $("#vendor-tab").html(html); });
                } else if (activeTab === "prpo") {
                    VMS.App.prpoService.Query({ filters: [{ field: "Vendor.id", op: "eq", value: vendor.ID }], pageSize: 25, sort: [{ field: "CreationDate", direction: "DESC" }] }).then(function (result) { var html = '<h2 class="vms-section-heading">PR / PO</h2>'; $.each(result.items, function (_, row) { html += '<p><a href="' + VMS.Config.ROUTES.PRPO_REGISTER + "?id=" + row.ID + "&key=" + encodeURIComponent(row.PRNumber) + '">' + U.escapeHtml(row.PRNumber) + "</a> — " + VMS.UI.status(row.StageCode) + "</p>"; }); $("#vendor-tab").html(html || "No records"); });
                } else if (activeTab === "invoices") {
                    $.when(VMS.App.invoiceService.GetVendorSummary(vendor.ID), VMS.App.invoiceService.Query({ filters: [{ field: "Vendor.id", op: "eq", value: vendor.ID }], pageSize: 25, sort: [{ field: "InvoiceInitiationDate", direction: "DESC" }] })).then(function (summary, result) { var html = VMS.UI.summaryCards([{ label: "Total Invoices", value: summary.total }, { label: "In Process", value: summary.inProcess }, { label: "Settled", value: summary.settled }]); $.each(result.items, function (_, row) { html += '<p><a href="' + VMS.Config.ROUTES.INVOICE_DETAILS + "?id=" + row.ID + "&key=" + encodeURIComponent(row.InvoiceIdentifier) + '">' + U.escapeHtml(row.InvoiceIdentifier) + "</a> — " + VMS.UI.status(row.StatusCode) + "</p>"; }); $("#vendor-tab").html(html); });
                } else {
                    $.when(VMS.App.feedbackService.GetVendorAggregateYears(vendor.ID)).then(function (years) {
                        var currentYear = VMS.ClockService.riyadhYear();
                        var selectedYear = query.year ? Number(query.year) : currentYear;
                        var options = '<option value="' + currentYear + '">' + currentYear + " (Current)</option>";
                        $.each(years, function (_, year) { if (year !== currentYear) { options += '<option value="' + year + '"' + (year === selectedYear ? " selected" : "") + ">" + year + "</option>"; } });
                        $("#vendor-tab").html('<div class="vms-toolbar"><div><h2 class="vms-section-heading">Vendor Performance</h2><p class="vms-context">Only authorized aggregate results are displayed.</p></div><div><label class="vms-form-label" for="vendor-performance-year">Assignment Year</label><select id="vendor-performance-year" class="custom-select">' + options + '</select></div></div><div id="vendor-performance-results"></div>');
                        function loadAggregate(year) { VMS.App.feedbackService.GetVendorAggregate(vendor.ID, year).then(function (aggregate) { $("#vendor-performance-results").html(VMS.UI.summaryCards([{ label: "Overall Score", value: aggregate.overall === null ? null : aggregate.overall + "%" }, { label: "Payment Survey Score", value: aggregate.groups.PAYMENT === null ? null : aggregate.groups.PAYMENT + "%" }, { label: "Execution Survey Score", value: aggregate.groups.EXECUTION === null ? null : aggregate.groups.EXECUTION + "%" }, { label: "LFO Survey Score", value: aggregate.groups.LFO === null ? null : aggregate.groups.LFO + "%" }, { label: "Education Survey Score", value: aggregate.groups.EDUCATION_PROGRAM === null ? null : aggregate.groups.EDUCATION_PROGRAM + "%" }]) + VMS.UI.keyValues([{ label: "Contributing Assignments", value: aggregate.contributingAssignmentCount }, { label: "Latest Submission", value: aggregate.latestSubmissionDate ? VMS.ClockService.formatRiyadh(aggregate.latestSubmissionDate, false) : "No Data" }])); }, VMS.UI.handleError); }
                        $("#vendor-performance-year").val(String(selectedYear)).on("change", function () { loadAggregate(Number(this.value)); });
                        loadAggregate(selectedYear);
                    }, VMS.UI.handleError);
                }
            }, C.fail);
        }
    };
}(window, window.jQuery));
