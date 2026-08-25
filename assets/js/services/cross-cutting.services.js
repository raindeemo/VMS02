(function (VMS, $) {
    'use strict';
    function nowIso() { return VMS.AppContext.getProvider().now().toISOString(); }
    function PrepareAction(context) {
        var actionRequestId = context.actionRequestId || VMS.Utilities.guid();
        return VMS.Repositories.WorkflowHistoryRepository.getByKey(actionRequestId).then(function (existing) {
            if (existing) { return VMS.Utilities.success(existing); }
            return VMS.Repositories.WorkflowHistoryRepository.create({ ActionRequestId: actionRequestId, EntityTypeCode: context.entityType, EntityItemID: context.entityId || null, EntityBusinessKeySnapshot: context.businessKey || '', AffectedItemIdsJSON: JSON.stringify(context.affectedIds || []), FromStageCode: context.fromStage || null, FromStatusCode: context.fromStatus || null, ToStageCode: context.toStage || null, ToStatusCode: context.toStatus || null, ActionCode: context.actionCode, ResultCode: 'PREPARED', CountsAsCompletedAction: false, PerformedBy: context.actor ? context.actor.ID : null, PerformedByUserKeySnapshot: context.actor ? context.actor.UserKey : '', ActionDate: nowIso(), Comment: context.comment || '', RejectionReasonCode: context.rejectionReasonCode || null, RejectionReasonSnapshot: context.rejectionReasonSnapshot || '', ChangedFieldsJSON: JSON.stringify(context.changedFields || {}), RecordDeepLinkSnapshot: context.deepLink || '', RecoveryContextJSON: null, ErrorCode: null }).then(function (row) { return VMS.Utilities.success(row); });
        });
    }
    function finalize(history, resultCode, details) { return VMS.Repositories.WorkflowHistoryRepository.update(history.ID, { ResultCode: resultCode, CountsAsCompletedAction: resultCode === 'SUCCESS' && !!details.countsAsCompletedAction, RecoveryContextJSON: JSON.stringify({ result: details.safeResult || null }), ErrorCode: details.errorCode || null }, history._etag); }
    function FinalizeSuccess(history, details) { return finalize(history, 'SUCCESS', details || {}); }
    function FinalizeFailure(history, details) { return finalize(history, 'FAILED', details || {}); }
    function UpdatePreparedRecovery(history, details) {
        details = details || {};
        return GetByActionRequestId(history.ActionRequestId).then(function (current) {
            if (!current) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The action was not found.'); }
            if (current.ResultCode !== 'PREPARED') { return VMS.Utilities.success(current); }
            return VMS.Repositories.WorkflowHistoryRepository.update(current.ID, { ResultCode: 'PREPARED', CountsAsCompletedAction: false, RecoveryContextJSON: JSON.stringify(details.recoveryContext || null), ErrorCode: details.errorCode || null }, current._etag);
        });
    }
    function GetByActionRequestId(id) { return VMS.Repositories.WorkflowHistoryRepository.getByKey(id); }
    function VerifyPreparedOutcome(id) { return GetByActionRequestId(id).then(function (row) { if (!row) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The action was not found.'); } if (row.ResultCode === 'PREPARED') { return VMS.Utilities.failure('ACTION_OUTCOME_UNCERTAIN', 'The action outcome requires reconciliation.'); } return VMS.Utilities.success(row); }); }
    VMS.Services.AuditService = { PrepareAction: PrepareAction, GetByActionRequestId: GetByActionRequestId, UpdatePreparedRecovery: UpdatePreparedRecovery, FinalizeSuccess: FinalizeSuccess, FinalizeFailure: FinalizeFailure, VerifyPreparedOutcome: VerifyPreparedOutcome };
    VMS.Services.BusinessActionService = {
        Execute: function (context, mutation, notification) {
            context.actor = VMS.Services.AccessService.GetCurrentUser();
            return PrepareAction(context).then(function (prepared) {
                var history = prepared.data, savedResult;
                if (history.ResultCode === 'SUCCESS') { try { return VMS.Utilities.success(JSON.parse(history.RecoveryContextJSON || '{}').result); } catch (ignore) { return VMS.Utilities.success(null); } }
                if (history.ResultCode !== 'PREPARED') { return VMS.Utilities.failure('UNSUPPORTED_OPERATION', 'This action request is already finalized.'); }
                return mutation(history).then(function (result) {
                    if (!result.ok) { return FinalizeFailure(history, { errorCode: result.code }).then(function () { return result; }); }
                    savedResult = result; return FinalizeSuccess(history, { countsAsCompletedAction: !!context.countsAsCompletedAction, safeResult: result.data }).then(function () {
                        if (!notification) { savedResult.actionRequestId = history.ActionRequestId; return savedResult; }
                        return VMS.Services.NotificationService.Send(notification).then(function (mail) { savedResult.actionRequestId = history.ActionRequestId; if (!mail.ok) { savedResult.warnings.push({ code: 'EMAIL_FAILED_AFTER_COMMIT', message: 'The action succeeded, but email delivery failed.' }); } return savedResult; });
                    });
                });
            });
        }
    };

    function deepKey(entityType, record) { if (entityType === 'VENDOR') { return 'VND-' + record.ID; } if (entityType === 'PRPO') { return record.PRNumber; } if (entityType === 'PO_LINE') { return record.POLineKey; } if (entityType === 'INVOICE' || entityType === 'DP_BATCH') { return entityType === 'DP_BATCH' ? record.AggregationBatchKey : record.InvoiceIdentifier; } if (entityType === 'FEEDBACK_ASSIGNMENT') { return 'FDB-' + record.ID; } return null; }
    function readRoute(entityType, record) { if (entityType === 'VENDOR') { return $.inArray(record.StageCode, ['APPROVED', 'REJECTED', 'EXPIRED']) >= 0 ? 'VENDOR_PROFILE' : 'VENDOR_LIST'; } if (entityType === 'PRPO') { return record.StageCode === 'PO_ACTIVE' ? 'PO_LINE_WORKSPACE' : 'PRPO_REGISTER'; } if (entityType === 'PO_LINE') { return 'PO_LINE_WORKSPACE'; } if (entityType === 'INVOICE' || entityType === 'DP_BATCH') { return 'INVOICE_DETAILS'; } if (entityType === 'FEEDBACK_ASSIGNMENT') { return 'FEEDBACK_ASSIGNMENTS'; } return null; }
    var interfaceRules = {
        VENDOR_ADD: { entityType: 'VENDOR', routeCode: 'VENDOR_LIST', create: true },
        VENDOR_DOCUMENT_EVALUATION: { entityType: 'VENDOR', routeCode: 'VENDOR_LIST', stages: ['DOCUMENT_EVALUATION'], statuses: ['IN_PROGRESS'] },
        VENDOR_INTERVIEW: { entityType: 'VENDOR', routeCode: 'VENDOR_LIST', stages: ['INTERVIEW'], statuses: ['IN_PROGRESS'] },
        VENDOR_ADMIN: { entityType: 'VENDOR', routeCode: 'VENDOR_LIST', alternateRoutes: ['VENDOR_PROFILE'] },
        PRPO_NEW: { entityType: 'PRPO', routeCode: 'PRPO_REGISTER', create: true },
        PRPO_APPROVAL: { entityType: 'PRPO', routeCode: 'PRPO_REGISTER', alternateRoutes: ['PENDING_APPROVALS'], stages: ['MANAGER_REVIEW'], statuses: ['IN_PROGRESS'] },
        PRPO_UPDATE_REQUIRED: { entityType: 'PRPO', routeCode: 'PRPO_REGISTER', stages: ['UPDATE_REQUIRED'], statuses: ['IN_PROGRESS'] },
        PO_CREATE: { entityType: 'PRPO', routeCode: 'PRPO_REGISTER', stages: ['PENDING_GPS'], statuses: ['IN_PROGRESS'] },
        PRPO_ADMIN: { entityType: 'PRPO', routeCode: 'PRPO_REGISTER' },
        PO_LINE_ADD_DETAILS: { entityType: 'PO_LINE', routeCode: 'PO_LINE_WORKSPACE', stages: ['CREATION'], statuses: ['IN_PROGRESS'], stageField: 'LineRequestStageCode', statusField: 'LineRequestStatusCode' },
        INVOICE_ADD_EXECUTION: { entityType: 'INVOICE', routeCode: 'INVOICE_REGISTER', create: true },
        INVOICE_ADD_EDUCATION_PROGRAM: { entityType: 'INVOICE', routeCode: 'INVOICE_REGISTER', create: true },
        INVOICE_PROCESSING: { entityType: 'INVOICE', routeCode: 'INVOICE_REGISTER', stages: ['INVOICE_PROCESSING'], statuses: ['IN_PROGRESS'] },
        INVOICE_MANAGER_APPROVAL: { entityType: 'INVOICE', routeCode: 'PENDING_APPROVALS', alternateRoutes: ['INVOICE_REGISTER'], stages: ['PENDING_APPROVAL'], statuses: ['IN_PROGRESS'], directPayment: false },
        CHARGEBACK_PROCESSING: { entityType: 'INVOICE', routeCode: 'INVOICE_REGISTER', stages: ['CHARGEBACK_PROCESSING'], statuses: ['IN_PROGRESS'] },
        INVOICE_ADMIN: { entityType: 'INVOICE', routeCode: 'INVOICE_DETAILS', alternateRoutes: ['INVOICE_REGISTER'] },
        DIRECT_PAYMENT_REVIEW_DETAILS: { entityType: 'INVOICE', routeCode: 'DIRECT_PAYMENT_REVIEW', alternateRoutes: ['INVOICE_REGISTER'], stages: ['DIRECT_PAYMENT_REVIEW'], statuses: ['IN_PROGRESS'], directPayment: true },
        FEEDBACK_FORM: { entityType: 'FEEDBACK_ASSIGNMENT', routeCode: 'FEEDBACK_ASSIGNMENTS', statuses: ['OPEN', 'SUBMITTED'], statusField: 'AssignmentStatusCode' }
    };
    function descriptor(routeCode, interfaceCode, entityType, record, mode) { var key = record ? deepKey(entityType, record) : null; return { routeCode: routeCode, interfaceCode: interfaceCode || null, entityType: entityType, id: record ? record.ID : null, key: key, deepLinkKey: key, mode: mode || (interfaceCode ? 'ACTION' : 'READ') }; }
    function safeNotFound() { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The record was not found or is not authorized.'); }
    function repositoryFor(entityType) { if (entityType === 'VENDOR') { return VMS.Repositories.VendorRepository; } if (entityType === 'PRPO') { return VMS.Repositories.PRPORepository; } if (entityType === 'PO_LINE') { return VMS.Repositories.POLineRepository; } if (entityType === 'INVOICE' || entityType === 'DP_BATCH') { return VMS.Repositories.InvoiceRepository; } if (entityType === 'FEEDBACK_ASSIGNMENT') { return VMS.Repositories.FeedbackAssignmentRepository; } return null; }
    function authorizeRecord(entityType, record) {
        if (entityType === 'PRPO') { return VMS.Repositories.VendorRepository.getById(VMS.Utilities.lookupId(record.Vendor)).then(function (vendor) { return vendor ? VMS.Services.AccessService.AuthorizeRecord('VENDOR', vendor, 'READ') : safeNotFound(); }); }
        if (entityType === 'PO_LINE') { return VMS.Repositories.PRPORepository.getById(VMS.Utilities.lookupId(record.POHeader)).then(function (header) { return header ? authorizeRecord('PRPO', header) : safeNotFound(); }); }
        return VMS.Services.AccessService.AuthorizeRecord(entityType === 'DP_BATCH' ? 'INVOICE' : entityType, record, 'READ');
    }
    function validateRule(rule, record) {
        var stageField = rule.stageField || 'StageCode', statusField = rule.statusField || 'StatusCode';
        if (rule.directPayment === true && !record.DirectPayment) { return VMS.Utilities.failure('INVALID_STAGE', 'The requested workflow interface is not available.'); }
        if (rule.directPayment === false && record.DirectPayment) { return VMS.Utilities.failure('INVALID_STAGE', 'The requested workflow interface is not available.'); }
        if (rule.stages && $.inArray(record[stageField], rule.stages) < 0) { return VMS.Utilities.failure('INVALID_STAGE', 'The requested workflow interface is not available in the current stage.'); }
        if (rule.statuses && $.inArray(record[statusField], rule.statuses) < 0) { return VMS.Utilities.failure('INVALID_STAGE', 'The requested workflow interface is not available in the current status.'); }
        return VMS.Utilities.success(true);
    }
    function validateBatch(record, interfaceCode) {
        if (!record.DirectPayment || !record.AggregationBatchKey || $.inArray(interfaceCode, ['INVOICE_PROCESSING', 'CHARGEBACK_PROCESSING']) < 0) { return VMS.Utilities.resolved(VMS.Utilities.success(true)); }
        return VMS.Repositories.InvoiceRepository.query({ filters: [{ field: 'AggregationBatchKey', operator: 'eq', value: record.AggregationBatchKey }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'ID', direction: 'asc' }], pageSize: 1000 }).then(function (data) {
            var expectedStage = interfaceCode, version = data.items[0] && data.items[0].BatchVersion, valid = data.items.length > 0 && data.items[0].ID === record.ID, recovery = false, locked = false, now = VMS.Services.ClockService.Now();
            $.each(data.items, function (_, member) { valid = valid && member.StageCode === expectedStage && member.StatusCode === 'IN_PROGRESS' && member.BatchVersion === version; recovery = recovery || member.BatchOperationStateCode === 'RECOVERY_REQUIRED'; locked = locked || !!(member.BatchLockToken && member.BatchLockExpiresAt && new Date(member.BatchLockExpiresAt) > now); });
            if (recovery) { return VMS.Utilities.failure('RECOVERY_REQUIRED', 'The batch requires controlled recovery.'); }
            if (locked) { return VMS.Utilities.failure('BATCH_LOCKED', 'The batch is currently locked.'); }
            return valid ? VMS.Utilities.success(true) : VMS.Utilities.failure('INVALID_STAGE', 'The complete batch is not eligible for this action.');
        });
    }
    function inferredInterface(entityType, record) {
        if (entityType === 'VENDOR') { return record.StageCode === 'DOCUMENT_EVALUATION' && record.StatusCode === 'IN_PROGRESS' ? 'VENDOR_DOCUMENT_EVALUATION' : record.StageCode === 'INTERVIEW' && record.StatusCode === 'IN_PROGRESS' ? 'VENDOR_INTERVIEW' : null; }
        if (entityType === 'PRPO') { return record.StageCode === 'UPDATE_REQUIRED' ? 'PRPO_UPDATE_REQUIRED' : record.StageCode === 'PENDING_GPS' ? 'PO_CREATE' : null; }
        if (entityType === 'PO_LINE') { return record.LineRequestStageCode === 'CREATION' && record.LineRequestStatusCode === 'IN_PROGRESS' ? 'PO_LINE_ADD_DETAILS' : null; }
        if (entityType === 'INVOICE' || entityType === 'DP_BATCH') { if (record.StageCode === 'DIRECT_PAYMENT_REVIEW' && record.DirectPayment) { return 'DIRECT_PAYMENT_REVIEW_DETAILS'; } if (record.StageCode === 'INVOICE_PROCESSING') { return 'INVOICE_PROCESSING'; } if (record.StageCode === 'CHARGEBACK_PROCESSING') { return 'CHARGEBACK_PROCESSING'; } }
        if (entityType === 'FEEDBACK_ASSIGNMENT' && $.inArray(record.AssignmentStatusCode, ['OPEN', 'SUBMITTED']) >= 0) { return 'FEEDBACK_FORM'; }
        return null;
    }
    function ResolveReleaseDestination(entityType, record) {
        if (entityType !== 'DP_BATCH' || !record || !record.DirectPayment || record.StageCode !== 'PAYMENT_AGGREGATION' || record.StatusCode !== 'IN_PROGRESS' || !record.AggregationBatchKey) { return VMS.Utilities.resolved(safeNotFound()); }
        return VMS.Services.AccessService.AuthorizeRoute('DIRECT_PAYMENT_REVIEW').then(function (routeAuth) {
            if (!routeAuth.ok) { return VMS.Utilities.failure('ACCESS_DENIED', 'The requested action is not authorized.'); }
            return authorizeRecord(entityType, record).then(function (recordAuth) {
                if (!recordAuth.ok) { return safeNotFound(); }
                return VMS.Repositories.InvoiceRepository.query({ filters: [{ field: 'AggregationBatchKey', operator: 'eq', value: record.AggregationBatchKey }, { field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'ID', direction: 'asc' }], pageSize: 1000 }).then(function (data) {
                    var valid = data.items.length > 0 && data.items[0].ID === record.ID, recovery = false, locked = false, now = VMS.Services.ClockService.Now(), currentPeriod = VMS.Services.ClockService.RiyadhPeriod();
                    $.each(data.items, function (_, member) { valid = valid && member.StageCode === 'PAYMENT_AGGREGATION' && member.StatusCode === 'IN_PROGRESS' && member.AggregationPeriod === record.AggregationPeriod; recovery = recovery || member.BatchOperationStateCode === 'RECOVERY_REQUIRED'; locked = locked || !!(member.BatchLockToken && member.BatchLockExpiresAt && new Date(member.BatchLockExpiresAt) > now); });
                    if (recovery) { return VMS.Utilities.failure('RECOVERY_REQUIRED', 'The batch requires controlled recovery.'); }
                    if (locked) { return VMS.Utilities.failure('BATCH_LOCKED', 'The batch is currently locked.'); }
                    if (!valid || !record.AggregationPeriod || record.AggregationPeriod >= currentPeriod) { return VMS.Utilities.failure('INVALID_STAGE', 'The complete batch is not release-eligible.'); }
                    return VMS.Utilities.success(descriptor('DIRECT_PAYMENT_REVIEW', null, 'DP_BATCH', record, 'ACTION'));
                });
            });
        });
    }
    function ResolveEntityDestination(entityType, record, mode) {
        var route = record && readRoute(entityType, record), key = record && deepKey(entityType, record);
        if (!route || !key) { return VMS.Utilities.resolved(safeNotFound()); }
        return VMS.Services.AccessService.AuthorizeRoute(route).then(function (routeAuth) { if (!routeAuth.ok) { return routeAuth; } return authorizeRecord(entityType, record).then(function (recordAuth) { return recordAuth.ok ? VMS.Utilities.success(descriptor(route, null, entityType, record, mode || 'READ')) : safeNotFound(); }); });
    }
    function ResolveCreateDestination(interfaceCode) {
        var rule = interfaceRules[interfaceCode];
        if (!rule || !rule.create) { return VMS.Utilities.resolved(VMS.Utilities.failure('ACCESS_DENIED', 'The requested interface is not authorized.')); }
        return $.when(VMS.Services.AccessService.AuthorizeRoute(rule.routeCode), VMS.Services.AccessService.AuthorizeInterface(interfaceCode)).then(function (routeAuth, interfaceAuth) { return routeAuth.ok && interfaceAuth.ok ? VMS.Utilities.success(descriptor(rule.routeCode, interfaceCode, rule.entityType, null, 'CREATE')) : VMS.Utilities.failure('ACCESS_DENIED', 'The requested interface is not authorized.'); });
    }
    function ResolveActionDestination(entityType, record, interfaceCode) {
        var selected = interfaceCode || inferredInterface(entityType, record), rule = interfaceRules[selected];
        if (!interfaceCode && entityType === 'DP_BATCH' && record && record.StageCode === 'PAYMENT_AGGREGATION') { return ResolveReleaseDestination(entityType, record); }
        if (!record || !selected || !rule || rule.create || (rule.entityType !== entityType && !(entityType === 'DP_BATCH' && rule.entityType === 'INVOICE'))) { return VMS.Utilities.resolved(safeNotFound()); }
        return $.when(VMS.Services.AccessService.AuthorizeRoute(rule.routeCode), VMS.Services.AccessService.AuthorizeInterface(selected)).then(function (routeAuth, interfaceAuth) {
            if (!routeAuth.ok || !interfaceAuth.ok) { return VMS.Utilities.failure('ACCESS_DENIED', 'The requested interface is not authorized.'); }
            return authorizeRecord(entityType, record).then(function (recordAuth) {
                var eligibility;
                if (!recordAuth.ok) { return safeNotFound(); }
                eligibility = validateRule(rule, record);
                if (!eligibility.ok) { return eligibility; }
                return validateBatch(record, selected).then(function (batch) { return batch.ok ? VMS.Utilities.success(descriptor(rule.routeCode, selected, entityType, record, 'ACTION')) : batch; });
            });
        });
    }
    function ResolveHostedDestination(routeCode, request) {
        var interfaceCode = request && request.interfaceCode, rule = interfaceRules[interfaceCode], id = VMS.Utilities.positiveId(request && request.id), repo;
        if (!rule) { return VMS.Utilities.resolved(VMS.Utilities.failure('ACCESS_DENIED', 'The requested interface is not authorized.')); }
        if (routeCode !== rule.routeCode && $.inArray(routeCode, rule.alternateRoutes || []) < 0) { return VMS.Utilities.resolved(VMS.Utilities.failure('ACCESS_DENIED', 'The requested interface is not authorized for this host.')); }
        if (rule.create) { return request && (request.id || request.key) ? VMS.Utilities.resolved(VMS.Utilities.failure('INVALID_LINK', 'The requested link is invalid.')) : ResolveCreateDestination(interfaceCode); }
        if (!id || !request.key) { return VMS.Utilities.resolved(VMS.Utilities.failure('INVALID_LINK', 'The requested link is invalid.')); }
        repo = repositoryFor(rule.entityType);
        if (!repo) { return VMS.Utilities.resolved(safeNotFound()); }
        return repo.getById(id).then(function (record) {
            var entityType = rule.entityType;
            if (!record) { return safeNotFound(); }
            if (record.DirectPayment && record.AggregationBatchKey && $.inArray(interfaceCode, ['INVOICE_PROCESSING', 'CHARGEBACK_PROCESSING']) >= 0) { entityType = 'DP_BATCH'; }
            return authorizeRecord(entityType, record).then(function (recordAuth) {
                if (!recordAuth.ok) { return safeNotFound(); }
                if (deepKey(entityType, record) !== request.key) { return VMS.Utilities.failure('INVALID_LINK', 'The requested link is invalid.'); }
                return ResolveActionDestination(entityType, record, interfaceCode).then(function (result) {
                    if (!result.ok) { return result; }
                    if (result.data.interfaceCode !== interfaceCode || (result.data.routeCode !== routeCode && $.inArray(routeCode, rule.alternateRoutes || []) < 0)) { return VMS.Utilities.failure('ACCESS_DENIED', 'The requested interface is not authorized for this host.'); }
                    if (result.data.routeCode !== routeCode) { result.data.routeCode = routeCode; }
                    return result;
                });
            });
        });
    }
    function ToUrl(destination) { return destination ? VMS.Routes.url(destination.routeCode, destination.id, destination.key, destination.interfaceCode === 'FEEDBACK_FORM' ? null : destination.interfaceCode) : null; }
    VMS.Services.DestinationResolverService = { ResolveEntityDestination: ResolveEntityDestination, ResolveCreateDestination: ResolveCreateDestination, ResolveActionDestination: ResolveActionDestination, ResolveHostedDestination: ResolveHostedDestination, ToUrl: ToUrl };

    VMS.Services.AuthorizedQueryService = {
        Query: function (repository, input, authorize) {
            var d = $.Deferred(), query = $.extend(true, {}, input || {}), requestedPage = Math.max(1, Number(query.page || 1)), requestedSize = Number(query.pageSize) === 25 ? 25 : 10, actor = VMS.Services.AccessService.GetCurrentUser(), operation = query.authorizationOperation || 'read';
            delete query.page; delete query.authorizationOperation; query.pageSize = requestedSize;
            if (requestedPage > 1 && !query.continuationToken) { d.resolve(VMS.Utilities.failure('VALIDATION_FAILED', 'An opaque continuation token is required for the requested page.')); return d.promise(); }
            VMS.AuthorizationScope.resolve(repository.dataset, actor, operation).then(function(scope){query.authorizationScope=scope;return $.when(repository.query(query), repository.count($.extend(true, {}, query, { continuationToken: null })));}).then(function (result, total) {
                var items = result && result.items || [], checked = [], index = 0;
                if (result && result.ok === false) { d.resolve(result); return; }
                function next() { var row; if (index >= items.length) { d.resolve(VMS.Utilities.success({ items: checked, totalCount: total, page: requestedPage, pageSize: requestedSize, continuationToken: result.continuationToken || null })); return; } row = items[index++]; authorize(row).then(function (allowed) { if (!allowed || !allowed.ok) { d.resolve(VMS.Utilities.failure('ACCESS_DENIED', 'An unauthorized record was rejected.')); return; } checked.push(row); next(); }); }
                next();
            }, function () { d.resolve(VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Records could not be loaded.')); }); return d.promise();
        }
    };

    var notificationCatalog = {
        VENDOR_CREATED: { label: 'Vendor onboarding created', text: 'A vendor onboarding record has been created.' },
        EVALUATION_PASSED: { label: 'Vendor evaluation passed', text: 'A vendor record passed document evaluation.' },
        VENDOR_REJECTED: { label: 'Vendor rejected', text: 'A vendor record was rejected.' },
        VENDOR_APPROVED: { label: 'Vendor approved', text: 'A vendor record was approved.' },
        VENDOR_ONBOARDING_REMINDER: { label: 'Vendor onboarding reminder', text: 'A vendor onboarding record requires attention.' },
        VENDOR_EXPIRED: { label: 'Vendor expired', text: 'A vendor onboarding record has expired.' },
        PR_CREATED: { label: 'Purchase requisition created', text: 'A purchase requisition record has been created.' },
        PO_CREATED: { label: 'Purchase order created', text: 'A purchase order record has been created.' },
        PO_LINE_THRESHOLD: { label: 'PO Line threshold reached', text: 'A purchase order Line has reached its configured balance threshold.' },
        STANDARD_INVOICE_CREATED: { label: 'Invoice created', text: 'An invoice record has been created.' },
        DP_INVOICE_CREATED: { label: 'Direct Payment invoice created', text: 'A Direct Payment invoice record has been created and requires review.' },
        FEEDBACK_SUBMITTED: { label: 'Feedback submitted', text: 'A feedback assignment has been submitted.' }
    };
    function html(value) { return String(value === null || value === undefined ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function validEmail(value) { return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value); }
    function addresses(items, seen) { var output = []; $.each(items || [], function (_, item) { var email = $.trim(VMS.SharePointSchema.personEmail(item) || String(item || '')).toLowerCase(); if (validEmail(email) && !seen[email]) { seen[email] = true; output.push(email); } }); return output; }
    function transportMessage(message, event) { var key = $.trim(String(message.businessKey || '').replace(/[\r\n\t]+/g, ' ')); return { eventCode: message.eventCode, to: message.to, cc: message.cc, businessKey: key, subject: 'VMS — ' + event.label + (key ? ' — ' + key : ''), body: '<html><body><p>' + html(event.text) + '</p>' + (key ? '<p><strong>Reference:</strong> ' + html(key) + '</p>' : '') + '</body></html>' }; }
    VMS.Services.NotificationService = {
        Send: function (message) { var provider = VMS.AppContext.getProvider(), event, seen = {}, prepared; message = message || {}; event = notificationCatalog[message.eventCode]; if (!event) { return VMS.Utilities.resolved(VMS.Utilities.failure('CONFIGURATION_INVALID', 'The notification event is not configured.')); } message = $.extend({}, message, { to: addresses(message.to, seen), cc: addresses(message.cc, seen) }); if (!message.to.length && !message.cc.length) { return VMS.Utilities.resolved(VMS.Utilities.failure('CONFIGURATION_INVALID', 'The notification has no valid recipients.')); } if (!provider || typeof provider.sendEmail !== 'function') { return VMS.Utilities.resolved(VMS.Utilities.failure('CONFIGURATION_INVALID', 'The active data provider cannot deliver email.')); } prepared = transportMessage(message, event); try { return provider.sendEmail(prepared).then(function (result) { return result && result.ok === true ? VMS.Utilities.success(result.data || { submitted: true }) : result && result.ok === false ? result : VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Email delivery could not be confirmed.'); }, function () { return VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Email delivery could not be confirmed.'); }); } catch (ignore) { return VMS.Utilities.resolved(VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Email delivery could not be confirmed.')); } },
        GetDummyDeliveries: function () { var provider = VMS.AppContext.getProvider(); return provider && typeof provider.getEmailDeliveries === 'function' ? provider.getEmailDeliveries() : []; },
        FailNextDummyDelivery: function () { var provider = VMS.AppContext.getProvider(); if (provider && typeof provider.failNextEmailDelivery === 'function') { provider.failNextEmailDelivery(); } },
        GetEventCatalog: function () { return VMS.Utilities.clone(notificationCatalog); }
    };
    VMS.Services.NotificationRecipientService = {
        ResolvePOLineThreshold: function () {
            return VMS.Repositories.UserRepository.query({ filters: [{ field: 'FunctionCode', operator: 'eq', value: 'VENDOR_MANAGEMENT' }, { field: 'RoleCode', operator: 'in', value: ['MANAGER', 'EMPLOYEE', 'CO_OP'] }, { field: 'IsActive', operator: 'eq', value: true }], select: ['Email'], pageSize: 500 }).then(function (data) {
                var seen = {}, to;
                if (data && data.ok === false) { return data; }
                to = addresses($.map(data.items || [], function (row) { return row.Email; }), seen);
                return to.length ? VMS.Utilities.success({ to: to, cc: [] }) : VMS.Utilities.failure('CONFIGURATION_INVALID', 'No active Vendor Management Team notification recipients are configured.');
            }, function () { return VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Notification recipients could not be resolved.'); });
        },
        SendPOLineThreshold: function (businessKey) {
            return this.ResolvePOLineThreshold().then(function (resolved) { return resolved.ok ? VMS.Services.NotificationService.Send({ eventCode: 'PO_LINE_THRESHOLD', businessKey: businessKey, to: resolved.data.to, cc: resolved.data.cc }) : resolved; });
        }
    };
    VMS.Services.ClockService = { Now: function () { return new Date(VMS.AppContext.getProvider().now().getTime()); }, RiyadhPeriod: function () { var date = VMS.AppContext.getProvider().now(); return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).replace(/^(\d)$/, '0$1'); } };
    VMS.Services.FinancialCalculationService = { Calculate: function (input) { var total = Number(input.TotalPrice || 0), discount = 0, vat = 0, rate = Number(input.ConversionRateUsed || 0); if (input.HasDiscount) { discount = input.DiscountInputTypeCode === 'PERCENTAGE' ? total * Number(input.DiscountInputValue || 0) / 100 : Number(input.DiscountInputValue || 0); } discount = VMS.Utilities.roundHalfAway(discount, 2); var net = VMS.Utilities.roundHalfAway(total - discount, 2); if (input.HasVAT) { vat = input.VATInputTypeCode === 'PERCENTAGE' ? net * Number(input.VATInputValue || 0) / 100 : Number(input.VATInputValue || 0); } vat = VMS.Utilities.roundHalfAway(vat, 2); var finalAmount = VMS.Utilities.roundHalfAway(net + vat, 2); return { TotalPrice: VMS.Utilities.roundHalfAway(total, 2), DiscountAmount: discount, NetAmountBeforeVAT: net, VATAmount: vat, FinalInvoiceAmount: finalAmount, ConversionRateUsed: VMS.Utilities.roundHalfAway(rate, 6), TotalPriceInSAR: VMS.Utilities.roundHalfAway(total * rate, 2), VATAmountInSAR: VMS.Utilities.roundHalfAway(vat * rate, 2), FinalInvoiceAmountInSAR: VMS.Utilities.roundHalfAway(finalAmount * rate, 2) }; } };
    VMS.Services.AttachmentService = {
        Validate: function (files, kind, required) { var allowed = kind === 'VENDOR' ? ['pdf', 'xlsx', 'docx'] : ['pdf', 'docx'], errors = []; if (required && (!files || !files.length)) { errors.push({ field: 'attachments', code: 'ATTACHMENT_INVALID', message: 'At least one attachment is required.' }); } $.each(files || [], function (_, file) { var name = String(file.name || ''), extension = name.lastIndexOf('.') >= 0 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : ''; if ($.inArray(extension, allowed) < 0 || Number(file.sizeBytes || file.size || 0) > 10485760 || /[\\/:*?\"<>|]/.test(name)) { errors.push({ field: 'attachments', code: 'ATTACHMENT_INVALID', message: 'An attachment is invalid.' }); } }); return errors.length ? VMS.Utilities.failure('ATTACHMENT_INVALID', 'Attachment validation failed.', errors) : VMS.Utilities.success(true); },
        ResolveAuthorizedRead: function (entityType, id, index) {
            if (entityType !== 'INVOICE') { return VMS.Utilities.resolved(VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment is not available.')); }
            return VMS.Repositories.InvoiceRepository.getById(Number(id)).then(function (row) {
                if (!row || !row.IsActive) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment is not available.'); }
                return VMS.Services.AccessService.AuthorizeRecord('INVOICE', row, 'READ').then(function (authorized) {
                    var attachment = row.attachments && row.attachments[Number(index)], url;
                    if (!authorized.ok || !attachment) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment is not available.'); }
                    url = String(attachment.serverRelativeUrl || '');
                    if (!url || /^javascript:/i.test(url) || /(?:editform|mode=edit|action=edit)/i.test(url)) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment destination is not approved.'); }
                    return VMS.Utilities.success({ name: attachment.name, url: url, readOnly: true });
                });
            });
        }
    };
}(window.VMS, window.jQuery));

(function (VMS, $) {
    'use strict';
    var targets = { ML_vendor: { entityType: 'VENDOR', extensions: ['pdf', 'xlsx', 'docx'], maximum: null }, Invoice: { entityType: 'INVOICE', extensions: ['pdf', 'docx'], maximum: 3 } };
    function target(name) { if (name === 'VENDOR') { name = 'ML_vendor'; } if (name === 'INVOICE') { name = 'Invoice'; } return targets[name] ? { dataset: name, rule: targets[name] } : null; }
    function repository(t) { return t.dataset === 'ML_vendor' ? VMS.Repositories.VendorRepository : VMS.Repositories.InvoiceRepository; }
    function failure(code, message) { return VMS.Utilities.failure(code, message); }
    function nameOf(file) { return $.trim(String(file && file.name || file || '')); }
    function matches(items, name) { return $.grep(items || [], function (item) { return VMS.Utilities.normalize(item.name) === VMS.Utilities.normalize(name); }); }
    function validateFile(file, t) { var name = nameOf(file), extension = name.lastIndexOf('.') >= 0 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : ''; return !name || /[\/:*?"<>|]/.test(name) || $.inArray(extension, t.rule.extensions) < 0 || Number(file && (file.sizeBytes || file.size) || 0) > 10485760 ? failure('ATTACHMENT_INVALID', 'The attachment filename or content is invalid.') : VMS.Utilities.success(name); }
    function authorize(t, row, operation) { var actor = VMS.Services.AccessService.GetCurrentUser(), worker = actor && $.inArray(actor.RoleCode, ['EMPLOYEE', 'CO_OP']) >= 0, vendorOperator = actor && actor.FunctionCode === 'VENDOR_MANAGEMENT' && $.inArray(actor.RoleCode, ['MANAGER', 'EMPLOYEE', 'CO_OP']) >= 0; if (!actor) { return VMS.Utilities.resolved(failure('ACCESS_DENIED', 'The attachment operation is not authorized.')); } if ($.inArray(actor.RoleCode, ['ADMIN', 'SUPER_ADMIN']) >= 0) { return VMS.Utilities.resolved(VMS.Utilities.success(true)); } if (operation === 'READ') { return VMS.Services.AccessService.AuthorizeRecord(t.rule.entityType, row, 'READ'); } if (t.dataset === 'ML_vendor') { if (!vendorOperator) { return VMS.Utilities.resolved(failure('ACCESS_DENIED', 'The attachment operation is not authorized.')); } if (row.StageCode !== 'DOCUMENT_EVALUATION' || row.StatusCode !== 'IN_PROGRESS') { return VMS.Utilities.resolved(failure('INVALID_STAGE', 'Vendor documents cannot be changed in the current state.')); } return VMS.Services.AccessService.AuthorizeRecord('VENDOR', row, 'WRITE'); } if (!worker || row.StatusCode !== 'IN_PROGRESS') { return VMS.Utilities.resolved(failure(worker ? 'INVALID_STAGE' : 'ACCESS_DENIED', worker ? 'Invoice attachments cannot be changed in the current state.' : 'The attachment operation is not authorized.')); } if (actor.FunctionCode === row.InvoiceSourceFunctionCode && VMS.Utilities.normalize(row.FocalPointEmail) === actor.UserKey) { return VMS.Utilities.resolved(VMS.Utilities.success(true)); } return actor.FunctionCode === 'VENDOR_MANAGEMENT' ? VMS.Services.AccessService.AuthorizeRecord('INVOICE', row, 'WRITE') : VMS.Utilities.resolved(failure('ACCESS_DENIED', 'The attachment operation is not authorized.')); }
    function parent(t, id, operation) { var nativeId = Number(id); if (!nativeId || nativeId < 1 || Math.floor(nativeId) !== nativeId) { return VMS.Utilities.resolved(failure('VALIDATION_FAILED', 'A valid attachment parent item is required.')); } return repository(t).provider().getById(t.dataset, nativeId).then(function (row) { if (!row || row.ok === false) { return failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment parent item was not found.'); } return authorize(t, row, operation).then(function (allowed) { return allowed.ok ? VMS.Utilities.success(row) : allowed; }); }); }
    function physicalList(t, id) { return repository(t).provider().getAttachments(t.dataset, id).then(function (items) { return items && items.ok === false ? items : VMS.Utilities.success($.map(items || [], function (item) { return { name: item.name, serverRelativeUrl: item.serverRelativeUrl, sizeBytes: item.sizeBytes === undefined ? null : item.sizeBytes, mimeType: item.mimeType || null }; })); }); }
    function uncertain(result) { return result && result.ok === false && result.code === 'ACTION_OUTCOME_UNCERTAIN'; }
    function ListAttachments(dataset, id) { var t = target(dataset); if (!t) { return VMS.Utilities.resolved(failure('CONFIGURATION_INVALID', 'Attachments are not supported for this list.')); } return parent(t, id, 'READ').then(function (p) { return p.ok ? physicalList(t, Number(id)) : p; }); }
    function AddAttachment(dataset, id, file) { var t = target(dataset), checked; if (!t) { return VMS.Utilities.resolved(failure('CONFIGURATION_INVALID', 'Attachments are not supported for this list.')); } checked = validateFile(file, t); if (!checked.ok) { return VMS.Utilities.resolved(checked); } return parent(t, id, 'WRITE').then(function (p) { if (!p.ok) { return p; } return physicalList(t, Number(id)).then(function (before) { if (!before.ok) { return before; } if (matches(before.data, checked.data).length) { return failure('DUPLICATE_ATTACHMENT', 'An attachment with this filename already exists.'); } if (t.rule.maximum && before.data.length >= t.rule.maximum) { return failure('ATTACHMENT_LIMIT_EXCEEDED', 'The Invoice attachment limit has been reached.'); } return repository(t).provider().addAttachment(t.dataset, Number(id), checked.data, file && file._file || file).then(function (saved) { if (saved && saved.ok === false && !uncertain(saved)) { return failure(saved.code === 'ACCESS_DENIED' ? 'PLATFORM_PERMISSION_MISMATCH' : saved.code || 'ATTACHMENT_FAILED', saved.message || 'The attachment could not be uploaded.'); } return physicalList(t, Number(id)).then(function (after) { var found; if (!after.ok) { return uncertain(saved) ? saved : failure('ATTACHMENT_VERIFICATION_FAILED', 'The attachment upload could not be verified.'); } found = matches(after.data, checked.data); if (found.length === 1) { return VMS.Utilities.success(found[0]); } if (found.length > 1) { return failure('DATA_INTEGRITY_ERROR', 'Multiple matching attachments were found.'); } return uncertain(saved) ? saved : failure('ATTACHMENT_VERIFICATION_FAILED', 'The attachment upload could not be verified.'); }); }); }); }); }
    function AddAttachments(dataset, id, files) { var t = target(dataset), d = $.Deferred(), index = 0; if (!t) { return VMS.Utilities.resolved(failure('CONFIGURATION_INVALID', 'Attachments are not supported for this list.')); } function next() { if (index >= (files || []).length) { parent(t, id, 'READ').then(function (p) { if (!p.ok) { d.resolve(p); return; } physicalList(t, Number(id)).then(function (listed) { if (!listed.ok) { d.resolve(listed); return; } p.data.attachments = listed.data; d.resolve(p.data); }); }); return; } AddAttachment(t.dataset, id, files[index++]).then(function (result) { if (!result.ok) { d.resolve(result); return; } next(); }); } next(); return d.promise(); }
    function DeleteAttachment(dataset, id, fileName) { var t = target(dataset), name = nameOf(fileName); if (!t) { return VMS.Utilities.resolved(failure('CONFIGURATION_INVALID', 'Attachments are not supported for this list.')); } if (!name) { return VMS.Utilities.resolved(failure('ATTACHMENT_INVALID', 'An attachment filename is required.')); } return parent(t, id, 'WRITE').then(function (p) { if (!p.ok) { return p; } return physicalList(t, Number(id)).then(function (before) { var found; if (!before.ok) { return before; } found = matches(before.data, name); if (found.length !== 1) { return failure(found.length ? 'DATA_INTEGRITY_ERROR' : 'ATTACHMENT_NOT_FOUND', found.length ? 'Multiple matching attachments were found.' : 'The attachment was not found.'); } return repository(t).provider().deleteAttachment(t.dataset, Number(id), found[0].name).then(function (removed) { if (removed && removed.ok === false && !uncertain(removed)) { return failure(removed.code === 'ACCESS_DENIED' ? 'PLATFORM_PERMISSION_MISMATCH' : removed.code || 'ATTACHMENT_DELETE_FAILED', removed.message || 'The attachment could not be deleted.'); } return physicalList(t, Number(id)).then(function (after) { if (!after.ok) { return uncertain(removed) ? removed : failure('ATTACHMENT_VERIFICATION_FAILED', 'The attachment deletion could not be verified.'); } return !matches(after.data, name).length ? VMS.Utilities.success(true) : uncertain(removed) ? removed : failure('ATTACHMENT_VERIFICATION_FAILED', 'The attachment deletion could not be verified.'); }); }); }); }); }
    VMS.Services.AttachmentService = { SupportedLists: ['ML_vendor', 'Invoice'], Validate: function (files, kind, required) { var t = target(kind), errors = []; if (!t) { return failure('CONFIGURATION_INVALID', 'Attachments are not supported for this list.'); } if (required && (!files || !files.length)) { errors.push({ field: 'attachments', code: 'ATTACHMENT_INVALID', message: 'At least one attachment is required.' }); } if (t.rule.maximum && (files || []).length > t.rule.maximum) { errors.push({ field: 'attachments', code: 'ATTACHMENT_LIMIT_EXCEEDED', message: 'A maximum of three Invoice attachments is allowed.' }); } $.each(files || [], function (_, file) { if (!validateFile(file, t).ok) { errors.push({ field: 'attachments', code: 'ATTACHMENT_INVALID', message: 'An attachment is invalid.' }); } }); return errors.length ? VMS.Utilities.failure('ATTACHMENT_INVALID', 'Attachment validation failed.', errors) : VMS.Utilities.success(true); }, ListAttachments: ListAttachments, GetAttachments: ListAttachments, AddAttachment: AddAttachment, AddAttachments: AddAttachments, DeleteAttachment: DeleteAttachment, GetAttachment: function (dataset, id, fileName) { return ListAttachments(dataset, id).then(function (listed) { var found = listed.ok ? matches(listed.data, fileName) : []; return listed.ok && found.length === 1 ? VMS.Utilities.success(found[0]) : failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment is not available.'); }); }, ResolveAuthorizedRead: function (entityType, id, index) { return ListAttachments(entityType, id).then(function (listed) { var attachment = listed.ok && listed.data[Number(index)], url = attachment && String(attachment.serverRelativeUrl || ''); return !attachment || !url || /^javascript:/i.test(url) || /(?:editform|mode=edit|action=edit)/i.test(url) ? failure('NOT_FOUND_OR_UNAUTHORIZED', 'The attachment is not available.') : VMS.Utilities.success({ name: attachment.name, url: url, readOnly: true }); }); } };
}(window.VMS, window.jQuery));

(function (VMS, $) {
    'use strict';
    var byGroup = {}, byCode = {}, initialized = false;
    var fieldGroups = {
        RoleCode: 'USER_ROLE', FunctionCode: 'FUNCTION', VendorClassificationCode: 'VENDOR_CLASSIFICATION', VendorProcessingTypeCode: 'VENDOR_PROCESSING_TYPE',
        EvaluationResultCode: 'VENDOR_OPTION_RESULT', InterviewResultCode: 'VENDOR_OPTION_RESULT', AssignmentStatusCode: 'FEEDBACK_ASSIGNMENT_STATUS',
        QuestionTypeCode: 'SURVEY_QUESTION_TYPE', LineRequestStageCode: 'PO_LINE_REQUEST_STAGE', LineRequestStatusCode: 'PO_LINE_REQUEST_STATUS',
        POLineStatusCode: 'PO_LINE_STATUS', ManagedByCode: 'INVOICE_MANAGED_BY', RejectionReasonCode: 'INVOICE_REJECTION_REASON'
    };
    var actionLabels = {
        CREATE: 'Create', CREATE_PO: 'Create PO', EVALUATE: 'Documentation evaluation', INTERVIEW: 'Vendor interview', APPROVE: 'Manager approval',
        RELEASE: 'Release Direct Payment batch', SAVE_CORRECTION: 'Save PR correction', SUBMIT_GROUP: 'Submit Direct Payment batch', REVIEW_DONE: 'Complete Direct Payment review',
        SUBMIT_FOR_APPROVAL: 'Submit for approval', SUBMIT_FEEDBACK: 'Submit Feedback', UPDATE_RATE: 'Update conversion rate', UPDATE_ACCESS: 'Update access'
    };
    function Initialize() {
        if (initialized) { return VMS.Utilities.resolved(VMS.Utilities.success(true)); }
        return VMS.Repositories.ConfigurationRepository.query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], pageSize: 1000 }).then(function (data) {
            $.each(data.items, function (_, row) {
                byGroup[row.GroupCode + '|' + row.ItemCode] = row.DisplayLabel;
                if (!byCode[row.ItemCode]) { byCode[row.ItemCode] = row.DisplayLabel; }
            });
            initialized = true;
            return VMS.Utilities.success(true);
        });
    }
    function Resolve(code, groupCode) { if (code === null || code === undefined || code === '') { return ''; } return byGroup[(groupCode || '') + '|' + code] || byCode[code] || VMS.Utilities.humanizeCode(code); }
    function ResolveField(field, code) {
        var group = fieldGroups[field];
        if (!group && /StageCode$/.test(field || '')) { group = field === 'StageCode' ? null : field.replace(/Code$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(); }
        if (!group && /StatusCode$/.test(field || '')) { group = field === 'StatusCode' ? null : field.replace(/Code$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(); }
        return Resolve(code, group);
    }
    function ResolveAction(code, entityType) {
        if (code === 'APPROVE' && entityType === 'PRPO') { return 'PR Manager approval'; }
        if (code === 'APPROVE' && entityType === 'INVOICE') { return 'Invoice Manager approval'; }
        if (code === 'SAVE_CORRECTION' && entityType === 'PRPO') { return 'PR correction saved'; }
        if (code === 'CREATE' && entityType === 'INVOICE') { return 'Invoice created'; }
        return actionLabels[code] || VMS.Utilities.humanizeCode(code);
    }
    function ResolveResultingState(row) {
        var group = row.EntityTypeCode === 'PRPO' ? 'PR_PO_STAGE' : (row.EntityTypeCode === 'VENDOR' ? 'VENDOR_STAGE' : ($.inArray(row.EntityTypeCode, ['INVOICE', 'DP_BATCH']) >= 0 ? 'INVOICE_STAGE' : null));
        return row.ToStageCode ? Resolve(row.ToStageCode, group) : (row.ToStatusCode ? Resolve(row.ToStatusCode) : 'Completed');
    }
    VMS.Services.DisplayLabelService = { Initialize: Initialize, Resolve: Resolve, ResolveField: ResolveField, ResolveAction: ResolveAction, ResolveResultingState: ResolveResultingState };
}(window.VMS, window.jQuery));
