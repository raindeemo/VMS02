(function (VMS, $) {
    'use strict';

    var historyAuthority = {}, historySelect = ['ID', 'EntityTypeCode', 'EntityItemID', 'EntityBusinessKeySnapshot', 'FromStageCode', 'FromStatusCode', 'ToStageCode', 'ToStatusCode', 'ActionCode', 'ResultCode', 'CountsAsCompletedAction', 'PerformedBy', 'PerformedByUserKeySnapshot', 'ActionDate'];
    function failure(message) { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', message || 'The requested data was not found or is not authorized.'); }
    function actor() { return VMS.Services.AccessService.GetCurrentUser(); }
    function historySpec(filters, pageSize) { return { filters: filters, select: historySelect, sort: [{ field: 'ActionDate', direction: 'desc' }, { field: 'ID', direction: 'desc' }], pageSize: Math.min(Number(pageSize) || 25, 100) }; }
    function safeHistory(row) {
        var output = {};
        $.each(historySelect, function (_, key) { if (Object.prototype.hasOwnProperty.call(row, key)) { output[key] = VMS.Utilities.clone(row[key]); } });
        return output;
    }
    function queryAll(repository, spec) {
        var d = $.Deferred(), items = [], token = null;
        function next() { var request = $.extend({}, spec, { continuationToken: token }); repository.query(request).then(function (data) { if (!data || data.ok === false) { d.resolve(data || VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The query failed.')); return; } items = items.concat(data.items || []); token = data.continuationToken; if (token) { next(); } else { d.resolve({ items: items, continuationToken: null }); } }); }
        next(); return d.promise();
    }
    function queryHistory(filters, pageSize) { return VMS.Repositories.WorkflowHistoryRepository.query(historySpec(filters, pageSize)).then(function (data) { data.items = $.map(data.items || [], safeHistory); return data; }); }
    function exactHistory(entityType, entityId, pageSize) {
        return queryHistory([{ field: 'EntityTypeCode', operator: 'eq', value: entityType }, { field: 'EntityItemID', operator: 'eq', value: Number(entityId) }], pageSize);
    }
    function batchHistory(batchKey, pageSize) {
        return queryHistory([{ field: 'EntityTypeCode', operator: 'eq', value: 'DP_BATCH' }, { field: 'EntityBusinessKeySnapshot', operator: 'eq', value: String(batchKey) }], pageSize);
    }
    function mergeNewest(groups, limit) {
        var rows = [];
        $.each(groups || [], function (_, group) { rows = rows.concat(group.items || group || []); });
        rows.sort(function (a, b) { var date = String(b.ActionDate).localeCompare(String(a.ActionDate)); return date || Number(b.ID) - Number(a.ID); });
        return rows.slice(0, limit || 5);
    }
    function QueryAuthorizedEntityHistory(context) {
        var entity = context && context.entity, type = context && context.entityType, pageSize = context && context.pageSize;
        if (!context || context.authority !== historyAuthority || !entity || !entity.ID || $.inArray(type, ['INVOICE', 'VENDOR', 'PRPO']) < 0) { return VMS.Utilities.resolved(failure('History context is not authorized.')); }
        return exactHistory(type, entity.ID, pageSize).then(function (primary) {
            var combined = VMS.Utilities.resolved({ items: primary.items || [] });
            if (type === 'INVOICE' && entity.DirectPayment && entity.AggregationBatchKey && context.includeBatch === true) { combined = batchHistory(entity.AggregationBatchKey, pageSize).then(function (batch) { return { items: mergeNewest([primary, batch], Number(pageSize) || 25) }; }); }
            return combined.then(function (data) { return VMS.Services.DestinationResolverService.ResolveEntityDestination(type, entity).then(function (destination) { $.each(data.items, function (_, item) { item.action = VMS.Services.DisplayLabelService.ResolveAction(item.ActionCode, item.EntityTypeCode); item.reference = item.EntityBusinessKeySnapshot; item.date = item.ActionDate; item.state = VMS.Services.DisplayLabelService.ResolveResultingState(item); if (destination.ok) { item.href = VMS.Services.DestinationResolverService.ToUrl(destination.data); } }); return VMS.Utilities.success(data); }); });
        });
    }
    VMS.Services.HistoryService = { QueryAuthorizedEntityHistory: QueryAuthorizedEntityHistory, SafeSelect: historySelect.slice(0) };

    VMS.Services.InvoiceService.GetAuthorizedDetails = function (id, key) {
        return VMS.Services.InvoiceService.GetRecord(id, key).then(function (record) {
            if (!record.ok || !record.data.InvoiceIdentifier || !record.data.IsActive) { return record.ok ? failure('The Invoice is technically incomplete.') : record; }
            return VMS.Repositories.InvoiceRepository.getAttachments(record.data.ID).then(function (attachments) {
                record.data.attachments = attachments && attachments.ok === false ? [] : attachments;
                return QueryAuthorizedEntityHistory({ authority: historyAuthority, entityType: 'INVOICE', entity: record.data, includeBatch: !!record.data.DirectPayment, pageSize: 50 }).then(function (history) {
                    if (!history.ok) { return history; }
                    return VMS.Utilities.success({ invoice: record.data, history: history.data.items });
                });
            });
        });
    };

    function authorizedVendor(id, key) {
        return VMS.Services.VendorService.GetProfile(id, key || ('VND-' + Number(id)));
    }
    function scopedRows(dataset, repository, vendorId, extraFilters) {
        return VMS.AuthorizationScope.resolve(dataset, actor(), 'read').then(function (scope) {
            var filters = [{ field: 'Vendor', operator: 'eq', value: Number(vendorId) }].concat(extraFilters || []);
            return queryAll(repository, { authorizationScope: scope, filters: filters, sort: [{ field: 'ID', direction: 'desc' }], pageSize: 100 });
        });
    }
    function decorateDestinations(entityType, rows) {
        var d = $.Deferred(), index = 0;
        function next() { var row; if (index >= rows.length) { d.resolve(rows); return; } row = rows[index++]; VMS.Services.DestinationResolverService.ResolveEntityDestination(entityType, row).then(function (destination) { if (destination.ok) { row.Destination = destination.data; } next(); }); }
        next(); return d.promise();
    }
    function historyForIds(type, ids) {
        var d = $.Deferred(), chunks = [], index = 0;
        while (index < ids.length) { chunks.push(ids.slice(index, index + 50)); index += 50; }
        if (!chunks.length) { return VMS.Utilities.resolved({ items: [] }); }
        return $.when.apply($, $.map(chunks, function (chunk) { return queryHistory([{ field: 'EntityTypeCode', operator: 'eq', value: type }, { field: 'EntityItemID', operator: 'in', value: chunk }, { field: 'ResultCode', operator: 'eq', value: 'SUCCESS' }], 5); })).then(function () {
            var groups = chunks.length === 1 ? [arguments[0]] : Array.prototype.slice.call(arguments);
            return { items: mergeNewest(groups, 5) };
        });
    }
    function recentActivity(vendor, prs, invoices) {
        var prIds = $.map(prs, function (row) { return row.ID; }), invoiceIds = $.map(invoices, function (row) { return row.ID; });
        return $.when(queryHistory([{ field: 'EntityTypeCode', operator: 'eq', value: 'VENDOR' }, { field: 'EntityItemID', operator: 'eq', value: vendor.ID }, { field: 'ResultCode', operator: 'eq', value: 'SUCCESS' }], 5), historyForIds('PRPO', prIds), historyForIds('INVOICE', invoiceIds)).then(function (vendorHistory, prHistory, invoiceHistory) {
            var byId = {}, output = mergeNewest([vendorHistory, prHistory, invoiceHistory], 5), d = $.Deferred(), index = 0;
            $.each(prs, function (_, row) { byId['PRPO|' + row.ID] = row; }); $.each(invoices, function (_, row) { byId['INVOICE|' + row.ID] = row; }); byId['VENDOR|' + vendor.ID] = vendor;
            function next() { var item, record; if (index >= output.length) { d.resolve(output); return; } item = output[index++]; record = byId[item.EntityTypeCode + '|' + item.EntityItemID]; if (!record) { output.splice(index - 1, 1); index -= 1; next(); return; } VMS.Services.DestinationResolverService.ResolveEntityDestination(item.EntityTypeCode, record).then(function (destination) { item.action = VMS.Services.DisplayLabelService.ResolveAction(item.ActionCode, item.EntityTypeCode); item.reference = item.EntityBusinessKeySnapshot; item.date = item.ActionDate; item.state = VMS.Services.DisplayLabelService.ResolveResultingState(item); if (destination.ok) { item.href = VMS.Services.DestinationResolverService.ToUrl(destination.data); } next(); }); }
            next(); return d.promise();
        });
    }
    VMS.Services.VendorService.GetProfileContext = function (id, key) {
        return authorizedVendor(id, key).then(function (profile) {
            if (!profile.ok) { return profile; }
            return $.when(VMS.Services.VendorService.GetFormOptions(), VMS.Repositories.VendorRepository.getAttachments(profile.data.ID), scopedRows('PR_PO', VMS.Repositories.PRPORepository, profile.data.ID), scopedRows('Invoice', VMS.Repositories.InvoiceRepository, profile.data.ID, [{ field: 'IsActive', operator: 'eq', value: true }, { field: 'InvoiceIdentifier', operator: 'ne', value: null }])).then(function (options, attachments, prs, invoices) {
                profile.data.attachments = attachments && attachments.ok === false ? [] : attachments;
                return recentActivity(profile.data, prs.items, invoices.items).then(function (activity) { return VMS.Utilities.success({ vendor: profile.data, options: options.data, recentActivity: activity }); });
            });
        });
    };
    VMS.Services.VendorService.GetProfileDocuments = function (id, key) { return authorizedVendor(id, key).then(function (profile) { if (!profile.ok) { return profile; } return VMS.Repositories.VendorRepository.getAttachments(profile.data.ID).then(function (items) { return VMS.Utilities.success({ items: items }); }); }); };
    VMS.Services.PRPOService.GetVendorProfileSummary = function (vendorId) {
        return authorizedVendor(vendorId).then(function (profile) { if (!profile.ok) { return profile; } return $.when(scopedRows('PR_PO', VMS.Repositories.PRPORepository, profile.data.ID), VMS.Repositories.CurrencyRepository.query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], pageSize: 100 })).then(function (data, currencies) { var rates = {}, total = 0, complete = true; $.each(currencies.items, function (_, row) { rates[row.ID] = Number(row.ConversionRateToSAR); }); $.each(data.items, function (_, row) { var rate = rates[VMS.Utilities.lookupId(row.Currency)]; if (!rate) { complete = false; } else { total += Number(row.PRAmount || 0) * rate; } }); return decorateDestinations('PRPO', data.items).then(function () { return VMS.Utilities.success({ TotalPRs: data.items.length, TotalAmountInSAR: complete ? VMS.Utilities.roundHalfAway(total, 2) : null, items: data.items }); }); }); });
    };
    VMS.Services.InvoiceService.GetVendorProfileSummary = function (vendorId) {
        return authorizedVendor(vendorId).then(function (profile) { if (!profile.ok) { return profile; } return scopedRows('Invoice', VMS.Repositories.InvoiceRepository, profile.data.ID, [{ field: 'IsActive', operator: 'eq', value: true }, { field: 'InvoiceIdentifier', operator: 'ne', value: null }]).then(function (data) { var out = { Total: data.items.length, InProcess: 0, Settled: 0, items: data.items }; $.each(data.items, function (_, row) { if (row.StatusCode === 'SETTLED') { out.Settled += 1; } else { out.InProcess += 1; } }); return decorateDestinations('INVOICE', data.items).then(function () { return VMS.Utilities.success(out); }); }); });
    };
    VMS.Services.Pass1EReadService = {
        GetVendorProfileContext: VMS.Services.VendorService.GetProfileContext,
        GetVendorProfileDocuments: VMS.Services.VendorService.GetProfileDocuments,
        GetVendorProfilePRPOSummary: VMS.Services.PRPOService.GetVendorProfileSummary,
        GetVendorProfileInvoiceSummary: VMS.Services.InvoiceService.GetVendorProfileSummary,
        GetInvoiceDetails: VMS.Services.InvoiceService.GetAuthorizedDetails,
        QueryAuthorizedEntityHistory: QueryAuthorizedEntityHistory
    };
}(window.VMS, window.jQuery));
