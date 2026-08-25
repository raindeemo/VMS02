(function (VMS, $) {
    'use strict';

    var legacyVendorService = VMS.Services.VendorService;
    function user() { return VMS.Services.AccessService.GetCurrentUser(); }
    function admin() { return user() && $.inArray(user().RoleCode, ['ADMIN', 'SUPER_ADMIN']) >= 0; }
    function vmOperator() { return user() && user().FunctionCode === 'VENDOR_MANAGEMENT' && $.inArray(user().RoleCode, ['MANAGER', 'EMPLOYEE', 'CO_OP']) >= 0; }
    function denied() { return VMS.Utilities.resolved(VMS.Utilities.failure('ACCESS_DENIED', 'This Vendor action is not authorized.')); }
    function stale(saved) { return saved && saved.error ? VMS.Utilities.failure('STALE_RECORD', 'The Vendor changed. Refresh before continuing.') : VMS.Utilities.success(saved); }
    function trim(value) { return $.trim(String(value || '')); }
    function normalizedName(value) { return trim(value).replace(/\s+/g, ' ').toLowerCase(); }
    function allowedField(source, field) { return source && Object.prototype.hasOwnProperty.call(source, field); }
    function setting(code) { return VMS.Repositories.ConfigurationRepository.getByKey('SYSTEM_SETTING-' + code); }
    function mutate(context, work, notification) { return VMS.Services.BusinessActionService.Execute(context, work, notification); }
    function syncVendorAttachments(id, desired) { var d = $.Deferred(), existing = [], remove = [], add = [], index = 0; VMS.Services.AttachmentService.ListAttachments('ML_vendor', id).then(function (listed) { if (!listed.ok) { d.resolve(listed); return; } existing = listed.data; $.each(existing, function (_, item) { if (!$.grep(desired || [], function (wanted) { return VMS.Utilities.normalize(wanted.name) === VMS.Utilities.normalize(item.name); }).length) { remove.push(item.name); } }); $.each(desired || [], function (_, item) { if (!$.grep(existing, function (current) { return VMS.Utilities.normalize(current.name) === VMS.Utilities.normalize(item.name); }).length) { add.push(item); } }); function removeNext() { if (index >= remove.length) { index = 0; addNext(); return; } VMS.Services.AttachmentService.DeleteAttachment('ML_vendor', id, remove[index++]).then(function (result) { if (!result.ok) { d.resolve(result); return; } removeNext(); }); } function addNext() { if (index >= add.length) { VMS.Repositories.VendorRepository.getById(id).then(function (row) { VMS.Services.AttachmentService.ListAttachments('ML_vendor', id).then(function (items) { if (!items.ok) { d.resolve(items); return; } row.attachments = items.data; d.resolve(VMS.Utilities.success(row)); }); }); return; } VMS.Services.AttachmentService.AddAttachment('ML_vendor', id, add[index++]).then(function (result) { if (!result.ok) { d.resolve(result); return; } addNext(); }); } removeNext(); }); return d.promise(); }
    function idempotent(actionRequestId, operation) { if (!actionRequestId) { return operation(); } return VMS.Services.AuditService.GetByActionRequestId(actionRequestId).then(function (history) { var saved; if (!history) { return operation(); } if (history.ResultCode === 'SUCCESS') { try { saved = JSON.parse(history.RecoveryContextJSON || '{}').result; } catch (ignore) { saved = null; } var repeated = VMS.Utilities.success(saved); repeated.actionRequestId = actionRequestId; return repeated; } return VMS.Utilities.failure(history.ResultCode === 'PREPARED' ? 'ACTION_OUTCOME_UNCERTAIN' : 'UNSUPPORTED_OPERATION', history.ResultCode === 'PREPARED' ? 'The action outcome requires reconciliation.' : 'This action request is already finalized.'); }); }
    function canonicalEmails(value, errors) {
        var raw = String(value || ''), parts = raw.split(';'), seen = {}, output = [];
        if (!trim(raw)) { errors.push({ field: 'Email', code: 'VALIDATION_FAILED', message: 'Email is required.' }); return ''; }
        $.each(parts, function (_, part) {
            var email = trim(part), key = email.toLowerCase();
            if (!email) { errors.push({ field: 'Email', code: 'VALIDATION_FAILED', message: 'Email contains a blank address.' }); return; }
            if (!/^[^\s@;]+@[^\s@;]+\.[^\s@;]+$/.test(email)) { errors.push({ field: 'Email', code: 'VALIDATION_FAILED', message: 'Each business email address must be valid.' }); return; }
            if (!seen[key]) { seen[key] = true; output.push(email); }
        });
        return output.join(';');
    }
    function canonicalPhone(value, country, errors) {
        var raw = trim(value), normalized;
        if (!raw) { errors.push({ field: 'PhoneNumber', code: 'VALIDATION_FAILED', message: 'Phone Number is required.' }); return ''; }
        if (/[^\d+\s().-]/.test(raw) || (raw.match(/\+/g) || []).length > 1 || (raw.indexOf('+') >= 0 && raw.search(/\d/) >= 0 && raw.indexOf('+') > raw.search(/\d/))) { errors.push({ field: 'PhoneNumber', code: 'VALIDATION_FAILED', message: 'Phone Number contains unsupported characters or extension text.' }); return ''; }
        normalized = '+' + raw.replace(/\D/g, '');
        if (!/^\+\d{7,15}$/.test(normalized)) { errors.push({ field: 'PhoneNumber', code: 'VALIDATION_FAILED', message: 'Phone Number must contain 7 to 15 digits.' }); }
        if (country && normalized.indexOf(country.PhoneCode) !== 0) { errors.push({ field: 'PhoneNumber', code: 'VALIDATION_FAILED', message: 'Phone Number must begin with the selected Country phone code.' }); }
        return normalized;
    }
    function uniqueIds(values, field, errors) {
        var seen = {}, output = [];
        $.each(values || [], function (_, value) { var id = VMS.Utilities.lookupId(value); if (!id || Math.floor(id) !== id || seen[id]) { errors.push({ field: field, code: 'VALIDATION_FAILED', message: 'Categories must contain unique valid selections.' }); } else { seen[id] = true; output.push(id); } });
        if (!output.length) { errors.push({ field: field, code: 'VALIDATION_FAILED', message: 'At least one Category is required.' }); }
        return output;
    }
    function masterCandidate(source) {
        return {
            VendorName: trim(source.VendorName).replace(/\s+/g, ' '), Email: source.Email, Country: VMS.Utilities.lookupId(source.Country), City: VMS.Utilities.lookupId(source.City), PhoneNumber: source.PhoneNumber,
            PostalCode: trim(source.PostalCode), RequestedBy: VMS.Utilities.personEmail(source.RequestedBy) || trim(source.RequestedBy), Address: trim(source.Address), Categories: source.Categories || [],
            VendorProcessingTypeCode: trim(source.VendorProcessingTypeCode).toUpperCase(), VendorClassificationCode: trim(source.VendorClassificationCode).toUpperCase()
        };
    }
    function validateMaster(source, id) {
        var candidate = masterCandidate(source || {}), errors = [], categoryIds;
        if (!candidate.VendorName) { errors.push({ field: 'VendorName', code: 'VALIDATION_FAILED', message: 'Vendor Name is required.' }); }
        if (!candidate.Country) { errors.push({ field: 'Country', code: 'VALIDATION_FAILED', message: 'Country is required.' }); }
        if (!candidate.City) { errors.push({ field: 'City', code: 'VALIDATION_FAILED', message: 'City is required.' }); }
        if (!candidate.Address) { errors.push({ field: 'Address', code: 'VALIDATION_FAILED', message: 'Address is required.' }); }
        candidate.Email = canonicalEmails(candidate.Email, errors);
        categoryIds = uniqueIds(candidate.Categories, 'Categories', errors); candidate.Categories = categoryIds;
        if ($.inArray(candidate.VendorProcessingTypeCode, ['STANDARD', 'DIRECT']) < 0) { errors.push({ field: 'VendorProcessingTypeCode', code: 'VALIDATION_FAILED', message: 'Processing Type is invalid.' }); }
        if (!candidate.VendorClassificationCode) { errors.push({ field: 'VendorClassificationCode', code: 'VALIDATION_FAILED', message: 'Classification is required.' }); }
        return $.when(
            VMS.Repositories.CountryRepository.getById(candidate.Country), VMS.Repositories.CityRepository.getById(candidate.City),
            VMS.Repositories.CategoryRepository.query({ filters: [{ field: 'ID', operator: 'in', value: categoryIds }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 1000 }),
            VMS.Repositories.ConfigurationRepository.getByKey('VENDOR_CLASSIFICATION-' + candidate.VendorClassificationCode),
            VMS.Repositories.ConfigurationRepository.getByKey('VENDOR_PROCESSING_TYPE-' + candidate.VendorProcessingTypeCode),
            VMS.Repositories.VendorRepository.query({ filters: [{ field: 'VendorName', operator: 'contains', value: candidate.VendorName }], pageSize: 50, select: ['ID', 'VendorName'] }),
            candidate.RequestedBy ? VMS.Repositories.UserRepository.getByKey(VMS.Utilities.normalize(candidate.RequestedBy)) : VMS.Utilities.resolved(null)
        ).then(function (country, city, categories, classification, processing, vendors, requested) {
            var duplicate = false;
            if (!country || !country.IsActive) { errors.push({ field: 'Country', code: 'VALIDATION_FAILED', message: 'Country must be active.' }); }
            candidate.PhoneNumber = canonicalPhone(candidate.PhoneNumber, country, errors);
            if (!city || !city.IsActive || VMS.Utilities.lookupId(city.Country) !== candidate.Country) { errors.push({ field: 'City', code: 'VALIDATION_FAILED', message: 'City must be active and belong to the selected Country.' }); }
            if (categories.items.length !== categoryIds.length) { errors.push({ field: 'Categories', code: 'VALIDATION_FAILED', message: 'Every Category must be active.' }); }
            if (!classification || !classification.IsActive || classification.GroupCode !== 'VENDOR_CLASSIFICATION') { errors.push({ field: 'VendorClassificationCode', code: 'VALIDATION_FAILED', message: 'Classification must be an active configured option.' }); }
            if (!processing || !processing.IsActive || processing.GroupCode !== 'VENDOR_PROCESSING_TYPE') { errors.push({ field: 'VendorProcessingTypeCode', code: 'VALIDATION_FAILED', message: 'Processing Type must be an active configured option.' }); }
            $.each(vendors.items, function (_, row) { if (row.ID !== Number(id) && normalizedName(row.VendorName) === normalizedName(candidate.VendorName)) { duplicate = true; } });
            if (duplicate) { errors.push({ field: 'VendorName', code: 'DUPLICATE_KEY', message: 'Vendor Name already exists.' }); }
            if (candidate.RequestedBy && (!requested || !requested.IsActive)) { errors.push({ field: 'RequestedBy', code: 'VALIDATION_FAILED', message: 'Requested By must be an active authorized Person.' }); }
            candidate.RequestedBy = requested ? requested.Email : '';
            return errors.length ? VMS.Utilities.failure('VALIDATION_FAILED', 'Vendor details are invalid.', errors) : VMS.Utilities.success(candidate);
        });
    }
    function destinationForResult(result) {
        if (!result || !result.ok || !result.data) { return VMS.Utilities.resolved(result); }
        var record = result.data;
        return (record.StatusCode === 'IN_PROGRESS' ? VMS.Services.DestinationResolverService.ResolveActionDestination('VENDOR', record) : VMS.Services.DestinationResolverService.ResolveEntityDestination('VENDOR', record)).then(function (destination) { if (destination.ok) { result.destination = destination.data; } return result; });
    }
    function authorizeVendor(record) { return VMS.Services.AccessService.AuthorizeRecord('VENDOR', record, 'READ'); }
    function authorizedVendors() {
        return VMS.Repositories.VendorRepository.query({ authorizationScope: VMS.AuthorizationScope.build('ML_vendor', user(), 'read'), sort: [{ field: 'Modified', direction: 'desc' }, { field: 'ID', direction: 'desc' }], pageSize: 500 }).then(function (data) {
            var d = $.Deferred(), output = [], index = 0;
            function next() { if (index >= data.items.length) { d.resolve(output); return; } var row = data.items[index++]; authorizeVendor(row).then(function (auth) { if (auth.ok) { output.push(row); } next(); }); }
            next(); return d.promise();
        });
    }
    function formOptions() {
        return $.when(
            VMS.Services.CountryService.Query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'CountryName', direction: 'asc' }], pageSize: 1000 }),
            VMS.Services.CityService.Query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'CityName', direction: 'asc' }], pageSize: 1000 }),
            VMS.Services.CategoryService.Query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'DisplayLabel', direction: 'asc' }], pageSize: 1000 }),
            VMS.Services.ConfigurationService.Query({ filters: [{ field: 'GroupCode', operator: 'in', value: ['VENDOR_CLASSIFICATION', 'VENDOR_PROCESSING_TYPE'] }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'SortOrder', direction: 'asc' }], pageSize: 1000 }),
            VMS.Repositories.UserRepository.query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'UserName', direction: 'asc' }], pageSize: 1000 })
        ).then(function (countries, cities, categories, configuration, users) {
            return VMS.Utilities.success({ countries: countries.data.items, cities: cities.data.items, categories: categories.data.items, configuration: configuration.data.items, people: $.map(users.items, function (row) { return { ID: row.ID, UserName: row.UserName, Email: row.Email }; }) });
        });
    }
    function enrichRows(rows, options) {
        var countries = {}, categories = {};
        $.each(options.countries, function (_, row) { countries[row.ID] = row; });
        $.each(options.categories, function (_, row) { categories[row.ID] = row; });
        $.each(rows, function (_, row) {
            row.CountryLabel = countries[row.Country] ? countries[row.Country].CountryName : '';
            row.CategoriesLabels = $.map(row.Categories || [], function (id) { return categories[id] ? categories[id].DisplayLabel : null; });
            row.CategoriesLabel = row.CategoriesLabels.join(', ');
            row.ClassificationLabel = VMS.Services.DisplayLabelService.Resolve(row.VendorClassificationCode, 'VENDOR_CLASSIFICATION');
            row.UpdatedLabel = VMS.Utilities.formatRegisterDate(row.Modified || row.RecordDate || row.DocumentEvaluationDate || row.RegistrationDate);
        });
        return rows;
    }
    function decorateActions(rows) {
        var d = $.Deferred(), index = 0;
        function next() {
            if (index >= rows.length) { d.resolve(rows); return; }
            var row = rows[index++], actions = [], finalState = $.inArray(row.StageCode, ['APPROVED', 'REJECTED', 'EXPIRED']) >= 0;
            row.Actions = actions;
            VMS.Services.DestinationResolverService.ResolveActionDestination('VENDOR', row).then(function (operational) {
                if (operational.ok) { actions.push({ label: 'Action', style: 'primary', destination: operational.data }); }
                return finalState ? VMS.Services.DestinationResolverService.ResolveEntityDestination('VENDOR', row) : VMS.Utilities.resolved(VMS.Utilities.failure('INVALID_STAGE', 'Profile is not available.'));
            }).then(function (view) {
                if (view.ok) { actions.push({ label: 'View', style: 'secondary', destination: view.data }); }
                return VMS.Services.DestinationResolverService.ResolveActionDestination('VENDOR', row, 'VENDOR_ADMIN');
            }).then(function (edit) { if (edit.ok) { actions.push({ label: 'Edit', style: 'secondary', destination: edit.data }); } next(); });
        }
        next(); return d.promise();
    }
    function validPair(stage, status) { return (stage === 'DOCUMENT_EVALUATION' && status === 'IN_PROGRESS') || (stage === 'INTERVIEW' && status === 'IN_PROGRESS') || (stage === 'APPROVED' && status === 'APPROVED') || (stage === 'REJECTED' && status === 'REJECTED') || (stage === 'EXPIRED' && status === 'EXPIRED'); }
    function safeChanges(before, after) { var output = {}; $.each(after, function (field, value) { if (JSON.stringify(before[field]) !== JSON.stringify(value)) { output[field] = { before: before[field], after: value }; } }); return output; }
    function validateAdminWorkflow(row, pair) {
        var parts = String(pair || (row.StageCode + '|' + row.StatusCode)).split('|'), stage = parts[0], status = parts[1];
        if (!validPair(stage, status)) { return VMS.Utilities.failure('VALIDATION_FAILED', 'The selected workflow state is invalid.', [{ field: 'WorkflowPair', message: 'Select a valid Stage and Status pair.' }]); }
        if (row.StatusCode === 'IN_PROGRESS' && (stage !== row.StageCode || status !== row.StatusCode)) { return VMS.Utilities.failure('INVALID_STAGE', 'In-progress lifecycle work must use the ordinary Vendor workflow.'); }
        if (row.StatusCode !== 'IN_PROGRESS' && status === 'IN_PROGRESS') { return VMS.Utilities.failure('INVALID_STAGE', 'A final Vendor cannot be reopened through Vendor Edit.'); }
        if (stage === 'APPROVED' && (row.EvaluationResultCode !== 'PASSED' || row.InterviewResultCode !== 'PASSED' || !row.VendorCode)) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Approved state requires completed passing onboarding and a Vendor Code.'); }
        if (stage === 'REJECTED' && row.EvaluationResultCode !== 'FAILED' && row.InterviewResultCode !== 'FAILED') { return VMS.Utilities.failure('VALIDATION_FAILED', 'Rejected state requires a failed onboarding decision.'); }
        return VMS.Utilities.success({ StageCode: stage, StatusCode: status });
    }
    function blockers(row) {
        return $.when(
            VMS.Repositories.PRPORepository.query({ filters: [{ field: 'Vendor', operator: 'eq', value: row.ID }, { field: 'StatusCode', operator: 'eq', value: 'IN_PROGRESS' }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 500, select: ['ID'] }),
            VMS.Repositories.InvoiceRepository.count({ filters: [{ field: 'Vendor', operator: 'eq', value: row.ID }, { field: 'StatusCode', operator: 'ne', value: 'SETTLED' }, { field: 'IsActive', operator: 'eq', value: true }] }),
            VMS.Repositories.FeedbackAssignmentRepository.count({ filters: [{ field: 'Vendor', operator: 'eq', value: row.ID }, { field: 'AssignmentStatusCode', operator: 'eq', value: 'OPEN' }, { field: 'IsActive', operator: 'eq', value: true }] }),
            setting('DIRECT_PAYMENT_VENDOR_CODE')
        ).then(function (prs, invoices, feedback, dpSetting) {
            var headerIds = $.map(prs.items, function (pr) { return pr.ID; });
            if (invoices || feedback || VMS.Utilities.normalize(row.VendorCode) === VMS.Utilities.normalize(dpSetting && dpSetting.TextValue)) { return true; }
            if (!headerIds.length) { return false; }
            return VMS.Repositories.POLineRepository.count({ filters: [{ field: 'POHeader', operator: 'in', value: headerIds }, { field: 'LineRequestStageCode', operator: 'eq', value: 'ACTIVE' }, { field: 'LineRequestStatusCode', operator: 'eq', value: 'APPROVED' }, { field: 'RemainingBalance', operator: 'gt', value: 0 }, { field: 'IsActive', operator: 'eq', value: true }, { field: 'IsCancelled', operator: 'eq', value: false }] }).then(function (lines) { return lines > 0; });
        });
    }
    VMS.Services.VendorService = {
        Create: function (model, actionRequestId) {
            if (!vmOperator() && !admin()) { return denied(); }
            return idempotent(actionRequestId, function () {
            if (model && model.attachments && model.attachments.length) { return VMS.Utilities.resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'Attachments are added during Documentation and Evaluation.', [{ field: 'attachments', message: 'Add Vendor does not accept attachments.' }])); }
            return validateMaster(model).then(function (validated) {
                if (!validated.ok) { return validated; }
                return setting('VENDOR_DOCUMENT_EXPIRY_DAYS').then(function (expiry) {
                    var next = validated.data, days = Number(expiry && expiry.NumericValue), now = VMS.Services.ClockService.Now(), due = new Date(now.getTime() + days * 86400000), reminder = new Date(due.getTime() - 15 * 86400000);
                    next.StageCode = 'DOCUMENT_EVALUATION'; next.StatusCode = 'IN_PROGRESS'; next.EvaluationResultCode = 'PENDING'; next.InterviewResultCode = 'PENDING'; next.RejectionReason = ''; next.DisplayName = next.VendorName; next.VendorCode = null; next.VendorCodeNormalizedKey = null; next.VendorExpiryDaysSnapshot = days; next.RegistrationDate = now.toISOString(); next.ExpiryReminderDate = reminder.toISOString(); next.ExpiryReminderSentDate = null; next.ExpiryDueDate = due.toISOString(); next.DocumentEvaluationDate = null; next.RecordDate = null; next.IsActive = true; next.attachments = [];
                    return mutate({ actionRequestId: actionRequestId, entityType: 'VENDOR', actionCode: 'CREATE', businessKey: next.VendorName, countsAsCompletedAction: true }, function () { return VMS.Repositories.VendorRepository.create(next).then(function (saved) { return VMS.Utilities.success(saved); }); }, { eventCode: 'VENDOR_CREATED', to: next.Email.split(';'), cc: [user().Email, next.RequestedBy], businessKey: next.VendorName }).then(destinationForResult);
                });
            }); });
        },
        UpdateOnboarding: legacyVendorService.UpdateOnboarding,
        Evaluate: function (id, decision, reason, retainedAttachments, etag, actionRequestId) {
            if (!vmOperator() && !admin()) { return denied(); }
            return idempotent(actionRequestId, function () {
            return VMS.Repositories.VendorRepository.getById(id).then(function (row) {
                var normalizedDecision = trim(decision).toUpperCase(), retained = VMS.Utilities.clone(retainedAttachments || []), patch;
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                return authorizeVendor(row).then(function (recordAuth) {
                    if (!recordAuth.ok) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                    if (row.StageCode !== 'DOCUMENT_EVALUATION' || row.StatusCode !== 'IN_PROGRESS') { return VMS.Utilities.failure('INVALID_STAGE', 'Vendor is not awaiting Documentation and Evaluation.'); }
                    if ($.inArray(normalizedDecision, ['PASSED', 'FAILED']) < 0) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Evaluation Decision is required.', [{ field: 'EvaluationDecision', message: 'Select Pass or Fail.' }]); }
                    if (normalizedDecision === 'FAILED' && !trim(reason)) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Failure Reason is required.', [{ field: 'RejectionReason', message: 'Failure Reason is required for Fail.' }]); }
                    return VMS.Repositories.VendorRepository.getById(id).then(function (authoritativeRow) {
                        var attachmentCheck;
                        if (!authoritativeRow || authoritativeRow.StageCode !== 'DOCUMENT_EVALUATION' || authoritativeRow.StatusCode !== 'IN_PROGRESS') { return VMS.Utilities.failure('INVALID_STAGE', 'Vendor is not awaiting Documentation and Evaluation.'); }
                        attachmentCheck = VMS.Services.AttachmentService.Validate(retained, 'VENDOR', normalizedDecision === 'PASSED');
                        if (!attachmentCheck.ok) {
                            if (normalizedDecision === 'PASSED' && !retained.length) { return VMS.Utilities.failure('ATTACHMENT_INVALID', 'Evaluation requires a retained document.', [{ field: 'attachments', message: 'At least one valid document is required to pass Evaluation.' }]); }
                            return attachmentCheck;
                        }
                        patch = { EvaluationResultCode: normalizedDecision, DocumentEvaluationDate: VMS.Services.ClockService.Now().toISOString(), StageCode: normalizedDecision === 'PASSED' ? 'INTERVIEW' : 'REJECTED', StatusCode: normalizedDecision === 'PASSED' ? 'IN_PROGRESS' : 'REJECTED', RejectionReason: normalizedDecision === 'FAILED' ? trim(reason) : '', RecordDate: normalizedDecision === 'FAILED' ? VMS.Services.ClockService.Now().toISOString() : null };
                        return mutate({ actionRequestId: actionRequestId, entityType: 'VENDOR', entityId: authoritativeRow.ID, businessKey: 'VND-' + authoritativeRow.ID, actionCode: 'EVALUATE', fromStage: authoritativeRow.StageCode, fromStatus: authoritativeRow.StatusCode, toStage: patch.StageCode, toStatus: patch.StatusCode, comment: patch.RejectionReason, countsAsCompletedAction: true }, function () { return syncVendorAttachments(authoritativeRow.ID, retained).then(function (synced) { if (!synced.ok) { return synced; } return VMS.Repositories.VendorRepository.update(authoritativeRow.ID, patch, synced.data._etag).then(function (saved) { if (!saved || saved.error) { return stale(saved); } saved.attachments = synced.data.attachments; return VMS.Utilities.success(saved); }); }); }, { eventCode: normalizedDecision === 'PASSED' ? 'EVALUATION_PASSED' : 'VENDOR_REJECTED', to: normalizedDecision === 'FAILED' ? authoritativeRow.Email.split(';') : [], cc: [authoritativeRow.RequestedBy], businessKey: authoritativeRow.VendorName }).then(destinationForResult);
                    });
                });
            }); });
        },
        Interview: function (id, decision, vendorCode, reason, etag, actionRequestId) {
            if (!vmOperator() && !admin()) { return denied(); }
            return idempotent(actionRequestId, function () {
            return VMS.Repositories.VendorRepository.getById(id).then(function (row) {
                var normalizedDecision = trim(decision).toUpperCase(), code = trim(vendorCode).toUpperCase();
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                return authorizeVendor(row).then(function (recordAuth) {
                    if (!recordAuth.ok) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                    if (row.StageCode !== 'INTERVIEW' || row.StatusCode !== 'IN_PROGRESS') { return VMS.Utilities.failure('INVALID_STAGE', 'Vendor is not awaiting Interview.'); }
                    if ($.inArray(normalizedDecision, ['PASSED', 'FAILED']) < 0) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Interview Decision is required.', [{ field: 'InterviewDecision', message: 'Select Pass or Fail.' }]); }
                    if (normalizedDecision === 'PASSED' && !code) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Vendor Code is required.', [{ field: 'VendorCode', message: 'Vendor Code is required for Pass.' }]); }
                    if (normalizedDecision === 'PASSED' && !/^[A-Z0-9][A-Z0-9._-]{1,49}$/.test(code)) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Vendor Code is invalid.', [{ field: 'VendorCode', message: 'Use 2 to 50 letters, numbers, dots, underscores, or hyphens.' }]); }
                    if (normalizedDecision === 'FAILED' && !trim(reason)) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Failure Reason is required.', [{ field: 'RejectionReason', message: 'Failure Reason is required for Fail.' }]); }
                    return VMS.Repositories.VendorRepository.getByKey(VMS.Utilities.normalize(code)).then(function (existing) {
                        var patch;
                        if (normalizedDecision === 'PASSED' && existing && existing.ID !== row.ID) { return VMS.Utilities.failure('DUPLICATE_KEY', 'Vendor Code already exists.', [{ field: 'VendorCode', message: 'Vendor Code must be globally unique.' }]); }
                        patch = { InterviewResultCode: normalizedDecision, StageCode: normalizedDecision === 'PASSED' ? 'APPROVED' : 'REJECTED', StatusCode: normalizedDecision === 'PASSED' ? 'APPROVED' : 'REJECTED', VendorCode: normalizedDecision === 'PASSED' ? code : null, VendorCodeNormalizedKey: normalizedDecision === 'PASSED' ? VMS.Utilities.normalize(code) : null, DisplayName: normalizedDecision === 'PASSED' ? row.VendorName + ' (' + code + ')' : row.VendorName, RecordDate: VMS.Services.ClockService.Now().toISOString(), RejectionReason: normalizedDecision === 'FAILED' ? trim(reason) : '' };
                        return mutate({ actionRequestId: actionRequestId, entityType: 'VENDOR', entityId: row.ID, businessKey: 'VND-' + row.ID, actionCode: 'INTERVIEW', fromStage: row.StageCode, fromStatus: row.StatusCode, toStage: patch.StageCode, toStatus: patch.StatusCode, comment: patch.RejectionReason, countsAsCompletedAction: true }, function () { return VMS.Repositories.VendorRepository.update(row.ID, patch, etag).then(stale); }, { eventCode: normalizedDecision === 'PASSED' ? 'VENDOR_APPROVED' : 'VENDOR_REJECTED', to: row.Email.split(';'), cc: [row.RequestedBy], businessKey: row.VendorName }).then(destinationForResult);
                    });
                });
            }); });
        },
        GetProfile: function (id, key) {
            return VMS.Repositories.VendorRepository.getById(id).then(function (row) {
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                return authorizeVendor(row).then(function (authorization) {
                    if (!authorization.ok) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                    if (key !== 'VND-' + row.ID) { return VMS.Utilities.failure('INVALID_LINK', 'The requested Vendor link is invalid.'); }
                    if ($.inArray(row.StageCode, ['APPROVED', 'REJECTED', 'EXPIRED']) < 0 || row.StageCode !== row.StatusCode) { return VMS.Utilities.failure('INVALID_STAGE', 'Vendor Profile is available only for a final Vendor state.'); }
                    return VMS.Utilities.success(row);
                });
            });
        },
        GetProfileContext: function (id, key) { return VMS.Services.Pass1EReadService ? VMS.Services.Pass1EReadService.GetVendorProfileContext(id, key) : VMS.Utilities.resolved(VMS.Utilities.failure('CONFIGURATION_MISSING', 'The authorized Vendor Profile read service is unavailable.')); },
        GetFormOptions: formOptions,
        GetRecordForAction: function (id) { return VMS.Repositories.VendorRepository.getById(id).then(function (row) { if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); } return authorizeVendor(row).then(function (auth) { return auth.ok ? VMS.Utilities.success(row) : VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }); }); },
        AdminUpdate: function (id, patch, reason, etag, actionRequestId) {
            if (!admin()) { return denied(); }
            return idempotent(actionRequestId, function () {
            if (!trim(reason)) { return VMS.Utilities.resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'Administrative Reason is required.', [{ field: 'AdministrativeReason', message: 'Administrative Reason is required.' }])); }
            return VMS.Repositories.VendorRepository.getById(id).then(function (row) {
                var merged, workflow;
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                if (row._etag !== etag) { return VMS.Utilities.failure('STALE_RECORD', 'The Vendor changed. Refresh before continuing.'); }
                workflow = validateAdminWorkflow(row, patch.WorkflowPair);
                if (!workflow.ok) { return workflow; }
                merged = $.extend({}, row, patch); delete merged.WorkflowPair; merged.StageCode = workflow.data.StageCode; merged.StatusCode = workflow.data.StatusCode; merged.VendorCode = row.VendorCode; merged.VendorCodeNormalizedKey = row.VendorCodeNormalizedKey; merged.IsActive = row.IsActive;
                if (allowedField(patch, 'attachments') && row.StageCode === 'DOCUMENT_EVALUATION' && row.StatusCode === 'IN_PROGRESS') { return VMS.Utilities.failure('INVALID_STAGE', 'Documents for this state are managed through Documentation and Evaluation.'); }
                if (allowedField(patch, 'attachments') && row.StatusCode !== 'IN_PROGRESS') { var attachmentCheck = VMS.Services.AttachmentService.Validate(patch.attachments, 'VENDOR', row.EvaluationResultCode === 'PASSED'); if (!attachmentCheck.ok) { return row.EvaluationResultCode === 'PASSED' && !(patch.attachments || []).length ? VMS.Utilities.failure('ATTACHMENT_INVALID', 'A passed Evaluation must retain a document.', [{ field: 'attachments', message: 'At least one valid onboarding document must be retained because Evaluation passed.' }]) : attachmentCheck; } }
                return validateMaster(merged, row.ID).then(function (validated) {
                    var update, changed, attachmentDesired = allowedField(patch, 'attachments') && row.StatusCode !== 'IN_PROGRESS' ? VMS.Utilities.clone(patch.attachments) : null;
                    if (!validated.ok) { return validated; }
                    update = $.extend({}, validated.data, workflow.data, { DisplayName: row.VendorCode ? validated.data.VendorName + ' (' + row.VendorCode + ')' : validated.data.VendorName });
                    changed = safeChanges(row, update);
                    return setting('DIRECT_PAYMENT_VENDOR_CODE').then(function (dpSetting) {
                        if (VMS.Utilities.normalize(row.VendorCode) === VMS.Utilities.normalize(dpSetting && dpSetting.TextValue) && update.VendorProcessingTypeCode !== 'DIRECT') { return VMS.Utilities.failure('VALIDATION_FAILED', 'The configured Direct Payment Vendor must remain Direct.'); }
                        return mutate({ actionRequestId: actionRequestId, entityType: 'VENDOR', entityId: row.ID, businessKey: 'VND-' + row.ID, actionCode: 'ADMIN_UPDATE', comment: trim(reason), changedFields: changed, countsAsCompletedAction: false }, function () { var ready = attachmentDesired ? syncVendorAttachments(row.ID, attachmentDesired) : VMS.Utilities.resolved(VMS.Utilities.success(row)); return ready.then(function (synced) { if (!synced.ok) { return synced; } return VMS.Repositories.VendorRepository.update(row.ID, update, synced.data._etag).then(function (saved) { if (!saved || saved.error) { return stale(saved); } saved.attachments = synced.data.attachments || row.attachments || []; return VMS.Utilities.success(saved); }); }); }).then(destinationForResult);
                    });
                });
            }); });
        },
        SetActive: function (id, active, reason, etag, actionRequestId) {
            if (!admin()) { return denied(); }
            return idempotent(actionRequestId, function () {
            if (!trim(reason)) { return VMS.Utilities.resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'Administrative Reason is required.', [{ field: 'AdministrativeReason', message: 'Administrative Reason is required.' }])); }
            return VMS.Repositories.VendorRepository.getById(id).then(function (row) {
                if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The Vendor was not found or is not authorized.'); }
                if (row.StageCode !== 'APPROVED' || row.StatusCode !== 'APPROVED') { return VMS.Utilities.failure('INVALID_STAGE', 'Only an Approved Vendor may be activated or deactivated.'); }
                if (!!active === !!row.IsActive) { return VMS.Utilities.failure('VALIDATION_FAILED', 'The Vendor already has the requested active state.'); }
                return (active ? validateMaster(row, row.ID).then(function (valid) { return !valid.ok; }) : blockers(row)).then(function (blocked) {
                    if (blocked) { return VMS.Utilities.failure('VALIDATION_FAILED', active ? 'Vendor master data is not eligible for reactivation.' : 'Vendor deactivation is blocked by an active dependency.'); }
                    return mutate({ actionRequestId: actionRequestId, entityType: 'VENDOR', entityId: row.ID, businessKey: 'VND-' + row.ID, actionCode: active ? 'ACTIVATE' : 'DEACTIVATE', comment: trim(reason), changedFields: { IsActive: { before: row.IsActive, after: !!active } }, countsAsCompletedAction: false }, function () { return VMS.Repositories.VendorRepository.update(row.ID, { IsActive: !!active }, etag).then(stale); }).then(destinationForResult);
                });
            }); });
        },
        GetListSummary: function (options) { return authorizedVendors().then(function (items) { var out = { TotalVendors: items.length, InProgress: 0, Approved: 0, Expired: 0, Rejected: 0 }; $.each(items, function (_, row) { if (row.StatusCode === 'IN_PROGRESS') { out.InProgress += 1; } else if (row.StatusCode === 'APPROVED') { out.Approved += 1; } else if (row.StatusCode === 'EXPIRED') { out.Expired += 1; } else if (row.StatusCode === 'REJECTED') { out.Rejected += 1; } }); if (!options || options.includeItems !== false) { out.items = items; } return VMS.Utilities.success(out); }); },
        GetRegisterFilterOptions: function () { return $.when(authorizedVendors(), formOptions()).then(function (vendors, options) { var categoryIds = {}, stages = {}, statuses = {}; $.each(vendors, function (_, row) { stages[row.StageCode] = true; statuses[row.StatusCode] = true; $.each(row.Categories || [], function (__, id) { categoryIds[id] = true; }); }); return VMS.Utilities.success({ categories: $.grep(options.data.categories, function (row) { return !!categoryIds[row.ID]; }), stages: $.map(stages, function (_, code) { return { value: code, label: VMS.Services.DisplayLabelService.Resolve(code, 'VENDOR_STAGE') }; }), statuses: $.map(statuses, function (_, code) { return { value: code, label: VMS.Services.DisplayLabelService.Resolve(code, 'VENDOR_STATUS') }; }) }); }); },
        QueryRegister: function (input) {
            var values = input && input.filters || {}, spec = { page: input && input.page, pageSize: input && input.pageSize, filters: [], sort: [{ field: 'Modified', direction: 'desc' }, { field: 'ID', direction: 'desc' }] };
            if (input && input.search) { spec.search = { value: input.search, fields: ['VendorName', 'VendorCode'] }; }
            if (input && input.sort && $.inArray(input.sort.field, ['VendorName', 'Modified']) >= 0) { spec.sort = [{ field: input.sort.field, direction: input.sort.direction === 'asc' ? 'asc' : 'desc' }, { field: 'ID', direction: 'desc' }]; }
            if (values.category) { spec.filters.push({ field: 'Categories', operator: 'containsValue', value: Number(values.category) }); }
            if (values.stage) { spec.filters.push({ field: 'StageCode', operator: 'eq', value: values.stage }); }
            if (values.status) { spec.filters.push({ field: 'StatusCode', operator: 'eq', value: values.status }); }
            return $.when(VMS.Services.AuthorizedQueryService.Query(VMS.Repositories.VendorRepository, spec, authorizeVendor), formOptions()).then(function (result, options) { if (!result.ok) { return result; } enrichRows(result.data.items, options.data); return decorateActions(result.data.items).then(function () { return result; }); });
        }
    };

    VMS.Services.PRPOService.GetVendorProfileSummary = function (vendorId) {
        return VMS.Services.Pass1EReadService ? VMS.Services.Pass1EReadService.GetVendorProfilePRPOSummary(vendorId) : VMS.Utilities.resolved(VMS.Utilities.failure('CONFIGURATION_MISSING', 'The authorized Vendor Profile read service is unavailable.'));
    };
    VMS.Services.InvoiceService.GetVendorProfileSummary = function (vendorId) {
        return VMS.Services.Pass1EReadService ? VMS.Services.Pass1EReadService.GetVendorProfileInvoiceSummary(vendorId) : VMS.Utilities.resolved(VMS.Utilities.failure('CONFIGURATION_MISSING', 'The authorized Vendor Profile read service is unavailable.'));
    };

}(window.VMS, window.jQuery));
