(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    function openNewPRPO(refresh) {
        VMS.App.prpoService.GetCreationLookups().then(function (lookups) {
            var vendors = lookups.vendors;
            var currencies = lookups.currencies;
            var body = '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("PRNumber", "PR Number", "text", "", true) + '</div><div class="col-md-6">' + VMS.UI.field("PRAmount", "PR Amount", "number", "", true) + "</div></div>" + VMS.UI.field("Vendor", "Vendor", "select", "", true, C.lookupOptions(vendors, "DisplayName")) + VMS.UI.field("Currency", "Currency", "select", "", true, C.lookupOptions(currencies, "CurrencyCode")) + VMS.UI.field("Description", "Description", "textarea", "", false);
            VMS.UI.modalForm({ title: "New PR / PO", submitLabel: "Submit for Review", bodyHtml: body, onSubmit: function (form) { return VMS.App.prpoService.Create({ PRNumber: VMS.UI.formValue(form, "PRNumber"), PRAmount: VMS.UI.formValue(form, "PRAmount"), Vendor: Number(VMS.UI.formValue(form, "Vendor")), Currency: Number(VMS.UI.formValue(form, "Currency")), Description: VMS.UI.formValue(form, "Description") }, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); refresh(); });
        }, VMS.UI.handleError);
    }

    function openReason(title, label, submit, handler) {
        VMS.UI.modalForm({ title: title, submitLabel: submit, bodyHtml: VMS.UI.field("reason", label, "textarea", "", true), onSubmit: function (form) { return handler(VMS.UI.formValue(form, "reason")); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.reload(); });
    }

    function openCreatePO(record) {
        var body = VMS.UI.field("PONumber", "PO Number", "text", "", true) + VMS.UI.field("POLineAmount", "Initial Line 10 Amount", "number", "", true);
        VMS.UI.modalForm({ title: "Create PO and Initial Line", submitLabel: "Create PO", bodyHtml: body, onSubmit: function (form) { return VMS.App.prpoService.CreatePOAndInitialLine(record.ID, record._etag, { PONumber: VMS.UI.formValue(form, "PONumber"), POLineAmount: VMS.UI.formValue(form, "POLineAmount") }, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.reload(); });
    }

    function openCorrection(record) {
        VMS.App.prpoService.GetCreationLookups().then(function (lookups) {
            var body = '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("PRNumber", "PR Number", "text", record.PRNumber, true) + '</div><div class="col-md-6">' + VMS.UI.field("PRAmount", "PR Amount", "number", record.PRAmount, true) + "</div></div>" + VMS.UI.field("Vendor", "Vendor", "select", VMS.Utilities.lookupId(record.Vendor), true, C.lookupOptions(lookups.vendors, "DisplayName")) + VMS.UI.field("Currency", "Currency", "select", VMS.Utilities.lookupId(record.Currency), true, C.lookupOptions(lookups.currencies, "CurrencyCode")) + VMS.UI.field("Description", "Description", "textarea", record.Description, false);
            VMS.UI.modalForm({ title: "Correct PR / PO", submitLabel: "Save Correction", bodyHtml: body, onSubmit: function (form) { return VMS.App.prpoService.SaveUpdateRequiredCorrection(record.ID, record._etag, { PRNumber: VMS.UI.formValue(form, "PRNumber"), PRAmount: VMS.UI.formValue(form, "PRAmount"), Vendor: Number(VMS.UI.formValue(form, "Vendor")), Currency: Number(VMS.UI.formValue(form, "Currency")), Description: VMS.UI.formValue(form, "Description") }, U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); window.location.href = VMS.Config.ROUTES.PRPO_APPROVAL + "?id=" + response.data.ID + "&key=" + encodeURIComponent(response.data.PRNumber); });
        }, VMS.UI.handleError);
    }

    function openAdminCorrection(record, refresh) {
        VMS.App.prpoService.GetCreationLookups().then(function (lookups) {
            var beforeFinal = (record.StageCode === "MANAGER_REVIEW" || record.StageCode === "UPDATE_REQUIRED") && record.StatusCode === "IN_PROGRESS" && record.WorkflowApproved !== true;
            var body = '<div class="vms-info-panel">This repair does not approve, reject, return, resubmit, or reopen the PR/PO.</div>';
            if (beforeFinal) {
                body += '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("PRNumber", "PR Number", "text", record.PRNumber, true) + '</div><div class="col-md-6">' + VMS.UI.field("PRAmount", "PR Amount", "number", record.PRAmount, true) + "</div></div>" + VMS.UI.field("Vendor", "Vendor", "select", U.lookupId(record.Vendor), true, C.lookupOptions(lookups.vendors, "DisplayName")) + VMS.UI.field("Currency", "Currency", "select", U.lookupId(record.Currency), true, C.lookupOptions(lookups.currencies, "CurrencyCode"));
            }
            body += VMS.UI.field("Description", "Description", "textarea", record.Description, false) + VMS.UI.field("AdministrativeReason", "Administrative Reason", "textarea", "", true) + '<div class="form-check mb-3"><input class="form-check-input" id="confirm-prpo-admin" name="Confirmed" type="checkbox"><label class="form-check-label" for="confirm-prpo-admin">I confirm this controlled administrative correction.</label></div>';
            VMS.UI.modalForm({ title: "PR / PO Administration", size: "modal-lg", submitLabel: "Save Administrative Correction", bodyHtml: body, onSubmit: function (form) {
                return VMS.App.prpoService.AdminUpdate(record.ID, record._etag, {
                    PRNumber: beforeFinal ? VMS.UI.formValue(form, "PRNumber") : record.PRNumber,
                    PRAmount: beforeFinal ? VMS.UI.formValue(form, "PRAmount") : record.PRAmount,
                    Vendor: beforeFinal ? Number(VMS.UI.formValue(form, "Vendor")) : U.lookupId(record.Vendor),
                    Currency: beforeFinal ? Number(VMS.UI.formValue(form, "Currency")) : U.lookupId(record.Currency),
                    Description: VMS.UI.formValue(form, "Description"),
                    AdministrativeReason: VMS.UI.formValue(form, "AdministrativeReason"),
                    Confirmed: form.find('[name="Confirmed"]').is(":checked")
                }, U.guid());
            } }).then(function (response) { VMS.UI.handleResponse(response); refresh(response.data); });
        }, VMS.UI.handleError);
    }

    VMS.PageControllers.PRPO_REGISTER = {
        title: "PR / PO Register",
        run: function (user) {
            var table;
            var canCreate = VMS.App.accessService.CanPerform(user, "PRPO_CREATE", {});
            var canAdmin = VMS.App.accessService.CanPerform(user, "ADMIN_PRPO_UPDATE", {});
            C.content('<p class="vms-context">Authorized purchase requests, Manager review, PO creation, and Line workspaces.</p><div id="prpo-summary"></div><section class="vms-panel"><div id="prpo-table"></div></section>');
            function summary() { VMS.App.prpoService.GetRegisterSummary().then(function (value) { $("#prpo-summary").html(VMS.UI.summaryCards([{ label: "Total PRs", value: value.totalPRs }, { label: "Total Amount", value: "SAR " + Number(value.totalAmountSAR).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }])); }); }
            table = new VMS.TableComponent("#prpo-table", {
                id: "prpo", searchPlaceholder: "Search PR Number, PO Number, or Vendor", searchFields: ["PRNumber", "PONumber", "VendorNameSnapshot"], sort: [{ field: "CreationDate", direction: "DESC" }],
                toolbarHtml: canCreate ? '<button class="btn btn-primary vms-new-prpo" type="button">New PR / PO</button>' : "",
                onToolbarReady: function (container) { container.find(".vms-new-prpo").on("click", function () { openNewPRPO(function () { table.load(); summary(); }); }); },
                query: function (spec) { return VMS.App.prpoService.Query(spec); },
                columns: [
                    { label: "PR Number", render: function (row) { return '<strong>' + U.escapeHtml(row.PRNumber) + "</strong>"; } },
                    { label: "Vendor", render: function (row) { return U.escapeHtml(row.VendorNameSnapshot); } },
                    { label: "PR Amount", render: function (row) { return VMS.UI.money(row.PRAmount, VMS.UI.lookup(row.Currency)); } },
                    { label: "PO Number", render: function (row) { return U.escapeHtml(row.PONumber || "Not created"); } },
                    { label: "Stage", render: function (row) { return VMS.UI.status(row.StageCode); } },
                    { label: "Status", render: function (row) { return VMS.UI.status(row.StatusCode); } }
                ],
                actions: function (row) {
                    var html = "";
                    if (row.StageCode === "MANAGER_REVIEW" && user.RoleCode === "MANAGER" && user.FunctionCode === "VENDOR_MANAGEMENT") { html += C.linkButton("Review", VMS.Config.ROUTES.PRPO_APPROVAL + "?id=" + row.ID + "&key=" + encodeURIComponent(row.PRNumber), "btn-primary"); }
                    if (row.StageCode === "PENDING_GPS" && canCreate) { html += C.actionButton("Create PO", "create-po", row.ID, "btn-primary"); }
                    if (row.StageCode === "PO_ACTIVE") { html += C.linkButton("PO Lines", VMS.Config.ROUTES.PO_LINE_WORKSPACE + "?id=" + row.ID + "&key=" + encodeURIComponent(row.PRNumber)); }
                    if (canAdmin) { html += C.actionButton("Admin", "admin", row.ID, "btn-secondary"); }
                    return html || C.linkButton("View", VMS.Config.ROUTES.PRPO_APPROVAL + "?id=" + row.ID + "&key=" + encodeURIComponent(row.PRNumber));
                },
                onAction: function (action, id) { if (action === "create-po") { VMS.App.prpoService.GetActionItem(id, "PO_CREATE").then(openCreatePO, VMS.UI.handleError); } if (action === "admin") { VMS.App.prpoService.GetActionItem(id, "ADMIN_PRPO_UPDATE").then(function (record) { openAdminCorrection(record, function () { table.load(); summary(); }); }, VMS.UI.handleError); } }
            });
            summary();
            table.render();
        }
    };

    VMS.PageControllers.PRPO_APPROVAL = {
        title: "PR / PO Approval",
        run: function (user) {
            var query = C.query();
            C.loading("Loading authorized PR / PO...");
            VMS.App.prpoService.Get(query.id, query.key).then(function (record) {
                var manager = user.RoleCode === "MANAGER" && user.FunctionCode === "VENDOR_MANAGEMENT";
                var canCreate = VMS.App.accessService.CanPerform(user, "PRPO_CREATE", {});
                var canAdmin = VMS.App.accessService.CanPerform(user, "ADMIN_PRPO_UPDATE", {});
                var actions = "";
                if (manager && record.StageCode === "MANAGER_REVIEW") { actions = '<button id="prpo-approve" class="btn btn-primary" type="button">Approve</button> <button id="prpo-return" class="btn btn-secondary" type="button">Update Required</button> <button id="prpo-reject" class="btn btn-danger" type="button">Reject</button>'; }
                if (canCreate && record.StageCode === "UPDATE_REQUIRED") { actions = '<button id="prpo-correct" class="btn btn-secondary" type="button">Edit Correction</button> <button id="prpo-resubmit" class="btn btn-primary" type="button">Resubmit</button>'; }
                if (canAdmin) { actions += ' <button id="prpo-admin" class="btn btn-secondary" type="button">Administration</button>'; }
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(record.PRNumber) + '</h2><p class="vms-context">' + VMS.UI.status(record.StageCode) + " " + VMS.UI.status(record.StatusCode) + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.PRPO_REGISTER + '">Back to Register</a></div><section class="vms-panel">' + VMS.UI.keyValues([{ label: "Vendor", value: record.VendorNameSnapshot }, { label: "PR Amount", value: VMS.UI.money(record.PRAmount, VMS.UI.lookup(record.Currency)), html: true }, { label: "Description", value: record.Description }, { label: "PO Number", value: record.PONumber }, { label: "Creation Date", value: VMS.ClockService.formatRiyadh(record.CreationDate, false) }, { label: "Workflow Approved", value: C.bool(record.WorkflowApproved) }]) + '</section><div class="vms-toolbar-group">' + actions + "</div>");
                $("#prpo-approve").on("click", function () { C.confirmationThen({ title: "Approve PR / PO", message: "Approve " + record.PRNumber + " and move it to Pending GPS?", actionLabel: "Approve" }, function () { return VMS.App.prpoService.Approve(record.ID, record._etag, U.guid()); }, function () { window.location.reload(); }); });
                $("#prpo-return").on("click", function () { openReason("Update Required", "Reason", "Return for Update", function (reason) { return VMS.App.prpoService.ReturnForUpdate(record.ID, record._etag, reason, U.guid()); }); });
                $("#prpo-reject").on("click", function () { openReason("Reject PR / PO", "Rejection Reason", "Reject", function (reason) { return VMS.App.prpoService.Reject(record.ID, record._etag, reason, U.guid()); }); });
                $("#prpo-correct").on("click", function () { openCorrection(record); });
                $("#prpo-resubmit").on("click", function () { C.confirmationThen({ title: "Resubmit PR / PO", message: "Revalidate and resubmit " + record.PRNumber + " for Manager review?", actionLabel: "Resubmit" }, function () { return VMS.App.prpoService.Resubmit(record.ID, record._etag, U.guid()); }, function () { window.location.reload(); }); });
                $("#prpo-admin").on("click", function () { openAdminCorrection(record, function () { window.location.reload(); }); });
            }, C.fail);
        }
    };

    VMS.PageControllers.PO_LINE_WORKSPACE = {
        title: "PO Line Workspace",
        run: function (user) {
            var query = C.query();
            var header;
            var canProcess = VMS.App.accessService.CanPerform(user, "PO_LINE_PROCESS", {});
            C.loading("Loading authorized PO Line workspace...");
            VMS.App.prpoService.Get(query.id, query.key).then(function (record) {
                header = record;
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(header.PONumber) + '</h2><p class="vms-context">PR <a href="' + VMS.Config.ROUTES.PRPO_APPROVAL + "?id=" + header.ID + "&key=" + encodeURIComponent(header.PRNumber) + '">' + U.escapeHtml(header.PRNumber) + "</a> · " + U.escapeHtml(header.VendorNameSnapshot) + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.PRPO_REGISTER + '">Back to Register</a></div><div id="po-line-summary"></div><section><h2 class="vms-section-heading">PO Line Balances</h2><div id="po-line-cards" class="vms-line-card-grid"></div></section><section class="vms-panel vms-section"><h2 class="vms-section-heading">Line Creation Progress</h2><div id="line-progress"></div></section>');
                function pendingActions(line) { var html = ""; if (canProcess && line.LineRequestStageCode === "PLANNED") { html += C.actionButton("Add Line Details", "details", line.ID, "btn-primary"); } if (canProcess && line.LineRequestStageCode === "CREATION") { html += C.actionButton("Activate Line", "activate", line.ID, "btn-primary"); } if (canProcess && !line.IsInitialLine) { html += C.actionButton("Cancel", "cancel", line.ID, "btn-danger"); } return html || '<span class="text-muted">Read only</span>'; }
                function loadWorkspace() {
                    VMS.App.poLineService.GetWorkspaceData(header.ID).then(function (workspace) {
                        var cards = "";
                        var progress = "";
                        $("#po-line-summary").html(VMS.UI.summaryCards([{ label: "Active Approved Lines", value: workspace.activeApprovedCount + " OF " + workspace.maximumLines + " LINES" }, { label: "Line Condition", value: workspace.thresholdReached ? "PO Threshold Reached" : "Within Threshold" }]));
                        $.each(workspace.slots, function (_, slot) {
                            var line = slot.record;
                            var content;
                            if (!line) {
                                content = slot.initialLineMissing ? '<p class="text-danger">Initial Line data is unavailable and requires reconciliation.</p>' : '<p class="vms-context">Available</p>' + (canProcess ? '<button type="button" class="btn btn-primary" data-plan-line="' + slot.lineNumber + '">Request Additional Line</button>' : '<p class="text-muted">No request currently occupies this slot.</p>');
                            } else if (line.LineRequestStageCode !== "ACTIVE") {
                                content = '<p>' + VMS.UI.status(line.LineRequestStageCode === "PLANNED" ? "REQUESTED" : "IN_PROGRESS") + '</p><p class="text-muted">Financial balance becomes available after activation.</p>';
                            } else {
                                var total = Number(line.POLineAmount || 0);
                                var used = Number(line.ConsumedAmount || 0);
                                var percent = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
                                content = '<div class="vms-line-money"><span>Total <strong>' + VMS.UI.money(total, VMS.UI.lookup(header.Currency)) + '</strong></span><span>Used <strong>' + VMS.UI.money(used, VMS.UI.lookup(header.Currency)) + '</strong></span><span>Remaining <strong>' + VMS.UI.money(line.RemainingBalance, VMS.UI.lookup(header.Currency)) + '</strong></span></div><div class="vms-progress" role="progressbar" aria-label="Line ' + slot.lineNumber + ' consumed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div><p>' + percent + "% used · " + VMS.UI.status(line.POLineStatusCode) + "</p>";
                            }
                            cards += '<article class="vms-line-card"><h3>Line ' + slot.slotIndex + ' → ' + U.escapeHtml(slot.lineNumber) + "</h3>" + content + "</article>";
                        });
                        $("#po-line-cards").html(cards);
                        if (workspace.pending.length) {
                            progress = '<div class="vms-table-wrap"><table class="vms-table"><thead><tr><th scope="col">Line Number</th><th scope="col">Status</th><th scope="col">Last Update</th><th scope="col">Action</th></tr></thead><tbody>';
                            $.each(workspace.pending, function (_, line) { progress += "<tr><td>" + U.escapeHtml(line.POLineNumber) + "</td><td>" + VMS.UI.status(line.LineRequestStageCode) + " " + VMS.UI.status(line.LineRequestStatusCode) + "</td><td>" + VMS.UI.date(line.Modified) + '</td><td class="vms-actions">' + pendingActions(line) + "</td></tr>"; });
                            progress += "</tbody></table></div>";
                        } else { progress = '<div class="vms-table-state">No additional Lines currently require creation work.</div>'; }
                        $("#line-progress").html(progress);
                    }, VMS.UI.handleError);
                }
                $("#po-line-cards").on("click", "[data-plan-line]", function () { var lineNumber = this.getAttribute("data-plan-line"); C.confirmationThen({ title: "Request Additional Line", message: "Request Line " + lineNumber + " for " + header.PONumber + "?", actionLabel: "Request Line" }, function () { return VMS.App.poLineService.PlanAdditional(header.ID, lineNumber, U.guid()); }, loadWorkspace); });
                $("#line-progress").on("click", "[data-action]", function () {
                    var action = $(this).attr("data-action");
                    VMS.App.poLineService.GetActionItem(Number($(this).attr("data-id"))).then(function (line) {
                        if (action === "details") { VMS.UI.modalForm({ title: "Add PO Line Details", submitLabel: "Save Details", bodyHtml: VMS.UI.field("amount", "PO Line Amount", "number", line.POLineAmount || "", true), onSubmit: function (form) { return VMS.App.poLineService.SaveDetails(line.ID, line._etag, VMS.UI.formValue(form, "amount"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); loadWorkspace(); }); }
                        if (action === "activate") { C.confirmationThen({ title: "Activate PO Line", message: "Activate " + line.POLineKey + " with its configured threshold snapshot?", actionLabel: "Activate" }, function () { return VMS.App.poLineService.Activate(line.ID, line._etag, U.guid()); }, loadWorkspace); }
                        if (action === "cancel") { VMS.UI.modalForm({ title: "Cancel PO Line", submitLabel: "Cancel Line", bodyHtml: VMS.UI.field("reason", "Cancellation Reason", "textarea", "", true), onSubmit: function (form) { return VMS.App.poLineService.Cancel(line.ID, line._etag, VMS.UI.formValue(form, "reason"), U.guid()); } }).then(function (response) { VMS.UI.handleResponse(response); loadWorkspace(); }); }
                    }, VMS.UI.handleError);
                });
                loadWorkspace();
            }, C.fail);
        }
    };
}(window, window.jQuery));
