(function (VMS, $, window) {
    'use strict';
    var exportInProgress = false;
    function actor() { return VMS.Services.AccessService.GetCurrentUser(); }
    function denied(message) { return VMS.Utilities.failure('ACCESS_DENIED', message || 'Report source is not authorized.'); }
    function resolved(value) { return VMS.Utilities.resolved(value); }
    function isAdmin(user) { return user && $.inArray(user.RoleCode, ['ADMIN', 'SUPER_ADMIN']) >= 0; }
    function isReportEmployee(user) { return user && $.inArray(user.RoleCode, ['EMPLOYEE', 'CO_OP']) >= 0 && user.FunctionCode === 'EXCELLENCE'; }
    function authorizedSources(user) {
        if (isAdmin(user)) { return ['VENDOR', 'PRPO', 'INVOICE', 'USERDB', 'SURVEY_QUESTION']; }
        if (isReportEmployee(user)) { return ['VENDOR', 'PRPO', 'INVOICE']; }
        return [];
    }
    function column(code, label, field, type, group, dependency) { return { code: code, label: label, field: field || code, type: type || 'text', group: group || null, dependency: dependency || null }; }
    function filter(code, label, field, type, group) { return { code: code, label: label, field: field || code, type: type || 'text', group: group || null }; }
    var definitions = {
        VENDOR: {
            label: 'Vendor', repository: 'VendorRepository',
            filters: [filter('Vendor', 'Vendor', 'ID', 'lookup', 'VENDOR'), filter('Stage', 'Stage', 'StageCode', 'code', 'VENDOR_STAGE'), filter('Status', 'Status', 'StatusCode', 'code', 'VENDOR_STATUS'), filter('IsActive', 'Is Active', 'IsActive', 'boolean'), filter('Classification', 'Classification', 'VendorClassificationCode', 'code', 'VENDOR_CLASSIFICATION'), filter('ProcessingType', 'Processing Type', 'VendorProcessingTypeCode', 'code', 'VENDOR_PROCESSING_TYPE'), filter('Country', 'Country', 'Country', 'lookup', 'COUNTRY'), filter('Category', 'Category', 'Categories', 'multiLookup', 'CATEGORY'), filter('RegistrationDate', 'Registration Date', 'RegistrationDate', 'dateRange'), filter('RecordDate', 'Record Date', 'RecordDate', 'dateRange')],
            columns: [column('VendorCode', 'Vendor Code'), column('VendorName', 'Vendor Name'), column('Classification', 'Classification', 'VendorClassificationCode', 'code', 'VENDOR_CLASSIFICATION'), column('ProcessingType', 'Processing Type', 'VendorProcessingTypeCode', 'code', 'VENDOR_PROCESSING_TYPE'), column('Country', 'Country', 'Country', 'lookup', 'COUNTRY'), column('Categories', 'Categories', 'Categories', 'multiLookup', 'CATEGORY'), column('Stage', 'Stage', 'StageCode', 'code', 'VENDOR_STAGE'), column('Status', 'Status', 'StatusCode', 'code', 'VENDOR_STATUS'), column('IsActive', 'Is Active', 'IsActive', 'boolean'), column('RegistrationDate', 'Registration Date', 'RegistrationDate', 'dateTime'), column('RecordDate', 'Record Date', 'RecordDate', 'dateTime'), column('RequestedBy', 'Requested By', 'RequestedBy', 'lookup', 'USER'), column('City', 'City', 'City', 'lookup', 'CITY'), column('PostalCode', 'Postal Code'), column('Address', 'Address'), column('EvaluationResult', 'Evaluation Result', 'EvaluationResultCode', 'code', 'VENDOR_OPTION_RESULT'), column('InterviewResult', 'Interview Result', 'InterviewResultCode', 'code', 'VENDOR_OPTION_RESULT'), column('ExpiryDueDate', 'Expiry Due Date', 'ExpiryDueDate', 'dateTime')],
            defaults: ['VendorCode', 'VendorName', 'Classification', 'ProcessingType', 'Country', 'Categories', 'Stage', 'Status', 'IsActive', 'RegistrationDate', 'RecordDate'],
            sort: [{ field: 'VendorName', direction: 'asc' }, { field: 'ID', direction: 'asc' }]
        },
        PRPO: {
            label: 'PR/PO', repository: 'PRPORepository',
            filters: [filter('PRNumber', 'PR Number', 'PRNumber', 'text'), filter('PONumber', 'PO Number', 'PONumber', 'text'), filter('Vendor', 'Vendor', 'Vendor', 'lookup', 'VENDOR'), filter('Stage', 'Stage', 'StageCode', 'code', 'PR_PO_STAGE'), filter('Status', 'Status', 'StatusCode', 'code', 'PR_PO_STATUS'), filter('Currency', 'Currency', 'Currency', 'lookup', 'CURRENCY'), filter('CreationDate', 'Creation Date', 'CreationDate', 'dateRange'), filter('WorkflowApprovalDate', 'Workflow Approval Date', 'WorkflowApprovalDate', 'dateRange'), filter('POCreationDate', 'PO Creation Date', 'POCreationDate', 'dateRange')],
            columns: [column('PRNumber', 'PR Number'), column('Vendor', 'Vendor', 'Vendor', 'lookup', 'VENDOR'), column('PRAmount', 'PR Amount', 'PRAmount', 'number'), column('Currency', 'Currency', 'Currency', 'lookup', 'CURRENCY'), column('Stage', 'Stage', 'StageCode', 'code', 'PR_PO_STAGE'), column('Status', 'Status', 'StatusCode', 'code', 'PR_PO_STATUS'), column('CreationDate', 'Creation Date', 'CreationDate', 'dateTime'), column('WorkflowApprovalDate', 'Workflow Approval Date', 'WorkflowApprovalDate', 'dateTime'), column('PONumber', 'PO Number'), column('POCreationDate', 'PO Creation Date', 'POCreationDate', 'dateTime'), column('VendorCodeSnapshot', 'Vendor Code Snapshot'), column('VendorNameSnapshot', 'Vendor Name Snapshot'), column('Description', 'Description'), column('WorkflowApproved', 'Workflow Approved', 'WorkflowApproved', 'boolean')],
            defaults: ['PRNumber', 'Vendor', 'PRAmount', 'Currency', 'Stage', 'Status', 'CreationDate', 'WorkflowApprovalDate', 'PONumber', 'POCreationDate'],
            sort: [{ field: 'CreationDate', direction: 'desc' }, { field: 'ID', direction: 'desc' }]
        },
        INVOICE: {
            label: 'Invoice', repository: 'InvoiceRepository',
            filters: [filter('InvoiceIdentifier', 'Invoice Identifier', 'InvoiceIdentifier', 'text'), filter('SupplierInvoiceNumber', 'Supplier Invoice Number', 'InvoiceNumber', 'text'), filter('SourceFunction', 'Source Function', 'InvoiceSourceFunctionCode', 'code', 'FUNCTION'), filter('Vendor', 'Vendor', 'Vendor', 'lookup', 'VENDOR'), filter('Category', 'Category', 'Category', 'lookup', 'CATEGORY'), filter('Region', 'Region', 'RegionCode', 'code', 'REGION'), filter('DirectPayment', 'Direct Payment', 'DirectPayment', 'boolean'), filter('AggregationBatchKey', 'Aggregation Batch Key', 'AggregationBatchKey', 'text'), filter('Stage', 'Stage', 'StageCode', 'code', 'INVOICE_STAGE'), filter('Status', 'Status', 'StatusCode', 'code', 'INVOICE_STATUS'), filter('Currency', 'Currency', 'Currency', 'lookup', 'CURRENCY'), filter('InvoiceInitiationDate', 'Invoice Initiation Date', 'InvoiceInitiationDate', 'dateRange'), filter('ProcessingDate', 'Processing Date', 'ProcessingDate', 'dateRange'), filter('WorkflowApprovalDate', 'Workflow Approval Date', 'WorkflowApprovalDate', 'dateRange'), filter('SettlementDate', 'Settlement Date', 'SettlementDate', 'dateRange')],
            columns: [column('InvoiceIdentifier', 'Invoice Identifier'), column('SupplierInvoiceNumber', 'Supplier Invoice Number', 'InvoiceNumber'), column('SourceFunction', 'Source Function', 'InvoiceSourceFunctionCode', 'code', 'FUNCTION'), column('Vendor', 'Vendor', 'Vendor', 'lookup', 'VENDOR'), column('Category', 'Category', 'Category', 'lookup', 'CATEGORY'), column('DirectPayment', 'Direct Payment', 'DirectPayment', 'boolean'), column('FinalInvoiceAmount', 'Final Invoice Amount', 'FinalInvoiceAmount', 'number'), column('Currency', 'Currency', 'Currency', 'lookup', 'CURRENCY'), column('Stage', 'Stage', 'StageCode', 'code', 'INVOICE_STAGE'), column('Status', 'Status', 'StatusCode', 'code', 'INVOICE_STATUS'), column('InvoiceInitiationDate', 'Invoice Initiation Date', 'InvoiceInitiationDate', 'dateTime'), column('Region', 'Region', 'RegionCode', 'code', 'REGION'), column('FocalPoint', 'Focal Point', 'FocalPointName'), column('ManagedBy', 'Managed By', 'ManagedByCode', 'code', 'INVOICE_MANAGED_BY'), column('ClassStartDate', 'Class Start Date', 'ClassStartDate', 'dateOnly'), column('ClassEndDate', 'Class End Date', 'ClassEndDate', 'dateOnly'), column('ClassCode1', 'Class Code 1'), column('ClassCode2', 'Class Code 2'), column('ClassCode3', 'Class Code 3'), column('MEALearnerCount', 'MEA Learner Count', 'MEALearnerCount', 'number'), column('GlobalLearnerCount', 'Global Learner Count', 'GlobalLearnerCount', 'number'), column('StudentCount', 'Student Count', 'StudentCount', 'number'), column('AdvancePayment', 'Advance Payment', 'AdvancePayment', 'boolean'), column('PONumber', 'PO Number', 'POLine', 'computed', null, 'PO'), column('POLineNumber', 'PO Line Number', 'POLineKeySnapshot'), column('CostCenter', 'Cost Center'), column('SESNumber', 'SES Number'), column('SESDate', 'SES Date', 'SESDate', 'dateOnly'), column('TotalPrice', 'Total Price', 'TotalPrice', 'number'), column('DiscountType', 'Discount Type', 'DiscountInputTypeCode', 'code', 'FINANCIAL_INPUT_TYPE'), column('DiscountInputValue', 'Discount Input Value', 'DiscountInputValue', 'number'), column('DiscountAmount', 'Discount Amount', 'DiscountAmount', 'number'), column('NetAmountBeforeVAT', 'Net Amount Before VAT', 'NetAmountBeforeVAT', 'number'), column('VATType', 'VAT Type', 'VATInputTypeCode', 'code', 'FINANCIAL_INPUT_TYPE'), column('VATInputValue', 'VAT Input Value', 'VATInputValue', 'number'), column('VATAmount', 'VAT Amount', 'VATAmount', 'number'), column('ConversionRateUsed', 'Conversion Rate Used', 'ConversionRateUsed', 'number'), column('TotalPriceInSAR', 'Total Price in SAR', 'TotalPriceInSAR', 'number'), column('VATAmountInSAR', 'VAT Amount in SAR', 'VATAmountInSAR', 'number'), column('FinalInvoiceAmountInSAR', 'Final Invoice Amount in SAR', 'FinalInvoiceAmountInSAR', 'number'), column('AggregationPeriod', 'Aggregation Period'), column('AggregationBatchKey', 'Aggregation Batch Key'), column('ProcessingDate', 'Processing Date', 'ProcessingDate', 'dateTime'), column('WorkflowApprovalDate', 'Workflow Approval Date', 'WorkflowApprovalDate', 'dateTime'), column('ChargebackDate', 'Chargeback Date', 'ChargebackDate', 'dateTime'), column('SettlementDate', 'Settlement Date', 'SettlementDate', 'dateTime')],
            defaults: ['InvoiceIdentifier', 'SupplierInvoiceNumber', 'SourceFunction', 'Vendor', 'Category', 'DirectPayment', 'FinalInvoiceAmount', 'Currency', 'Stage', 'Status', 'InvoiceInitiationDate'],
            sort: [{ field: 'InvoiceInitiationDate', direction: 'desc' }, { field: 'ID', direction: 'desc' }]
        },
        USERDB: {
            label: 'UserDB', repository: 'UserRepository',
            filters: [filter('Function', 'Function', 'FunctionCode', 'code', 'FUNCTION'), filter('Role', 'Role', 'RoleCode', 'code', 'USER_ROLE'), filter('IsActive', 'Is Active', 'IsActive', 'boolean'), filter('AssignedCategory', 'Assigned Category', 'AssignedCategories', 'multiLookup', 'CATEGORY')],
            columns: [column('UserName', 'User Name'), column('Email', 'Email'), column('Function', 'Function', 'FunctionCode', 'code', 'FUNCTION'), column('Role', 'Role', 'RoleCode', 'code', 'USER_ROLE'), column('AssignedCategories', 'Assigned Categories', 'AssignedCategories', 'multiLookup', 'CATEGORY'), column('IsActive', 'Is Active', 'IsActive', 'boolean'), column('DirectPaymentAuthorization', 'Direct Payment Authorization', 'IsDirectPaymentAuthorized', 'boolean')],
            defaults: ['UserName', 'Email', 'Function', 'Role', 'AssignedCategories', 'IsActive', 'DirectPaymentAuthorization'],
            sort: [{ field: 'UserName', direction: 'asc' }, { field: 'ID', direction: 'asc' }]
        },
        SURVEY_QUESTION: {
            label: 'Survey Questions', repository: 'SurveyQuestionRepository',
            filters: [filter('Function', 'Function', 'FunctionCode', 'code', 'FUNCTION'), filter('SurveyVersion', 'Survey Version', 'SurveyVersionCode', 'code', 'SURVEY_VERSION'), filter('QuestionGroup', 'Question Group', 'QuestionGroupCode', 'code', 'QUESTION_GROUP'), filter('QuestionType', 'Question Type', 'QuestionTypeCode', 'code', 'SURVEY_QUESTION_TYPE'), filter('IsActive', 'Is Active', 'IsActive', 'boolean')],
            columns: [column('Function', 'Function', 'FunctionCode', 'code', 'FUNCTION'), column('SurveyVersion', 'Survey Version', 'SurveyVersionCode', 'code', 'SURVEY_VERSION'), column('QuestionCode', 'Question Code'), column('QuestionGroup', 'Question Group', 'QuestionGroupCode', 'code', 'QUESTION_GROUP'), column('QuestionText', 'Question Text'), column('QuestionType', 'Question Type', 'QuestionTypeCode', 'code', 'SURVEY_QUESTION_TYPE'), column('ScoreScale', 'Score Scale', 'ScoreScaleCode', 'code', 'VENDOR_FEEDBACK_SCALE'), column('DisplayOrder', 'Display Order', 'DisplayOrder', 'number'), column('IsActive', 'Is Active', 'IsActive', 'boolean')],
            defaults: ['Function', 'SurveyVersion', 'QuestionCode', 'QuestionGroup', 'QuestionText', 'QuestionType', 'ScoreScale', 'DisplayOrder', 'IsActive'],
            sort: [{ field: 'FunctionCode', direction: 'asc' }, { field: 'SurveyVersionCode', direction: 'asc' }, { field: 'DisplayOrder', direction: 'asc' }, { field: 'ID', direction: 'asc' }]
        }
    };
    function definition(source, user) { return $.inArray(source, authorizedSources(user || actor())) >= 0 ? definitions[source] : null; }
    function publicDefinition(source, def) { return { source: source, label: def.label, filters: VMS.Utilities.clone(def.filters), columns: VMS.Utilities.clone(def.columns), defaultColumns: def.defaults.slice(0) }; }
    function findByCode(items, code) { var found = null; $.each(items, function (_, item) { if (item.code === code) { found = item; return false; } }); return found; }
    function normalizeFilters(def, values) {
        var normalized = [], seen = {}, errors = [], list = $.isArray(values) ? values : [];
        $.each(list, function (_, item) {
            var meta = item && findByCode(def.filters, item.code), value = item && item.value;
            if (!meta || seen[item.code]) { errors.push({ field: 'Filters', message: 'A report filter is not allowed.' }); return; }
            seen[item.code] = true;
            if (meta.type === 'dateRange') {
                value = value || {};
                if ((value.from && !/^\d{4}-\d{2}-\d{2}$/.test(value.from)) || (value.to && !/^\d{4}-\d{2}-\d{2}$/.test(value.to)) || (value.from && value.to && value.from > value.to)) { errors.push({ field: item.code, message: meta.label + ' range is invalid.' }); return; }
                if (!value.from && !value.to) { return; }
                normalized.push({ code: item.code, value: { from: value.from || '', to: value.to || '' } }); return;
            }
            if (meta.type === 'boolean') { if (value !== true && value !== false) { errors.push({ field: item.code, message: meta.label + ' is invalid.' }); return; } normalized.push({ code: item.code, value: value }); return; }
            if (meta.type === 'lookup' || meta.type === 'multiLookup') { value = Number(value); if (!isFinite(value) || value <= 0 || Math.floor(value) !== value) { errors.push({ field: item.code, message: meta.label + ' is invalid.' }); return; } normalized.push({ code: item.code, value: value }); return; }
            value = $.trim(String(value === null || value === undefined ? '' : value));
            if (!value) { return; }
            normalized.push({ code: item.code, value: value });
        });
        return { filters: normalized, errors: errors };
    }
    function riyadhBoundary(value, end) { return new Date(value + (end ? 'T23:59:59.999+03:00' : 'T00:00:00+03:00')).toISOString(); }
    function providerFilters(source, def, filters, user, excludedCode) {
        var output = [{ field: 'StatusCode', operator: 'ne', value: 'RECOVERY_REQUIRED' }, { field: 'StageCode', operator: 'ne', value: 'RECOVERY_REQUIRED' }];
        if (source === 'USERDB' || source === 'SURVEY_QUESTION') { output = []; }
        if (source === 'INVOICE' && user.FunctionCode === 'VENDOR_MANAGEMENT' && !isAdmin(user)) { output.push({ field: 'Category', operator: 'in', value: VMS.Utilities.lookupIds(user.AssignedCategories || []) }); }
        $.each(filters, function (_, item) {
            var meta = findByCode(def.filters, item.code), value = item.value;
            if (item.code === excludedCode) { return; }
            if (meta.type === 'text') { output.push({ field: meta.field, operator: 'contains', value: value }); }
            else if (meta.type === 'multiLookup') { output.push({ field: meta.field, operator: 'containsValue', value: value }); }
            else if (meta.type === 'dateRange') { if (value.from) { output.push({ field: meta.field, operator: 'gte', value: riyadhBoundary(value.from, false) }); } if (value.to) { output.push({ field: meta.field, operator: 'lte', value: riyadhBoundary(value.to, true) }); } }
            else { output.push({ field: meta.field, operator: 'eq', value: value }); }
        });
        return output;
    }
    function requiredFields(def, columns, includeFilters) {
        var fields = { ID: true }, output = [];
        $.each(def.sort, function (_, item) { fields[item.field] = true; });
        $.each(columns || [], function (_, code) { var meta = findByCode(def.columns, code); if (meta) { fields[meta.field] = true; if (meta.dependency === 'PO') { fields.POLine = true; fields.POLineKeySnapshot = true; } } });
        $.each(includeFilters || [], function (_, item) { var meta = findByCode(def.filters, item.code); if (meta) { fields[meta.field] = true; } });
        $.each(fields, function (field) { output.push(field); });
        return output;
    }
    function queryAll(repository, spec, maxRows) {
        var d = $.Deferred(), rows = [], nextSpec = $.extend({}, spec), maximum = maxRows || Number.MAX_VALUE;
        function next(token) { nextSpec.continuationToken = token || null; repository.query(nextSpec).then(function (result) { var page = result && result.items ? result : null; if (!page) { d.resolve(result && result.ok === false ? result : VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Report data could not be loaded.')); return; } rows = rows.concat(page.items); if (rows.length >= maximum || !page.continuationToken) { d.resolve({ items: rows.slice(0, maximum), continuationToken: page.continuationToken }); return; } next(page.continuationToken); }); }
        next(null); return d.promise();
    }
    function reportSpec(source, def, filters, user, select) { var datasets = { VENDOR: 'ML_vendor', PRPO: 'PR_PO', INVOICE: 'Invoice', USERDB: 'userDB', SURVEY_QUESTION: 'SurveyQuestions' }; return { filters: providerFilters(source, def, filters, user), sort: def.sort, select: select, pageSize: 500, authorizationScope: VMS.AuthorizationScope.build(datasets[source], user, 'report') }; }
    function lookupLabel(group, value, maps) {
        if (value === null || value === undefined || value === '') { return ''; }
        if (group === 'VENDOR') { return maps.vendor[VMS.Utilities.lookupId(value)] || VMS.Utilities.lookupLabel(value) || ''; }
        if (group === 'CATEGORY') { return maps.category[VMS.Utilities.lookupId(value)] || VMS.Utilities.lookupLabel(value) || ''; }
        if (group === 'COUNTRY') { return maps.country[VMS.Utilities.lookupId(value)] || VMS.Utilities.lookupLabel(value) || ''; }
        if (group === 'CITY') { return maps.city[VMS.Utilities.lookupId(value)] || VMS.Utilities.lookupLabel(value) || ''; }
        if (group === 'CURRENCY') { return maps.currency[VMS.Utilities.lookupId(value)] || VMS.Utilities.lookupLabel(value) || ''; }
        if (group === 'USER') { return maps.user[VMS.Utilities.lookupId(value)] || VMS.Utilities.lookupLabel(value) || ''; }
        return VMS.Services.DisplayLabelService.Resolve(value, group);
    }
    function lookupNeeds(items) {
        var needs = {};
        $.each(items || [], function (_, meta) { if (meta && meta.group && $.inArray(meta.type, ['lookup', 'multiLookup']) >= 0) { needs[meta.group] = true; } if (meta && meta.dependency === 'PO') { needs.PO = true; } });
        return needs;
    }
    function loadMaps(needs) {
        var calls = [], loaders = [], maps = { vendor: {}, category: {}, country: {}, city: {}, currency: {}, user: {}, poLine: {}, poHeader: {} };
        function add(group, repository, fields, target, labelField) { if (!needs[group]) { return; } calls.push(repository.query({ select: fields, pageSize: 1000 })); loaders.push(function (result) { $.each(result.items || [], function (_, row) { target[row.ID] = row[labelField] || ''; }); }); }
        add('CATEGORY', VMS.Repositories.CategoryRepository, ['ID', 'DisplayLabel'], maps.category, 'DisplayLabel');
        add('COUNTRY', VMS.Repositories.CountryRepository, ['ID', 'CountryName'], maps.country, 'CountryName');
        add('CITY', VMS.Repositories.CityRepository, ['ID', 'CityName'], maps.city, 'CityName');
        add('CURRENCY', VMS.Repositories.CurrencyRepository, ['ID', 'CurrencyCode'], maps.currency, 'CurrencyCode');
        add('USER', VMS.Repositories.UserRepository, ['ID', 'UserName'], maps.user, 'UserName');
        return $.when.apply($, calls).then(function () { var args = arguments; $.each(loaders, function (index, loader) { loader(args[index]); }); return maps; });
    }
    function optionValue(meta, raw, maps) { return { value: $.inArray(meta.type, ['lookup', 'multiLookup']) >= 0 ? VMS.Utilities.lookupId(raw) : raw, label: meta.type === 'boolean' ? (raw ? 'Yes' : 'No') : (meta.type === 'code' ? VMS.Services.DisplayLabelService.Resolve(raw, meta.group) : lookupLabel(meta.group, raw, maps)) }; }
    function optionRows(source, def, filters, user, targetCode) {
        var meta = findByCode(def.filters, targetCode), repository = VMS.Repositories[def.repository], select = requiredFields(def, [], filters); select.push(meta.field);
        return queryAll(repository, { filters: providerFilters(source, def, filters, user, targetCode), sort: def.sort, select: select, pageSize: 1000, authorizationScope: { actorUserKey: user.UserKey, source: source } });
    }
    function buildOptions(source, def, filters, user, onlyCodes) {
        var targets = $.grep(def.filters, function (meta) { return $.inArray(meta.type, ['lookup', 'multiLookup', 'code', 'boolean']) >= 0 && (!onlyCodes || $.inArray(meta.code, onlyCodes) >= 0); }), calls = $.map(targets, function (meta) { return optionRows(source, def, filters, user, meta.code); });
        return $.when.apply($, calls.concat([loadMaps(lookupNeeds(targets))])).then(function () {
            var args = arguments, maps = args[args.length - 1], options = {};
            $.each(targets, function (index, meta) {
                var seen = {}, values = [];
                $.each(args[index].items || [], function (_, row) { var raw = row[meta.field], list = $.isArray(raw) ? raw : [raw]; $.each(list, function (__, value) { var canonical = $.inArray(meta.type, ['lookup', 'multiLookup']) >= 0 ? VMS.Utilities.lookupId(value) : value, key = typeof canonical + ':' + canonical, approvedSourceFunction = source !== 'INVOICE' || meta.code !== 'SourceFunction' || $.inArray(value, ['EXECUTION', 'EDUCATION_PROGRAM']) >= 0; if (approvedSourceFunction && canonical !== null && canonical !== undefined && canonical !== '' && !seen[key]) { seen[key] = true; values.push(optionValue(meta, value, maps)); } }); });
                values.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); }); options[meta.code] = values;
            });
            return options;
        });
    }
    function validateScopedValues(source, def, filters, user) {
        var controlled = $.grep(filters, function (item) { var meta = findByCode(def.filters, item.code); return meta && $.inArray(meta.type, ['lookup', 'multiLookup', 'code', 'boolean']) >= 0; }), codes = $.map(controlled, function (item) { return item.code; });
        if (!codes.length) { return resolved(VMS.Utilities.success(filters)); }
        return buildOptions(source, def, filters, user, codes).then(function (options) {
            var errors = [];
            $.each(controlled, function (_, item) { var allowed = false; $.each(options[item.code] || [], function (__, option) { if (String(option.value) === String(item.value)) { allowed = true; } }); if (!allowed) { errors.push({ field: item.code, message: 'The selected ' + findByCode(def.filters, item.code).label + ' is outside the authorized report scope.' }); } });
            return errors.length ? VMS.Utilities.failure('ACCESS_DENIED', 'A report filter value is not authorized.', errors) : VMS.Utilities.success(filters);
        });
    }
    function prepare(input, user) {
        var source = input && input.source, def = definition(source, user), normalized;
        if (!def) { return resolved(denied()); }
        normalized = normalizeFilters(def, input.filters || []);
        if (normalized.errors.length) { return resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'Report filters are invalid.', normalized.errors)); }
        return validateScopedValues(source, def, normalized.filters, user).then(function (valid) { return valid.ok ? VMS.Utilities.success({ source: source, definition: def, filters: normalized.filters, user: user }) : valid; });
    }
    function validateColumns(def, requested) {
        var selected = requested && requested.length ? requested.slice(0) : def.defaults.slice(0), seen = {}, invalid = false;
        $.each(selected, function (_, code) { if (seen[code] || !findByCode(def.columns, code)) { invalid = true; } seen[code] = true; });
        return invalid || !selected.length ? null : selected;
    }
    function riyadhDateTime(value) {
        if (!value) { return ''; }
        var date = value instanceof Date ? value : new Date(value), shifted;
        if (isNaN(date.getTime())) { return String(value); }
        shifted = new Date(date.getTime() + 180 * 60000);
        return shifted.getUTCFullYear() + '-' + ('0' + (shifted.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + shifted.getUTCDate()).slice(-2) + ' ' + ('0' + shifted.getUTCHours()).slice(-2) + ':' + ('0' + shifted.getUTCMinutes()).slice(-2);
    }
    function dateOnly(value) { return value ? String(value).substring(0, 10) : ''; }
    function neutralText(value) { var text = value === null || value === undefined ? '' : String(value); return /^[\s\x00-\x1f\x7f-\x9f]*[=+\-@]/.test(text) ? "'" + text : text; }
    function projectedValue(row, meta, maps) {
        var value = row[meta.field], line, header;
        if (meta.dependency === 'PO') { line = maps.poLine[VMS.Utilities.lookupId(row.POLine)]; header = line && maps.poHeader[VMS.Utilities.lookupId(line.POHeader)]; value = header || VMS.Utilities.lookupLabel(row.POLine) || String(row.POLineKeySnapshot || '').replace(/-\d+$/, ''); }
        if (meta.type === 'number') { return value === null || value === undefined || value === '' ? null : Number(value); }
        if (meta.type === 'boolean') { return value === true ? 'Yes' : (value === false ? 'No' : ''); }
        if (meta.type === 'dateTime') { return riyadhDateTime(value); }
        if (meta.type === 'dateOnly') { return dateOnly(value); }
        if (meta.type === 'lookup') { return neutralText(lookupLabel(meta.group, value, maps)); }
        if (meta.type === 'multiLookup') { return neutralText($.map(value || [], function (id) { return lookupLabel(meta.group, id, maps); }).join('; ')); }
        if (meta.type === 'code') { return neutralText(VMS.Services.DisplayLabelService.Resolve(value, meta.group)); }
        return neutralText(value);
    }
    function projectRows(rows, def, selected, maps) {
        return $.map(rows, function (row) { var output = {}; $.each(selected, function (_, code) { var meta = findByCode(def.columns, code); output[meta.label] = projectedValue(row, meta, maps); }); return output; });
    }
    function filterDisplay(def, item, maps) {
        var meta = findByCode(def.filters, item.code), value = item.value;
        if (meta.type === 'dateRange') { return (value.from || 'Any') + ' to ' + (value.to || 'Any'); }
        if (meta.type === 'boolean') { return value ? 'Yes' : 'No'; }
        if (meta.type === 'lookup' || meta.type === 'multiLookup') { return lookupLabel(meta.group, value, maps); }
        if (meta.type === 'code') { return VMS.Services.DisplayLabelService.Resolve(value, meta.group); }
        return value;
    }
    function workbookFor(source, def, selected, filters, rows, maps, user, now) {
        var headings = $.map(selected, function (code) { return findByCode(def.columns, code).label; }), projected = projectRows(rows, def, selected, maps), generated = riyadhDateTime(now), parameters = [['Parameter', 'Value'], ['Source', source], ['Generated At', generated], ['Timezone', VMS.Constants.TIMEZONE], ['Generated By', neutralText(user.UserName)]];
        parameters.push(['Selected Filters', filters.length ? neutralText($.map(filters, function (item) { return findByCode(def.filters, item.code).label + ': ' + filterDisplay(def, item, maps); }).join('; ')) : 'None']);
        $.each(filters, function (_, item) { parameters.push(['Filter: ' + findByCode(def.filters, item.code).label, neutralText(filterDisplay(def, item, maps))]); });
        parameters.push(['Selected Columns', neutralText(headings.join('; '))]); parameters.push(['Exported Row Count', rows.length]);
        var book = window.XLSX.utils.book_new(), dataSheet = projected.length ? window.XLSX.utils.json_to_sheet(projected, { header: headings }) : window.XLSX.utils.aoa_to_sheet([headings]), parameterSheet = window.XLSX.utils.aoa_to_sheet(parameters);
        dataSheet['!cols'] = $.map(headings, function (heading) { var width = Math.max(12, Math.min(32, String(heading).length + 3)); $.each(projected, function (_, row) { width = Math.max(width, Math.min(32, String(row[heading] === null || row[heading] === undefined ? '' : row[heading]).length + 2)); }); return { wch: width }; });
        parameterSheet['!cols'] = [{ wch: 24 }, { wch: 90 }];
        window.XLSX.utils.book_append_sheet(book, dataSheet, 'Data'); window.XLSX.utils.book_append_sheet(book, parameterSheet, 'Parameters');
        return { workbook: book, rows: projected, parameters: parameters };
    }
    function fileName(source, now) { var stamp = riyadhDateTime(now).replace(/-/g, '').replace(' ', '-').replace(':', ''); return 'VMS-' + source + '-' + stamp + '.xlsx'; }
    VMS.Services.ReportService = {
        GetSources: function () { var user = actor(), sources = authorizedSources(user); return resolved(sources.length ? VMS.Utilities.success($.map(sources, function (source) { return { code: source, label: definitions[source].label }; })) : denied('Reports are not authorized.')); },
        GetDefinition: function (source) { var def = definition(source, actor()); return resolved(def ? VMS.Utilities.success(publicDefinition(source, def)) : denied()); },
        GetFilterOptions: function (input) {
            input = typeof input === 'string' ? { source: input, filters: [] } : (input || {});
            return prepare(input, actor()).then(function (ready) { if (!ready.ok) { return ready; } return buildOptions(ready.data.source, ready.data.definition, ready.data.filters, ready.data.user).then(function (options) { return VMS.Utilities.success({ source: ready.data.source, options: options }); }); });
        },
        Count: function (input) { return prepare(input || {}, actor()).then(function (ready) { if (!ready.ok) { return ready; } var data = ready.data; return VMS.Repositories[data.definition.repository].count(reportSpec(data.source, data.definition, data.filters, data.user, ['ID'])).then(function (count) { return typeof count === 'number' ? VMS.Utilities.success({ count: count, overLimit: count > VMS.Constants.REPORT_LIMIT }) : count; }); }); },
        Query: function (input) {
            return prepare(input || {}, actor()).then(function (ready) { var selected, data, selectedMeta; if (!ready.ok) { return ready; } data = ready.data; selected = validateColumns(data.definition, input.columns); if (!selected) { return denied('A report column is not authorized.'); } selectedMeta = $.map(selected, function (code) { return findByCode(data.definition.columns, code); }); return $.when(queryAll(VMS.Repositories[data.definition.repository], reportSpec(data.source, data.definition, data.filters, data.user, requiredFields(data.definition, selected, data.filters)), input.limit || 10001), loadMaps(lookupNeeds(selectedMeta))).then(function (rows, maps) { if (rows.ok === false) { return rows; } return VMS.Utilities.success({ items: projectRows(rows.items, data.definition, selected, maps), rawItems: rows.items, columns: selected }); }); });
        },
        Export: function (input) {
            input = input || {};
            if ($.isArray(input.columns) && !input.columns.length) { return resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'Select at least one column to export.')); }
            if (exportInProgress) { return resolved(VMS.Utilities.failure('UNSUPPORTED_OPERATION', 'An export is already being generated.')); }
            exportInProgress = true;
            return VMS.Services.AccessService.ResolveCurrentUser().then(function (identity) {
                if (!identity.ok) { return denied('Reports are no longer authorized.'); }
                return prepare(input, identity.data).then(function (ready) {
                    var selected, data, selectedMeta;
                    if (!ready.ok) { return ready; }
                    data = ready.data; selected = validateColumns(data.definition, input.columns);
                    if (!selected) { return denied('A report column is not authorized.'); }
                    selectedMeta = $.map(selected, function (code) { return findByCode(data.definition.columns, code); });
                    return VMS.Repositories[data.definition.repository].count(reportSpec(data.source, data.definition, data.filters, data.user, ['ID'])).then(function (count) {
                        if (typeof count !== 'number') { return count; }
                        if (count > VMS.Constants.REPORT_LIMIT) { return VMS.Utilities.failure('VALIDATION_FAILED', 'This report contains more than 10,000 rows. Apply additional filters and export again.'); }
                        return $.when(queryAll(VMS.Repositories[data.definition.repository], reportSpec(data.source, data.definition, data.filters, data.user, requiredFields(data.definition, selected, data.filters)), VMS.Constants.REPORT_LIMIT + 1), loadMaps(lookupNeeds(selectedMeta))).then(function (rows, maps) {
                            var now, built, name;
                            if (rows.ok === false) { return rows; }
                            if (rows.items.length > VMS.Constants.REPORT_LIMIT) { return VMS.Utilities.failure('VALIDATION_FAILED', 'This report contains more than 10,000 rows. Apply additional filters and export again.'); }
                            if (!window.XLSX || !window.XLSX.utils) { return VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The local Excel export library is unavailable.'); }
                            now = VMS.Services.ClockService.Now(); built = workbookFor(data.source, data.definition, selected, data.filters, rows.items, maps, data.user, now); name = fileName(data.source, now);
                            if (input.download !== false) { window.XLSX.writeFile(built.workbook, name); }
                            return VMS.Utilities.success({ rowCount: rows.items.length, fileName: name, workbook: built.workbook, projectedRows: built.rows, parameters: built.parameters });
                        });
                    });
                });
            }).then(function (result) { exportInProgress = false; return result; }, function () { exportInProgress = false; return VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The report could not be generated.'); });
        },
        NeutralizeText: neutralText
    };
}(window.VMS, window.jQuery, window));
