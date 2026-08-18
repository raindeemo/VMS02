(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;
    var ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];
    var ROLES = ["SUPER_ADMIN", "ADMIN", "UPPER_MANAGEMENT", "MANAGER", "EMPLOYEE", "CO_OP"];
    var FUNCTIONS = ["LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP", "EXCELLENCE", "VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM", "ADMINISTRATION"];
    var BUSINESS_FUNCTIONS = ["LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP", "EXCELLENCE", "VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM"];
    var FEEDBACK_FUNCTIONS = ["LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP", "VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM"];
    var TABS = [
        { code: "access", label: "Access Control" },
        { code: "configuration", label: "ML Configuration" },
        { code: "conversion-rate", label: "Conversion Rate" },
        { code: "feedback-question", label: "Feedback Administration" },
        { code: "city", label: "City" },
        { code: "country", label: "Country" },
        { code: "category", label: "Category" }
    ];

    function options(values) {
        return $.map(values, function (value) { return { value: value, label: VMS.UI.titleize(value) }; });
    }

    function checked(name, label, value, disabled) {
        return '<div class="form-check"><input class="form-check-input" id="vms-check-' + U.escapeHtml(name) + '" name="' + U.escapeHtml(name) + '" type="checkbox"' + (value ? " checked" : "") + (disabled ? " disabled" : "") + '><label class="form-check-label" for="vms-check-' + U.escapeHtml(name) + '">' + U.escapeHtml(label) + "</label></div>";
    }

    function complete(modalPromise, refresh) {
        modalPromise.then(function (response) {
            VMS.UI.handleResponse(response);
            if (refresh) { refresh(response); }
        });
    }

    function tabShell(user, active) {
        var tabs = '<ul class="vms-tabs" role="list">';
        $.each(TABS, function (_, tab) {
            if ($.inArray(user.RoleCode, ADMIN_ROLES) >= 0 || tab.code === "access") {
                tabs += '<li><a href="' + VMS.Config.ROUTES.ADMINISTRATION + "?tab=" + tab.code + '"' + (active === tab.code ? ' aria-current="page"' : "") + '>' + U.escapeHtml(tab.label) + "</a></li>";
            }
        });
        return '<div id="admin-summary"></div>' + tabs + '</ul><section class="vms-panel"><div id="admin-workspace"></div></section>';
    }

    function refreshSummary() {
        VMS.App.accessService.GetAdministrationSummary().then(function (summary) {
            $("#admin-summary").html(VMS.UI.summaryCards([{ label: "Active Users", value: summary.activeUsers }]));
        }, VMS.UI.handleError);
    }

    function accessFields(user, categories, row, create) {
        var manager = user.RoleCode === "MANAGER";
        var roleOptions = manager ? options(["EMPLOYEE", "CO_OP"]) : options(ROLES);
        var functionOptions = manager ? options([user.FunctionCode]) : options(FUNCTIONS);
        var body = VMS.UI.field("UserName", "User Name", "text", row ? row.UserName : "", true);
        if (create) {
            body += VMS.UI.field("Email", "Work Email", "email", "", true);
        } else {
            body += '<div class="vms-info-panel"><strong>Work Email</strong><br>' + U.escapeHtml(row.Email) + "</div>";
        }
        body += '<div class="form-row"><div class="col-md-6">' + VMS.UI.field("RoleCode", "Role", "select", row ? row.RoleCode : "", true, roleOptions) + '</div><div class="col-md-6">' + VMS.UI.field("FunctionCode", "Function", "select", manager ? user.FunctionCode : (row ? row.FunctionCode : ""), true, functionOptions) + "</div></div>";
        body += '<div class="vms-access-categories">' + VMS.UI.multiSelectField("AssignedCategories", "Assigned Categories", C.lookupOptions(categories, "DisplayLabel"), row ? row.AssignedCategories : [], false) + "</div>";
        if (!manager) { body += VMS.UI.field("AccessNotes", "Access Notes", "textarea", row ? row.AccessNotes : "", false); }
        return body;
    }

    function wireAccessForm(user, form) {
        var manager = user.RoleCode === "MANAGER";
        var refresh = function () {
            var role = VMS.UI.formValue(form, "RoleCode");
            var functionCode = manager ? user.FunctionCode : VMS.UI.formValue(form, "FunctionCode");
            var needsCategories;
            if (!manager && $.inArray(role, ADMIN_ROLES) >= 0) {
                form.find('[name="FunctionCode"]').val("ADMINISTRATION").prop("disabled", true);
                functionCode = "ADMINISTRATION";
            } else {
                form.find('[name="FunctionCode"]').prop("disabled", manager);
            }
            needsCategories = $.inArray(role, ["EMPLOYEE", "CO_OP"]) >= 0 && $.inArray(functionCode, ["VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM"]) >= 0;
            form.find(".vms-access-categories").toggle(needsCategories).find("select").prop("required", needsCategories).attr("aria-required", needsCategories ? "true" : "false");
            if (!needsCategories) { form.find('[name="AssignedCategories"]').val([]); }
        };
        form.find('[name="RoleCode"],[name="FunctionCode"]').on("change", refresh);
        refresh();
    }

    function accessTab(user) {
        var table;
        var manager = user.RoleCode === "MANAGER";
        $("#admin-workspace").html('<div id="access-table"></div>');
        VMS.App.accessService.GetAccessCategoryOptions().then(function (categories) {
            function openAccess(row) {
                var create = !row;
                complete(VMS.UI.modalForm({
                    title: create ? "Grant Access" : "Update Access",
                    submitLabel: create ? "Grant Access" : "Save Access",
                    size: "modal-lg",
                    bodyHtml: accessFields(user, categories, row, create),
                    onReady: function (_, form) { wireAccessForm(user, form); },
                    onSubmit: function (form) {
                        var input = {
                            UserName: VMS.UI.formValue(form, "UserName"),
                            Email: create ? VMS.UI.formValue(form, "Email") : row.Email,
                            RoleCode: VMS.UI.formValue(form, "RoleCode"),
                            FunctionCode: manager ? user.FunctionCode : VMS.UI.formValue(form, "FunctionCode"),
                            AssignedCategories: $.map(VMS.UI.formValues(form, "AssignedCategories"), function (id) { return { id: Number(id) }; }),
                            IsActive: create ? true : row.IsActive,
                            AccessNotes: VMS.UI.formValue(form, "AccessNotes"),
                            IsDirectPaymentAuthorized: create ? false : row.IsDirectPaymentAuthorized
                        };
                        return create ? VMS.App.accessService.GrantAccess(input, U.guid()) : VMS.App.accessService.UpdateAccess(row.ID, row._etag, input, U.guid());
                    }
                }), function () { table.load(); refreshSummary(); });
            }

            function setActive(row) {
                complete(VMS.UI.modalForm({
                    title: row.IsActive ? "Deactivate User" : "Reactivate User",
                    submitLabel: row.IsActive ? "Deactivate" : "Reactivate",
                    bodyHtml: '<div class="vms-info-panel">' + U.escapeHtml((row.IsActive ? "Deactivating " : "Reactivating ") + row.UserName + ". Direct Payment Authorization will remain No after activation changes.") + "</div>" + VMS.UI.field("Reason", "Administrative Reason", "textarea", "", true),
                    onSubmit: function (form) { return VMS.App.accessService.SetUserActive(row.ID, row._etag, !row.IsActive, VMS.UI.formValue(form, "Reason"), U.guid()); }
                }), function () { table.load(); refreshSummary(); });
            }

            table = new VMS.TableComponent("#access-table", {
                id: "access",
                searchPlaceholder: "Search user name or email",
                searchFields: ["UserName", "Email"],
                sort: [{ field: "UserName", direction: "ASC" }],
                filters: (manager ? [] : [{ name: "function", label: "Function", field: "FunctionCode", options: options(FUNCTIONS) }]).concat([
                    { name: "role", label: "Role", field: "RoleCode", options: manager ? options(["EMPLOYEE", "CO_OP"]) : options(ROLES) },
                    { name: "status", label: "Status", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } },
                    { name: "category", label: "Assigned Category", field: "AssignedCategories", op: "lookupAny", options: C.lookupOptions(categories, "DisplayLabel"), parse: function (value) { return [Number(value)]; } }
                ]),
                toolbarHtml: '<button class="btn btn-primary vms-grant-access" type="button">Grant Access</button>',
                onToolbarReady: function (container) { container.find(".vms-grant-access").on("click", function () { openAccess(null); }); },
                query: function (spec) { return VMS.App.accessService.SearchUsers(spec); },
                columns: [
                    { label: "User", render: function (row) { return '<strong>' + U.escapeHtml(row.UserName) + '</strong><br><span class="text-muted">' + U.escapeHtml(row.Email) + "</span>"; } },
                    { label: "Function", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.FunctionCode)); } },
                    { label: "Role", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.RoleCode)); } },
                    { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } },
                    { label: "Direct Payment", render: function (row) { return C.bool(row.IsDirectPaymentAuthorized); } }
                ],
                actions: function (row) {
                    var html = C.actionButton("Edit", "edit", row.ID);
                    html += C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary");
                    if (row.FunctionCode === "VENDOR_MANAGEMENT" && $.inArray(row.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0 && row.IsActive) { html += C.actionButton(row.IsDirectPaymentAuthorized ? "Remove DP" : "Grant DP", "dp", row.ID); }
                    return html;
                },
                onAction: function (action, id) {
                    VMS.App.accessService.GetAdministrationUser(id).then(function (row) {
                        if (action === "edit") { openAccess(row); return; }
                        if (action === "active") { setActive(row); return; }
                        C.confirmationThen({ title: "Direct Payment Authorization", message: (row.IsDirectPaymentAuthorized ? "Remove" : "Grant") + " Direct Payment Authorization for " + row.UserName + "?", actionLabel: row.IsDirectPaymentAuthorized ? "Remove Authorization" : "Grant Authorization" }, function () { return VMS.App.accessService.SetDirectPaymentAuthorization(row.ID, row._etag, !row.IsDirectPaymentAuthorized, U.guid()); }, function () { table.load(); });
                    }, VMS.UI.handleError);
                }
            });
            table.render();
        }, VMS.UI.handleError);
    }

    function configurationTab() {
        var table;
        var groups = ["VENDOR_CLASSIFICATION", "INVOICE_MANAGED_BY", "INVOICE_REJECTION_REASON", "VENDOR_FEEDBACK_SCALE", "REGION"];
        function createOption() {
            complete(VMS.UI.modalForm({
                title: "Add Configuration Option",
                submitLabel: "Create Option",
                bodyHtml: VMS.UI.field("GroupCode", "Extensible Group", "select", "", true, options(groups)) + VMS.UI.field("ItemCode", "Item Code", "text", "", true) + VMS.UI.field("DisplayLabel", "Display Label", "text", "", true) + VMS.UI.field("TextValue", "Text Value", "text", "", false) + VMS.UI.field("NumericValue", "Numeric Value", "number", "", false) + VMS.UI.field("SortOrder", "Sort Order", "number", "", true) + VMS.UI.field("Description", "Description", "textarea", "", false),
                onSubmit: function (form) { return VMS.App.configurationService.CreateOption({ GroupCode: VMS.UI.formValue(form, "GroupCode"), ItemCode: VMS.UI.formValue(form, "ItemCode"), DisplayLabel: VMS.UI.formValue(form, "DisplayLabel"), TextValue: VMS.UI.formValue(form, "TextValue"), NumericValue: VMS.UI.formValue(form, "NumericValue"), SortOrder: VMS.UI.formValue(form, "SortOrder"), IsActive: true, Description: VMS.UI.formValue(form, "Description") }, U.guid()); }
            }), function () { table.load(); });
        }
        function edit(row) {
            var setting = row.ConfigurationType === "SETTING";
            var body = setting ? VMS.UI.field("TextValue", "Text Value", "text", row.TextValue, false) + VMS.UI.field("NumericValue", "Numeric Value", "number", row.NumericValue, false) + VMS.UI.field("Description", "Description", "textarea", row.Description, false) : VMS.UI.field("DisplayLabel", "Display Label", "text", row.DisplayLabel, true) + VMS.UI.field("SortOrder", "Sort Order", "number", row.SortOrder, true) + checked("IsActive", "Active", row.IsActive, row.IsLocked || row.GroupCode === "SURVEY_VERSION") + VMS.UI.field("Description", "Description", "textarea", row.Description, false);
            complete(VMS.UI.modalForm({ title: setting ? "Edit System Setting" : "Edit Configuration Option", submitLabel: "Save", bodyHtml: body, onSubmit: function (form) { return setting ? VMS.App.configurationService.UpdateSetting(row.ID, row._etag, { TextValue: VMS.UI.formValue(form, "TextValue"), NumericValue: VMS.UI.formValue(form, "NumericValue"), Description: VMS.UI.formValue(form, "Description") }, U.guid()) : VMS.App.configurationService.UpdateOption(row.ID, row._etag, { DisplayLabel: VMS.UI.formValue(form, "DisplayLabel"), SortOrder: VMS.UI.formValue(form, "SortOrder"), IsActive: form.find('[name="IsActive"]').is(":checked"), Description: VMS.UI.formValue(form, "Description") }, U.guid()); } }), function () { table.load(); });
        }
        table = new VMS.TableComponent("#admin-workspace", {
            id: "configuration", searchFields: ["GroupCode", "ItemCode", "DisplayLabel"], sort: [{ field: "GroupCode", direction: "ASC" }, { field: "SortOrder", direction: "ASC" }],
            filters: [{ name: "type", label: "Type", field: "ConfigurationType", options: options(["OPTION", "SETTING"]) }],
            toolbarHtml: '<button class="btn btn-primary vms-add-option" type="button">Add Option</button>', onToolbarReady: function (container) { container.find(".vms-add-option").on("click", createOption); }, query: function (spec) { return VMS.App.configurationService.Query(spec); },
            columns: [{ label: "Group", field: "GroupCode" }, { label: "Code", field: "ItemCode" }, { label: "Label", field: "DisplayLabel" }, { label: "Value", render: function (row) { return U.escapeHtml(row.TextValue || (row.NumericValue !== null ? row.NumericValue : "")); } }, { label: "Active", render: function (row) { return C.activeLabel(row.IsActive); } }, { label: "Locked", render: function (row) { return C.bool(row.IsLocked); } }],
            actions: function (row) { return C.actionButton(row.ConfigurationType === "SETTING" ? "Edit Setting" : "Edit Option", "edit", row.ID); }, onAction: function (_, id) { VMS.App.configurationService.Get(id).then(edit, VMS.UI.handleError); }
        });
        table.render();
    }

    function currencyTab() {
        var table;
        function create() {
            complete(VMS.UI.modalForm({ title: "Add Currency", submitLabel: "Create Currency", bodyHtml: VMS.UI.field("CurrencyCode", "Currency Code", "text", "", true) + VMS.UI.field("CurrencyName", "Currency Name", "text", "", true) + VMS.UI.field("ConversionRateToSAR", "Conversion Rate to SAR", "number", "", true) + VMS.UI.field("RateNote", "Rate Note", "textarea", "", false), onSubmit: function (form) { return VMS.App.currencyService.Create({ CurrencyCode: VMS.UI.formValue(form, "CurrencyCode"), CurrencyName: VMS.UI.formValue(form, "CurrencyName"), ConversionRateToSAR: VMS.UI.formValue(form, "ConversionRateToSAR"), RateNote: VMS.UI.formValue(form, "RateNote") }, U.guid()); } }), function () { table.load(); });
        }
        function edit(row) {
            complete(VMS.UI.modalForm({ title: "Update Conversion Rate", submitLabel: "Update Rate", bodyHtml: '<div class="vms-info-panel"><strong>' + U.escapeHtml(row.CurrencyCode + " — " + row.CurrencyName) + "</strong></div>" + VMS.UI.field("rate", "Conversion Rate to SAR", "number", row.ConversionRateToSAR, true) + VMS.UI.field("note", "Rate Note", "textarea", row.RateNote, false), onSubmit: function (form) { return VMS.App.currencyService.Update(row.ID, row._etag, { ConversionRateToSAR: VMS.UI.formValue(form, "rate"), RateNote: VMS.UI.formValue(form, "note") }, U.guid()); } }), function () { table.load(); });
        }
        table = new VMS.TableComponent("#admin-workspace", { id: "currency", searchFields: ["CurrencyCode", "CurrencyName"], sort: [{ field: "CurrencyCode", direction: "ASC" }], filters: [{ name: "status", label: "Status", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } }], toolbarHtml: '<button class="btn btn-primary vms-add-currency" type="button">Add Currency</button>', onToolbarReady: function (container) { container.find(".vms-add-currency").on("click", create); }, query: function (spec) { return VMS.App.currencyService.Query(spec); }, columns: [{ label: "Currency", render: function (row) { return "<strong>" + U.escapeHtml(row.CurrencyCode) + "</strong> — " + U.escapeHtml(row.CurrencyName); } }, { label: "Rate to SAR", render: function (row) { return U.escapeHtml(Number(row.ConversionRateToSAR).toFixed(6)); } }, { label: "Rate Note", field: "RateNote" }, { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return C.actionButton("Edit Rate", "edit", row.ID) + (row.CurrencyCode === "SAR" ? "" : C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary")); }, onAction: function (action, id) { VMS.App.currencyService.Get(id).then(function (row) { if (action === "edit") { edit(row); return; } C.confirmationThen({ title: row.IsActive ? "Deactivate Currency" : "Reactivate Currency", message: (row.IsActive ? "Deactivate " : "Reactivate ") + row.CurrencyCode + "?", actionLabel: row.IsActive ? "Deactivate" : "Reactivate", danger: row.IsActive }, function () { return VMS.App.currencyService.SetActive(row.ID, row._etag, !row.IsActive, U.guid()); }, function () { table.load(); }); }, VMS.UI.handleError); } });
        table.render();
    }

    function countryTab() {
        var table;
        function openForm(row) {
            var create = !row;
            complete(VMS.UI.modalForm({ title: create ? "Add Country" : "Edit Country", submitLabel: create ? "Create Country" : "Save Country", bodyHtml: (create ? VMS.UI.field("CountryCode", "Country Code", "text", "", true) : '<div class="vms-info-panel"><strong>Country Code</strong><br>' + U.escapeHtml(row.CountryCode) + "</div>") + VMS.UI.field("CountryName", "Country Name", "text", row ? row.CountryName : "", true) + VMS.UI.field("PhoneCode", "Phone Code", "text", row ? row.PhoneCode : "+", true) + VMS.UI.field("PhoneFormat", "Phone Format", "text", row ? row.PhoneFormat : "", false), onSubmit: function (form) { var input = { CountryCode: create ? VMS.UI.formValue(form, "CountryCode") : row.CountryCode, CountryName: VMS.UI.formValue(form, "CountryName"), PhoneCode: VMS.UI.formValue(form, "PhoneCode"), PhoneFormat: VMS.UI.formValue(form, "PhoneFormat") }; return create ? VMS.App.countryService.Create(input, U.guid()) : VMS.App.countryService.Update(row.ID, row._etag, input, U.guid()); } }), function () { table.load(); });
        }
        table = new VMS.TableComponent("#admin-workspace", { id: "country", searchFields: ["CountryCode", "CountryName"], sort: [{ field: "CountryName", direction: "ASC" }], filters: [{ name: "status", label: "Status", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } }], toolbarHtml: '<button class="btn btn-primary vms-add-country" type="button">Add Country</button>', onToolbarReady: function (container) { container.find(".vms-add-country").on("click", function () { openForm(null); }); }, query: function (spec) { return VMS.App.countryService.Query(spec); }, columns: [{ label: "Code", render: function (row) { return "<strong>" + U.escapeHtml(row.CountryCode) + "</strong>"; } }, { label: "Country", field: "CountryName" }, { label: "Phone Code", field: "PhoneCode" }, { label: "Phone Format", field: "PhoneFormat" }, { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return C.actionButton("Edit", "edit", row.ID) + C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary"); }, onAction: function (action, id) { VMS.App.countryService.Get(id).then(function (row) { if (action === "edit") { openForm(row); return; } C.confirmationThen({ title: row.IsActive ? "Deactivate Country" : "Reactivate Country", message: (row.IsActive ? "Deactivate " : "Reactivate ") + row.CountryName + "?", actionLabel: row.IsActive ? "Deactivate" : "Reactivate", danger: row.IsActive }, function () { return VMS.App.countryService.SetActive(row.ID, row._etag, !row.IsActive, U.guid()); }, function () { table.load(); }); }, VMS.UI.handleError); } });
        table.render();
    }

    function cityTab() {
        var table;
        function openForm(row) {
            VMS.App.countryService.Query({ pageSize: 10000, sort: [{ field: "CountryName", direction: "ASC" }] }).then(function (result) {
                var countries = row ? result.items : $.grep(result.items, function (country) { return country.IsActive; });
                complete(VMS.UI.modalForm({ title: row ? "Edit City" : "Add City", submitLabel: row ? "Save City" : "Create City", bodyHtml: VMS.UI.field("CityName", "City Name", "text", row ? row.CityName : "", true) + VMS.UI.field("Country", "Country", "select", row ? U.lookupId(row.Country) : "", true, C.lookupOptions(countries, "CountryName")), onSubmit: function (form) { var input = { CityName: VMS.UI.formValue(form, "CityName"), Country: Number(VMS.UI.formValue(form, "Country")) }; return row ? VMS.App.cityService.Update(row.ID, row._etag, input, U.guid()) : VMS.App.cityService.Create(input, U.guid()); } }), function () { table.load(); });
            }, VMS.UI.handleError);
        }
        table = new VMS.TableComponent("#admin-workspace", { id: "city", searchFields: ["CityName", "CountryCityKey"], sort: [{ field: "CityName", direction: "ASC" }], filters: [{ name: "status", label: "Status", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } }], toolbarHtml: '<button class="btn btn-primary vms-add-city" type="button">Add City</button>', onToolbarReady: function (container) { container.find(".vms-add-city").on("click", function () { openForm(null); }); }, query: function (spec) { return VMS.App.cityService.Query(spec); }, columns: [{ label: "City", render: function (row) { return "<strong>" + U.escapeHtml(row.CityName) + "</strong>"; } }, { label: "Country", render: function (row) { return U.escapeHtml(VMS.UI.lookup(row.Country)); } }, { label: "Country-City Key", field: "CountryCityKey" }, { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return C.actionButton("Edit", "edit", row.ID) + C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary"); }, onAction: function (action, id) { VMS.App.cityService.Get(id).then(function (row) { if (action === "edit") { openForm(row); return; } C.confirmationThen({ title: row.IsActive ? "Deactivate City" : "Reactivate City", message: (row.IsActive ? "Deactivate " : "Reactivate ") + row.CityName + "?", actionLabel: row.IsActive ? "Deactivate" : "Reactivate", danger: row.IsActive }, function () { return VMS.App.cityService.SetActive(row.ID, row._etag, !row.IsActive, U.guid()); }, function () { table.load(); }); }, VMS.UI.handleError); } });
        table.render();
    }

    function categoryTab() {
        var table;
        function openForm(row) {
            var create = !row;
            complete(VMS.UI.modalForm({ title: create ? "Add Category" : "Edit Category", submitLabel: create ? "Create Category" : "Save Category", bodyHtml: VMS.UI.field("FunctionCode", "Function", "select", row ? row.FunctionCode : "", true, options(BUSINESS_FUNCTIONS)) + VMS.UI.field("CategoryCode", "Category Code", "text", row ? row.CategoryCode : "", true) + VMS.UI.field("DisplayLabel", "Display Label", "text", row ? row.DisplayLabel : "", true) + VMS.UI.field("CompetencyName", "Competency Name", "text", row ? row.CompetencyName : "", true) + (row ? '<div class="vms-info-panel">Category identity fields become immutable after first reference. The service will block an unsafe change.</div>' : ""), onSubmit: function (form) { var input = { FunctionCode: VMS.UI.formValue(form, "FunctionCode"), CategoryCode: VMS.UI.formValue(form, "CategoryCode"), DisplayLabel: VMS.UI.formValue(form, "DisplayLabel"), CompetencyName: VMS.UI.formValue(form, "CompetencyName") }; return create ? VMS.App.categoryService.Create(input, U.guid()) : VMS.App.categoryService.Update(row.ID, row._etag, input, U.guid()); } }), function () { table.load(); });
        }
        table = new VMS.TableComponent("#admin-workspace", { id: "category", searchFields: ["CategoryCode", "DisplayLabel", "CompetencyName"], sort: [{ field: "FunctionCode", direction: "ASC" }, { field: "DisplayLabel", direction: "ASC" }], filters: [{ name: "function", label: "Function", field: "FunctionCode", options: options(BUSINESS_FUNCTIONS) }, { name: "status", label: "Status", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } }], toolbarHtml: '<button class="btn btn-primary vms-add-category" type="button">Add Category</button>', onToolbarReady: function (container) { container.find(".vms-add-category").on("click", function () { openForm(null); }); }, query: function (spec) { return VMS.App.categoryService.Query(spec); }, columns: [{ label: "Category", render: function (row) { return "<strong>" + U.escapeHtml(row.DisplayLabel) + "</strong><br>" + U.escapeHtml(row.CategoryCode); } }, { label: "Function", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.FunctionCode)); } }, { label: "Competency", field: "CompetencyName" }, { label: "Category Key", field: "CategoryKey" }, { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return C.actionButton("Edit", "edit", row.ID) + C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary"); }, onAction: function (action, id) { VMS.App.categoryService.Get(id).then(function (row) { if (action === "edit") { openForm(row); return; } C.confirmationThen({ title: row.IsActive ? "Deactivate Category" : "Reactivate Category", message: (row.IsActive ? "Deactivate " : "Reactivate ") + row.DisplayLabel + "?", actionLabel: row.IsActive ? "Deactivate" : "Reactivate", danger: row.IsActive }, function () { return VMS.App.categoryService.SetActive(row.ID, row._etag, !row.IsActive, U.guid()); }, function () { table.load(); }); }, VMS.UI.handleError); } });
        table.render();
    }

    function feedbackAdminTab() {
        var versionTable;
        var questionTable;
        var assignmentTable;
        var functionOptions = options(FEEDBACK_FUNCTIONS);
        $("#admin-workspace").html('<section><h2 class="vms-section-heading">Survey Versions &amp; Questions</h2><div id="feedback-versions"></div><div id="feedback-questions" class="mt-4"></div></section><section class="mt-4"><h2 class="vms-section-heading">Generate Assignments</h2><p>Assignment Year is controlled by the current Asia/Riyadh calendar year. Existing combinations are skipped.</p><button class="btn btn-primary" id="feedback-generate" type="button">Generate Assignments</button></section><section class="mt-4"><h2 class="vms-section-heading">Assignment Administration</h2><p>Only assignment metadata is displayed. Response content and scores are not retrieved.</p><div id="feedback-assignments"></div></section>');

        function getVersion(id) {
            return VMS.App.feedbackService.QueryVersions({ filters: [{ field: "ID", op: "eq", value: id }], pageSize: 1 }).then(function (result) { if (!result.items.length) { return $.Deferred().reject({ code: "NOT_FOUND_OR_UNAUTHORIZED", safeMessage: "Survey Version is unavailable." }).promise(); } return result.items[0]; });
        }

        function getQuestion(id) {
            return VMS.App.feedbackService.QueryQuestions({ filters: [{ field: "ID", op: "eq", value: id }], pageSize: 1 }).then(function (result) { if (!result.items.length) { return $.Deferred().reject({ code: "NOT_FOUND_OR_UNAUTHORIZED", safeMessage: "Question is unavailable." }).promise(); } return result.items[0]; });
        }

        function createVersion() {
            complete(VMS.UI.modalForm({ title: "Create Survey Version", submitLabel: "Create Version", bodyHtml: VMS.UI.field("FunctionCode", "Function", "select", "", true, functionOptions) + VMS.UI.field("SurveyVersionCode", "Survey Version Code", "text", "", true) + '<small class="form-text text-muted mb-3">Use &lt;FUNCTION&gt;_&lt;CURRENT YEAR&gt;_V&lt;N&gt;.</small>' + VMS.UI.field("DisplayLabel", "Display Label", "text", "", true) + VMS.UI.field("SortOrder", "Sort Order", "number", "", true) + VMS.UI.field("Description", "Description", "textarea", "", false), onSubmit: function (form) { return VMS.App.feedbackService.CreateSurveyVersion({ FunctionCode: VMS.UI.formValue(form, "FunctionCode"), SurveyVersionCode: VMS.UI.formValue(form, "SurveyVersionCode"), DisplayLabel: VMS.UI.formValue(form, "DisplayLabel"), SortOrder: VMS.UI.formValue(form, "SortOrder"), Description: VMS.UI.formValue(form, "Description") }, U.guid()); } }), function () { versionTable.load(); });
        }

        function questionForm(row) {
            VMS.App.feedbackService.QueryVersions({ pageSize: 10000, sort: [{ field: "TextValue", direction: "ASC" }, { field: "SortOrder", direction: "ASC" }] }).then(function (versions) {
                var versionOptions = $.map(versions.items, function (version) { return { value: version.TextValue + "|" + version.ItemCode, label: VMS.UI.titleize(version.TextValue) + " — " + version.ItemCode }; });
                var body = row ? '<div class="vms-info-panel"><strong>' + U.escapeHtml(VMS.UI.titleize(row.FunctionCode) + " — " + row.SurveyVersionCode + " — " + row.QuestionCode) + "</strong></div>" : VMS.UI.field("Version", "Survey Version", "select", "", true, versionOptions) + VMS.UI.field("QuestionCode", "Question Code", "text", "", true);
                body += VMS.UI.field("QuestionGroupCode", "Question Group", "select", row ? row.QuestionGroupCode : "", true, options(["PAYMENT", "EXECUTION", "EDUCATION_PROGRAM", "LFO"])) + VMS.UI.field("QuestionText", "Question Text", "textarea", row ? row.QuestionText : "", true) + VMS.UI.field("QuestionTypeCode", "Question Type", "select", row ? row.QuestionTypeCode : "", true, options(["SCORE", "OPEN_TEXT"])) + VMS.UI.field("ScoreScaleCode", "Score Scale", "select", row ? row.ScoreScaleCode : "", false, [{ value: "VENDOR_FEEDBACK_SCALE", label: "Vendor Feedback Scale" }]) + VMS.UI.field("DisplayOrder", "Display Order", "number", row ? row.DisplayOrder : "", true) + VMS.UI.field("Notes", "Notes", "textarea", row ? row.Notes : "", false);
                complete(VMS.UI.modalForm({ title: row ? "Edit Question" : "Add Question", submitLabel: row ? "Save Question" : "Create Question", bodyHtml: body, onReady: function (_, form) { var refresh = function () { var scored = VMS.UI.formValue(form, "QuestionTypeCode") === "SCORE"; form.find('[name="ScoreScaleCode"]').prop("required", scored).closest(".form-group").toggle(scored); if (!scored) { form.find('[name="ScoreScaleCode"]').val(""); } }; form.find('[name="QuestionTypeCode"]').on("change", refresh); refresh(); }, onSubmit: function (form) { var parts = row ? [row.FunctionCode, row.SurveyVersionCode] : String(VMS.UI.formValue(form, "Version") || "").split("|"); var input = { FunctionCode: parts[0], SurveyVersionCode: parts[1], QuestionCode: row ? row.QuestionCode : VMS.UI.formValue(form, "QuestionCode"), QuestionGroupCode: VMS.UI.formValue(form, "QuestionGroupCode"), QuestionText: VMS.UI.formValue(form, "QuestionText"), QuestionTypeCode: VMS.UI.formValue(form, "QuestionTypeCode"), ScoreScaleCode: VMS.UI.formValue(form, "ScoreScaleCode"), DisplayOrder: VMS.UI.formValue(form, "DisplayOrder"), IsActive: row ? row.IsActive : true, Notes: VMS.UI.formValue(form, "Notes") }; return row ? VMS.App.feedbackService.UpdateQuestion(row.ID, row._etag, input, U.guid()) : VMS.App.feedbackService.CreateQuestion(input, U.guid()); } }), function () { questionTable.load(); });
            }, VMS.UI.handleError);
        }

        versionTable = new VMS.TableComponent("#feedback-versions", { id: "feedback-versions", searchFields: ["ItemCode", "DisplayLabel", "TextValue"], sort: [{ field: "TextValue", direction: "ASC" }, { field: "SortOrder", direction: "ASC" }], filters: [{ name: "function", label: "Function", field: "TextValue", options: functionOptions }], toolbarHtml: '<button class="btn btn-primary vms-add-version" type="button">Create Survey Version</button>', onToolbarReady: function (container) { container.find(".vms-add-version").on("click", createVersion); }, query: function (spec) { return VMS.App.feedbackService.QueryVersions(spec); }, columns: [{ label: "Function", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.TextValue)); } }, { label: "Version", field: "ItemCode" }, { label: "Label", field: "DisplayLabel" }, { label: "Year", field: "NumericValue" }, { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return row.IsActive ? "Current active version" : C.actionButton("Activate", "activate", row.ID, "btn-primary"); }, onAction: function (_, id) { getVersion(id).then(function (row) { C.confirmationThen({ title: "Activate Survey Version", message: "Validate and activate " + row.ItemCode + " for " + VMS.UI.titleize(row.TextValue) + "? The previously active Version for this Function will be deactivated.", actionLabel: "Activate Version" }, function () { return VMS.App.feedbackService.ActivateVersion(row.TextValue, row.ItemCode, U.guid()); }, function () { versionTable.load(); }); }, VMS.UI.handleError); } });
        versionTable.render();

        questionTable = new VMS.TableComponent("#feedback-questions", { id: "feedback-questions", searchFields: ["QuestionCode", "QuestionText", "SurveyVersionCode"], sort: [{ field: "FunctionCode", direction: "ASC" }, { field: "SurveyVersionCode", direction: "ASC" }, { field: "DisplayOrder", direction: "ASC" }], filters: [{ name: "function", label: "Function", field: "FunctionCode", options: functionOptions }, { name: "status", label: "Status", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } }], toolbarHtml: '<button class="btn btn-primary vms-add-question" type="button">Add Question</button>', onToolbarReady: function (container) { container.find(".vms-add-question").on("click", function () { questionForm(null); }); }, query: function (spec) { return VMS.App.feedbackService.QueryQuestions(spec); }, columns: [{ label: "Function / Version", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.FunctionCode) + " — " + row.SurveyVersionCode); } }, { label: "Question", render: function (row) { return "<strong>" + U.escapeHtml(row.QuestionCode) + "</strong><br>" + U.escapeHtml(row.QuestionText); } }, { label: "Group", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.QuestionGroupCode)); } }, { label: "Type", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.QuestionTypeCode)); } }, { label: "Order", field: "DisplayOrder" }, { label: "Status", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return C.actionButton("Edit", "edit", row.ID) + C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary"); }, onAction: function (action, id) { getQuestion(id).then(function (row) { if (action === "edit") { questionForm(row); return; } C.confirmationThen({ title: row.IsActive ? "Deactivate Question" : "Reactivate Question", message: (row.IsActive ? "Deactivate " : "Reactivate ") + row.QuestionCode + "?", actionLabel: row.IsActive ? "Deactivate" : "Reactivate", danger: row.IsActive }, function () { return VMS.App.feedbackService.SetQuestionActive(row.ID, row._etag, !row.IsActive, U.guid()); }, function () { questionTable.load(); }); }, VMS.UI.handleError); } });
        questionTable.render();

        $("#feedback-generate").on("click", function () {
            VMS.App.feedbackService.GetGenerationOptions().then(function (generationOptions) {
                complete(VMS.UI.modalForm({ title: "Generate Feedback Assignments", submitLabel: "Generate Missing Assignments", size: "modal-lg", bodyHtml: '<div class="vms-info-panel">The Assignment Year is ' + U.escapeHtml(VMS.ClockService.riyadhYear()) + ". Only missing user, Vendor, Function, and year combinations will be created.</div>" + VMS.UI.field("FunctionCode", "Function", "select", "", true, options(generationOptions.functionCodes)) + VMS.UI.multiSelectField("Vendors", "Approved Vendors", C.lookupOptions(generationOptions.vendors, "DisplayName"), [], true), onSubmit: function (form) { return VMS.App.feedbackService.GenerateAssignments(VMS.UI.formValue(form, "FunctionCode"), $.map(VMS.UI.formValues(form, "Vendors"), Number), U.guid()); } }), function (response) { var data = response.data || {}; VMS.UI.toast("success", "Generation summary", Number(data.createdCount || 0) + " created; " + Number(data.skippedCount || 0) + " already existed."); assignmentTable.load(); });
            }, VMS.UI.handleError);
        });

        function getAssignment(id) {
            return VMS.App.feedbackService.QueryAssignmentMetadata({ filters: [{ field: "ID", op: "eq", value: id }], pageSize: 1 }).then(function (result) { if (!result.items.length) { return $.Deferred().reject({ code: "NOT_FOUND_OR_UNAUTHORIZED", safeMessage: "Assignment is unavailable." }).promise(); } return result.items[0]; });
        }
        assignmentTable = new VMS.TableComponent("#feedback-assignments", { id: "feedback-assignments", searchFields: ["VendorCodeSnapshot", "VendorNameSnapshot", "AssignedUserName", "AssignedUserEmail"], sort: [{ field: "AssignmentDate", direction: "DESC" }, { field: "ID", direction: "DESC" }], filters: [{ name: "function", label: "Function", field: "FunctionCode", options: functionOptions }, { name: "assignmentStatus", label: "Assignment Status", field: "AssignmentStatusCode", options: options(["OPEN", "SUBMITTED"]) }, { name: "active", label: "Activation", field: "IsActive", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }], parse: function (value) { return value === "true"; } }], query: function (spec) { return VMS.App.feedbackService.QueryAssignmentMetadata(spec); }, columns: [{ label: "Vendor", render: function (row) { return "<strong>" + U.escapeHtml(row.VendorNameSnapshot) + "</strong><br>" + U.escapeHtml(row.VendorCodeSnapshot); } }, { label: "Assigned User", render: function (row) { return U.escapeHtml(row.AssignedUserName) + '<br><span class="text-muted">' + U.escapeHtml(row.AssignedUserEmail) + "</span>"; } }, { label: "Function / Year", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.FunctionCode) + " — " + row.AssignmentYear); } }, { label: "Version", field: "SurveyVersionCode" }, { label: "Assignment Status", render: function (row) { return VMS.UI.status(row.AssignmentStatusCode); } }, { label: "Assignment Date", render: function (row) { return VMS.UI.date(row.AssignmentDate); } }, { label: "Completed Date", render: function (row) { return VMS.UI.date(row.CompletedDate); } }, { label: "Activation", render: function (row) { return C.activeLabel(row.IsActive); } }], actions: function (row) { return C.actionButton(row.IsActive ? "Deactivate" : "Reactivate", "active", row.ID, row.IsActive ? "btn-danger" : "btn-secondary"); }, onAction: function (_, id) { getAssignment(id).then(function (row) { complete(VMS.UI.modalForm({ title: row.IsActive ? "Deactivate Assignment" : "Reactivate Assignment", submitLabel: row.IsActive ? "Deactivate" : "Reactivate", bodyHtml: '<div class="vms-info-panel">Only assignment availability metadata will change. Submitted response content is not accessed.</div>' + VMS.UI.field("Reason", "Administrative Reason", "textarea", "", true), onSubmit: function (form) { return VMS.App.feedbackService.SetAssignmentActive(row.ID, row._etag, !row.IsActive, VMS.UI.formValue(form, "Reason"), U.guid()); } }), function () { assignmentTable.load(); }); }, VMS.UI.handleError); } });
        assignmentTable.render();
    }

    VMS.PageControllers.ADMINISTRATION = {
        title: "Administration",
        run: function (user) {
            var active = C.query().tab || "access";
            var valid = $.grep(TABS, function (tab) { return tab.code === active; }).length > 0;
            if (!valid || (user.RoleCode === "MANAGER" && active !== "access")) { C.fail({ safeMessage: "The requested Administration tab is unavailable." }); return; }
            C.content('<p class="vms-context">Governed access, configuration, master data, conversion rates, and Feedback metadata.</p>' + tabShell(user, active));
            refreshSummary();
            if (active === "access") { accessTab(user); }
            else if (active === "configuration") { configurationTab(); }
            else if (active === "conversion-rate") { currencyTab(); }
            else if (active === "feedback-question") { feedbackAdminTab(); }
            else if (active === "city") { cityTab(); }
            else if (active === "country") { countryTab(); }
            else if (active === "category") { categoryTab(); }
        }
    };
}(window, window.jQuery));
