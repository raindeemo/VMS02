(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function column(code, label, field, type, isDefault) {
        return { code: code, label: label, field: field, type: type || "text", isDefault: isDefault !== false };
    }

    var DEFINITIONS = {
        VENDOR: {
            repository: "vendors",
            entityType: "VENDOR",
            filters: ["Vendor", "Stage", "Status", "IsActive", "Classification", "ProcessingType", "Country", "Category", "RegistrationDateFrom", "RegistrationDateTo", "RecordDateFrom", "RecordDateTo"],
            columns: [column("VendorCode", "Vendor Code", "VendorCode"), column("VendorName", "Vendor Name", "VendorName"), column("Classification", "Classification", "VendorClassificationCode"), column("ProcessingType", "Processing Type", "VendorProcessingTypeCode"), column("Country", "Country", "Country"), column("Categories", "Categories", "Category", "multi"), column("Stage", "Stage", "StageCode"), column("Status", "Status", "StatusCode"), column("IsActive", "Is Active", "IsActive", "boolean"), column("RegistrationDate", "Registration Date", "RegistrationDate", "date"), column("RecordDate", "Record Date", "RecordDate", "date"), column("RequestedBy", "Requested By", "RequestedBy", "lookup", false), column("City", "City", "City", "lookup", false), column("PostalCode", "Postal Code", "PostalCode", "text", false), column("Address", "Address", "Address", "text", false), column("EvaluationResult", "Evaluation Result", "EvaluationResultCode", "text", false), column("InterviewResult", "Interview Result", "InterviewResultCode", "text", false), column("ExpiryDueDate", "Expiry Due Date", "ExpiryDueDate", "date", false)],
            sort: [{ field: "VendorName", direction: "ASC" }, { field: "ID", direction: "ASC" }]
        },
        PRPO: {
            repository: "prpo",
            entityType: "PR_PO",
            filters: ["PRNumber", "PONumber", "Vendor", "Stage", "Status", "Currency", "CreationDateFrom", "CreationDateTo", "WorkflowApprovalDateFrom", "WorkflowApprovalDateTo", "POCreationDateFrom", "POCreationDateTo"],
            columns: [column("PRNumber", "PR Number", "PRNumber"), column("Vendor", "Vendor", "Vendor"), column("PRAmount", "PR Amount", "PRAmount", "number"), column("Currency", "Currency", "Currency"), column("Stage", "Stage", "StageCode"), column("Status", "Status", "StatusCode"), column("CreationDate", "Creation Date", "CreationDate", "date"), column("WorkflowApprovalDate", "Workflow Approval Date", "WorkflowApprovalDate", "date"), column("PONumber", "PO Number", "PONumber"), column("POCreationDate", "PO Creation Date", "POCreationDate", "date"), column("VendorCodeSnapshot", "Vendor Code Snapshot", "VendorCodeSnapshot", "text", false), column("VendorNameSnapshot", "Vendor Name Snapshot", "VendorNameSnapshot", "text", false), column("Description", "Description", "Description", "text", false), column("WorkflowApproved", "Workflow Approved", "WorkflowApproved", "boolean", false)],
            sort: [{ field: "CreationDate", direction: "DESC" }, { field: "ID", direction: "DESC" }]
        },
        INVOICE: {
            repository: "invoices",
            entityType: "INVOICE",
            filters: ["InvoiceIdentifier", "InvoiceNumber", "SourceFunction", "Vendor", "Category", "Region", "DirectPayment", "AggregationBatchKey", "Stage", "Status", "Currency", "InvoiceInitiationDateFrom", "InvoiceInitiationDateTo", "ProcessingDateFrom", "ProcessingDateTo", "WorkflowApprovalDateFrom", "WorkflowApprovalDateTo", "SettlementDateFrom", "SettlementDateTo"],
            columns: [column("InvoiceIdentifier", "Invoice Identifier", "InvoiceIdentifier"), column("InvoiceNumber", "Supplier Invoice Number", "InvoiceNumber"), column("SourceFunction", "Source Function", "InvoiceSourceFunctionCode"), column("Vendor", "Vendor", "Vendor"), column("Category", "Category", "Category"), column("DirectPayment", "Direct Payment", "DirectPayment", "boolean"), column("FinalInvoiceAmount", "Final Invoice Amount", "FinalInvoiceAmount", "number"), column("Currency", "Currency", "Currency"), column("Stage", "Stage", "StageCode"), column("Status", "Status", "StatusCode"), column("InvoiceInitiationDate", "Invoice Initiation Date", "InvoiceInitiationDate", "date"), column("Region", "Region", "RegionCode", "text", false), column("FocalPoint", "Focal Point", "FocalPointName", "text", false), column("ManagedBy", "Managed By", "ManagedByCode", "text", false), column("ClassStartDate", "Class Start Date", "ClassStartDate", "date", false), column("ClassEndDate", "Class End Date", "ClassEndDate", "date", false), column("ClassCode1", "Class Code 1", "ClassCode1", "text", false), column("ClassCode2", "Class Code 2", "ClassCode2", "text", false), column("ClassCode3", "Class Code 3", "ClassCode3", "text", false), column("MEALearnerCount", "MEA Learner Count", "MEALearnerCount", "number", false), column("GlobalLearnerCount", "Global Learner Count", "GlobalLearnerCount", "number", false), column("StudentCount", "Student Count", "StudentCount", "number", false), column("AdvancePayment", "Advance Payment", "AdvancePayment", "boolean", false), column("PONumber", "PO Number", "PONumber", "text", false), column("POLineNumber", "PO Line Number", "POLineNumber", "text", false), column("CostCenter", "Cost Center", "CostCenter", "text", false), column("SESNumber", "SES Number", "SESNumber", "text", false), column("SESDate", "SES Date", "SESDate", "date", false), column("TotalPrice", "Total Price", "TotalPrice", "number", false), column("DiscountType", "Discount Type", "DiscountInputTypeCode", "text", false), column("DiscountInputValue", "Discount Input Value", "DiscountInputValue", "number", false), column("DiscountAmount", "Discount Amount", "DiscountAmount", "number", false), column("NetAmountBeforeVAT", "Net Amount Before VAT", "NetAmountBeforeVAT", "number", false), column("VATType", "VAT Type", "VATInputTypeCode", "text", false), column("VATInputValue", "VAT Input Value", "VATInputValue", "number", false), column("VATAmount", "VAT Amount", "VATAmount", "number", false), column("ConversionRateUsed", "Conversion Rate Used", "ConversionRateUsed", "number", false), column("TotalPriceInSAR", "Total Price in SAR", "TotalPriceInSAR", "number", false), column("VATAmountInSAR", "VAT Amount in SAR", "VATAmountInSAR", "number", false), column("FinalInvoiceAmountInSAR", "Final Invoice Amount in SAR", "FinalInvoiceAmountInSAR", "number", false), column("AggregationPeriod", "Aggregation Period", "AggregationPeriod", "text", false), column("AggregationBatchKey", "Aggregation Batch Key", "AggregationBatchKey", "text", false), column("ProcessingDate", "Processing Date", "ProcessingDate", "date", false), column("WorkflowApprovalDate", "Workflow Approval Date", "WorkflowApprovalDate", "date", false), column("ChargebackDate", "Chargeback Date", "ChargebackDate", "date", false), column("SettlementDate", "Settlement Date", "SettlementDate", "date", false)],
            sort: [{ field: "InvoiceInitiationDate", direction: "DESC" }, { field: "ID", direction: "DESC" }]
        },
        USERDB: {
            repository: "users",
            entityType: "USER",
            filters: ["Function", "Role", "IsActive", "AssignedCategory"],
            columns: [column("UserName", "User Name", "UserName"), column("Email", "Email", "Email"), column("Function", "Function", "FunctionCode"), column("Role", "Role", "RoleCode"), column("AssignedCategories", "Assigned Categories", "AssignedCategories", "multi"), column("IsActive", "Is Active", "IsActive", "boolean"), column("DirectPaymentAuthorization", "Direct Payment Authorization", "IsDirectPaymentAuthorized", "boolean")],
            sort: [{ field: "UserName", direction: "ASC" }, { field: "ID", direction: "ASC" }]
        },
        SURVEY_QUESTION: {
            repository: "surveyQuestions",
            entityType: "SURVEY_QUESTION",
            filters: ["Function", "SurveyVersion", "QuestionGroup", "QuestionType", "IsActive"],
            columns: [column("Function", "Function", "FunctionCode"), column("SurveyVersion", "Survey Version", "SurveyVersionCode"), column("QuestionCode", "Question Code", "QuestionCode"), column("QuestionGroup", "Question Group", "QuestionGroupCode"), column("QuestionText", "Question Text", "QuestionText"), column("QuestionType", "Question Type", "QuestionTypeCode"), column("ScoreScale", "Score Scale", "ScoreScaleCode"), column("DisplayOrder", "Display Order", "DisplayOrder", "number"), column("IsActive", "Is Active", "IsActive", "boolean")],
            sort: [{ field: "FunctionCode", direction: "ASC" }, { field: "SurveyVersionCode", direction: "ASC" }, { field: "DisplayOrder", direction: "ASC" }, { field: "ID", direction: "ASC" }]
        }
    };

    var FILTER_FIELDS = {
        Vendor: { field: "Vendor.id", op: "lookupId" }, Stage: { field: "StageCode", op: "eq" }, Status: { field: "StatusCode", op: "eq" }, IsActive: { field: "IsActive", op: "eq" }, Classification: { field: "VendorClassificationCode", op: "eq" }, ProcessingType: { field: "VendorProcessingTypeCode", op: "eq" }, Country: { field: "Country.id", op: "lookupId" }, Category: { field: "Category", op: "lookupAny", array: true }, RegistrationDateFrom: { field: "RegistrationDate", op: "gte" }, RegistrationDateTo: { field: "RegistrationDate", op: "lte" }, RecordDateFrom: { field: "RecordDate", op: "gte" }, RecordDateTo: { field: "RecordDate", op: "lte" },
        PRNumber: { field: "PRNumber", op: "contains" }, PONumber: { field: "PONumber", op: "contains" }, Currency: { field: "Currency.id", op: "lookupId" }, CreationDateFrom: { field: "CreationDate", op: "gte" }, CreationDateTo: { field: "CreationDate", op: "lte" }, WorkflowApprovalDateFrom: { field: "WorkflowApprovalDate", op: "gte" }, WorkflowApprovalDateTo: { field: "WorkflowApprovalDate", op: "lte" }, POCreationDateFrom: { field: "POCreationDate", op: "gte" }, POCreationDateTo: { field: "POCreationDate", op: "lte" },
        InvoiceIdentifier: { field: "InvoiceIdentifier", op: "contains" }, InvoiceNumber: { field: "InvoiceNumber", op: "contains" }, SourceFunction: { field: "InvoiceSourceFunctionCode", op: "eq" }, Region: { field: "RegionCode", op: "eq" }, DirectPayment: { field: "DirectPayment", op: "eq" }, AggregationBatchKey: { field: "AggregationBatchKey", op: "contains" }, InvoiceInitiationDateFrom: { field: "InvoiceInitiationDate", op: "gte" }, InvoiceInitiationDateTo: { field: "InvoiceInitiationDate", op: "lte" }, ProcessingDateFrom: { field: "ProcessingDate", op: "gte" }, ProcessingDateTo: { field: "ProcessingDate", op: "lte" }, SettlementDateFrom: { field: "SettlementDate", op: "gte" }, SettlementDateTo: { field: "SettlementDate", op: "lte" },
        Function: { field: "FunctionCode", op: "eq" }, Role: { field: "RoleCode", op: "eq" }, AssignedCategory: { field: "AssignedCategories", op: "lookupAny", array: true }, SurveyVersion: { field: "SurveyVersionCode", op: "eq" }, QuestionGroup: { field: "QuestionGroupCode", op: "eq" }, QuestionType: { field: "QuestionTypeCode", op: "eq" }
    };

    function filterMapping(source, code) {
        if (code === "Vendor") {
            return source === "VENDOR" ? { field: "ID", op: "eq" } : { field: "Vendor.id", op: "lookupId" };
        }
        if (code === "Category") {
            return source === "VENDOR" ? { field: "Category", op: "lookupAny", array: true } : { field: "Category.id", op: "lookupId" };
        }
        return FILTER_FIELDS[code];
    }

    function ReportService(repositories, accessService) {
        this.repositories = repositories;
        this.accessService = accessService;
    }

    ReportService.prototype._sources = function (user) {
        if ($.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) >= 0) { return ["VENDOR", "PRPO", "INVOICE", "USERDB", "SURVEY_QUESTION"]; }
        if ($.inArray(user.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0 && $.inArray(user.FunctionCode, ["EXCELLENCE", "VENDOR_MANAGEMENT"]) >= 0) { return ["VENDOR", "PRPO", "INVOICE"]; }
        return [];
    };

    ReportService.prototype.GetDefinition = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.REPORTS).then(function (user) {
            return $.map(self._sources(user), function (source) { var definition = DEFINITIONS[source]; return { source: source, filters: definition.filters.slice(0), columns: VMS.Utilities.clone(definition.columns), defaultColumns: $.map($.grep(definition.columns, function (item) { return item.isDefault; }), function (item) { return item.code; }) }; });
        });
    };

    ReportService.prototype._context = function (source, filters, selectedColumns) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.REPORTS).then(function (user) {
            var definition = DEFINITIONS[source];
            var allowedSources = self._sources(user);
            var allowedColumnCodes;
            var queryFilters = [];
            var columnMap = {};
            if (!definition || $.inArray(source, allowedSources) < 0) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "The selected report Source is not authorized."); }
            allowedColumnCodes = $.map(definition.columns, function (item) { columnMap[item.code] = item; return item.code; });
            selectedColumns = selectedColumns && selectedColumns.length ? selectedColumns : $.map($.grep(definition.columns, function (item) { return item.isDefault; }), function (item) { return item.code; });
            if ($.grep(selectedColumns, function (code) { return $.inArray(code, allowedColumnCodes) < 0; }).length || !selectedColumns.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select only authorized report columns."); }
            $.each(filters || [], function (_, filter) {
                var mapping;
                if ($.inArray(filter.code, definition.filters) < 0 || !filterMapping(source, filter.code)) { queryFilters.push(null); return; }
                mapping = filterMapping(source, filter.code);
                queryFilters.push({ field: mapping.field, op: mapping.op, value: mapping.array && !$.isArray(filter.value) ? [filter.value] : filter.value });
            });
            if ($.inArray(null, queryFilters) >= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "One or more report filters are not authorized for this Source."); }
            if (source === "INVOICE") {
                queryFilters.push({ field: "IsActive", op: "eq", value: true });
                queryFilters.push({ field: "BatchOperationStateCode", op: "neq", value: "PREPARED" });
                queryFilters.push({ field: "BatchOperationStateCode", op: "neq", value: "RECOVERY_REQUIRED" });
            }
            return self.accessService.GetScope(definition.entityType, "REPORT").then(function (scopeContext) { return { user: user, definition: definition, repository: self.repositories[definition.repository], queryFilters: queryFilters, columns: $.map(selectedColumns, function (code) { return columnMap[code]; }), scope: scopeContext.scope }; });
        });
    };

    ReportService.prototype.GetFilterOptions = function (source) {
        var self = this;
        return this._context(source, [], null).then(function (context) {
            var query = { filters: context.queryFilters, authorizationScope: context.scope, sort: context.definition.sort, maximumRows: 10000 };
            return H.queryAll(context.repository, query).then(function (rows) { return { context: context, rows: rows }; });
        }).then(function (value) {
            var values = {};
            var seen = {};
            function add(code, optionValue, label) {
                var key;
                if (optionValue === null || optionValue === undefined || optionValue === "") { return; }
                key = code + "|" + String(optionValue);
                if (!seen[key]) {
                    seen[key] = true;
                    values[code] = values[code] || [];
                    values[code].push({ value: optionValue, label: String(label === null || label === undefined || label === "" ? optionValue : label) });
                }
            }
            function addLookup(code, item) {
                if (item) { add(code, VMS.Utilities.lookupId(item), item.title || item.label || item.code); }
            }
            $.each(value.rows, function (_, row) {
                if (source === "VENDOR") { add("Vendor", row.ID, row.DisplayName || row.VendorName); } else { addLookup("Vendor", row.Vendor); }
                add("Stage", row.StageCode, row.StageCode);
                add("Status", row.StatusCode, row.StatusCode);
                if (row.IsActive !== undefined) { add("IsActive", row.IsActive === true ? "true" : "false", row.IsActive === true ? "Yes" : "No"); }
                add("Classification", row.VendorClassificationCode, row.VendorClassificationCode);
                add("ProcessingType", row.VendorProcessingTypeCode, row.VendorProcessingTypeCode);
                addLookup("Country", row.Country);
                $.each($.isArray(row.Category) ? row.Category : (row.Category ? [row.Category] : []), function (_, item) { addLookup("Category", item); });
                addLookup("Currency", row.Currency);
                add("SourceFunction", row.InvoiceSourceFunctionCode, row.InvoiceSourceFunctionCode);
                add("Region", row.RegionCode, row.RegionCode);
                if (row.DirectPayment !== undefined) { add("DirectPayment", row.DirectPayment === true ? "true" : "false", row.DirectPayment === true ? "Yes" : "No"); }
                add("Function", row.FunctionCode, row.FunctionCode);
                add("Role", row.RoleCode, row.RoleCode);
                $.each(row.AssignedCategories || [], function (_, item) { addLookup("AssignedCategory", item); });
                add("SurveyVersion", row.SurveyVersionCode, row.SurveyVersionCode);
                add("QuestionGroup", row.QuestionGroupCode, row.QuestionGroupCode);
                add("QuestionType", row.QuestionTypeCode, row.QuestionTypeCode);
            });
            $.each(values, function (_, options) { options.sort(function (left, right) { return left.label.localeCompare(right.label); }); });
            return { values: values, vendors: values.Vendor || [], categories: values.Category || [], currencies: values.Currency || [] };
        });
    };

    ReportService.prototype.Count = function (source, filters) {
        return this._context(source, filters, null).then(function (context) { return context.repository.count({ filters: context.queryFilters, authorizationScope: context.scope }); });
    };

    ReportService.prototype._protectText = function (value) {
        var text = value === null || value === undefined ? "" : String(value);
        var meaningful = text.replace(/^[\s\x00-\x1f]+/, "");
        return /^[=+\-@]/.test(meaningful) ? "'" + text : text;
    };

    ReportService.prototype._displayValue = function (row, item, lineMap) {
        var value = row[item.field];
        if (item.code === "PONumber" || item.code === "POLineNumber") {
            value = lineMap[VMS.Utilities.lookupId(row.POLine)] ? lineMap[VMS.Utilities.lookupId(row.POLine)][item.code] : "";
        }
        if (item.type === "number") { return value === null || value === undefined || value === "" ? null : Number(value); }
        if (item.type === "boolean") { return value === true ? "Yes" : "No"; }
        if (item.type === "date") { return value ? VMS.ClockService.formatRiyadh(value, false) : ""; }
        if (item.type === "multi") { return this._protectText($.map(value || [], function (lookup) { return lookup.title; }).join("; ")); }
        if (value && typeof value === "object") { value = value.title || value.email || ""; }
        return this._protectText(value);
    };

    ReportService.prototype.Export = function (source, filters, selectedColumns) {
        var self = this;
        var context;
        var rows;
        return this._context(source, filters, selectedColumns).then(function (value) {
            context = value;
            return context.repository.count({ filters: context.queryFilters, authorizationScope: context.scope });
        }).then(function (count) {
            if (count > 10000) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "This report contains more than 10,000 rows. Apply additional filters and export again."); }
            return H.queryAll(context.repository, { filters: context.queryFilters, authorizationScope: context.scope, sort: context.definition.sort });
        }).then(function (value) {
            rows = value;
            if (source === "INVOICE" && $.grep(context.columns, function (item) { return item.code === "PONumber" || item.code === "POLineNumber"; }).length) {
                var lineIds = VMS.Utilities.unique($.grep($.map(rows, function (row) { return VMS.Utilities.lookupId(row.POLine); }), function (id) { return id !== null; }));
                return lineIds.length ? H.queryAll(self.repositories.poLines, { filters: [{ field: "ID", op: "in", value: lineIds }], maximumRows: 10000 }) : [];
            }
            return [];
        }).then(function (lines) {
            var lineMap = {};
            var data = [];
            var generated = VMS.ClockService.utcNow();
            var formattedDate = VMS.ClockService.formatRiyadh(generated, false);
            var datePart = formattedDate.substring(0, 10).replace(/-/g, "") + "-" + formattedDate.substring(11, 16).replace(/:/g, "");
            var workbook;
            var parameters;
            $.each(lines, function (_, line) { lineMap[line.ID] = { PONumber: line.PONumber, POLineNumber: line.POLineNumber }; });
            $.each(rows, function (_, row) {
                var output = {};
                $.each(context.columns, function (_, item) { output[item.label] = self._displayValue(row, item, lineMap); });
                data.push(output);
            });
            parameters = [
                { Parameter: "Source", Value: source },
                { Parameter: "Generated At", Value: VMS.ClockService.formatRiyadh(generated, false) },
                { Parameter: "Timezone", Value: VMS.Config.APPLICATION_TIMEZONE },
                { Parameter: "Generated By", Value: context.user.UserName },
                { Parameter: "Selected Filters", Value: self._protectText(JSON.stringify(filters || [])) },
                { Parameter: "Selected Columns", Value: $.map(context.columns, function (item) { return item.label; }).join("; ") },
                { Parameter: "Exported Row Count", Value: rows.length }
            ];
            workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(data, { header: $.map(context.columns, function (item) { return item.label; }) }), "Data");
            window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(parameters), "Parameters");
            return { workbook: workbook, fileName: "VMS-" + source + "-" + datePart + ".xlsx", rowCount: rows.length };
        });
    };

    VMS.ReportService = ReportService;
}(window, window.jQuery));
