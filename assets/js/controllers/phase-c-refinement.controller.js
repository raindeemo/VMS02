(function (VMS, $, window) {
    'use strict';

    function safe(value) { return VMS.Utilities.safeText(value); }
    function user() { return VMS.Services.AccessService.GetCurrentUser(); }
    function isManager() { var current = user(); return current && current.IsActive && current.RoleCode === 'MANAGER' && current.FunctionCode === 'VENDOR_MANAGEMENT'; }
    function isAdmin() { var current = user(); return current && $.inArray(current.RoleCode, ['ADMIN', 'SUPER_ADMIN']) >= 0; }
    function isUpper() { var current = user(); return current && current.RoleCode === 'UPPER_MANAGEMENT'; }
    function isWorker() { var current = user(); return current && current.FunctionCode === 'VENDOR_MANAGEMENT' && $.inArray(current.RoleCode, ['EMPLOYEE', 'CO_OP']) >= 0; }
    function money(code, value) { return safe((code || '—') + ' ' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
    var resolver = VMS.Services.DestinationResolverService;

    var hostedInterfaces = VMS.Components.VmsHostedInterfaces;
    var hostedOpen = hostedInterfaces.open;
    hostedInterfaces.open = function (destination, options) {
        return hostedOpen(destination, options).then(function (result) {
            if (result.ok && destination.interfaceCode === 'VENDOR_ADMIN') {
                var attempts = 0, timer = window.setInterval(function () {
                    var toggle = $('#vms-hosted-modal [data-toggle-vendor-active]'); attempts += 1;
                    if (toggle.length) { toggle.toggleClass('btn-danger', $.trim(toggle.text()) === 'Deactivate').toggleClass('btn-outline-secondary', $.trim(toggle.text()) !== 'Deactivate'); window.clearInterval(timer); }
                    if (attempts >= 40) { window.clearInterval(timer); }
                }, 25);
            }
            return result;
        });
    };

    function approvalFactory(destination, hostOptions) {
        var state = { mode: null, record: null };
        function showReason(mode) {
            var root = $('#vms-hosted-modal'), reject = mode === 'reject';
            state.mode = mode;
            root.find('[data-approval-reason]').removeAttr('hidden');
            root.find('[data-approval-reason-label]').text(reject ? 'Final Rejection Reason *' : 'Update Required Reason *');
            root.find('[name="DecisionReason"]').attr('aria-label', reject ? 'Final Rejection Reason' : 'Update Required Reason').focus();
        }
        function complete(result, api, message) {
            if (!result.ok) { result.code === 'VALIDATION_FAILED' ? api.showValidation(result) : api.showError(result); return result; }
            api.markClean(); api.close(true); VMS.Components.VmsToast.show({ type: 'success', message: message });
            return $.when(hostOptions.onRefresh ? hostOptions.onRefresh(result) : true).then(function () { return resolver.ResolveEntityDestination('PRPO', result.data); });
        }
        function reasonAction(mode, api) {
            var root = $('#vms-hosted-modal'), reason;
            if (state.mode !== mode) { showReason(mode); return; }
            reason = $.trim(root.find('[name="DecisionReason"]').val());
            if (!reason) { api.showValidation(VMS.Utilities.failure('VALIDATION_FAILED', 'A Manager reason is required.', [{ field: 'DecisionReason', message: mode === 'reject' ? 'Final Rejection Reason is required.' : 'Update Required Reason is required.' }])); return; }
            VMS.Components.VmsConfirmation.open({ title: mode === 'reject' ? 'Reject PR/PO?' : 'Return PR/PO for Update?', message: mode === 'reject' ? 'Reject this PR/PO with the entered final reason?' : 'Return this PR/PO for correction with the entered reason?', confirmLabel: mode === 'reject' ? 'Reject PR/PO' : 'Update Required', danger: mode === 'reject' }).then(function (confirmed) {
                if (!confirmed) { return; }
                (mode === 'reject' ? VMS.Services.PRPOService.Reject(state.record.ID, reason, state.record._etag, VMS.Utilities.guid()) : VMS.Services.PRPOService.ReturnForUpdate(state.record.ID, reason, state.record._etag, VMS.Utilities.guid())).then(function (result) { complete(result, api, mode === 'reject' ? 'PR/PO rejected.' : 'PR/PO returned for update.'); });
            });
        }
        return {
            title: 'PR/PO Approval', cancelLabel: 'Cancel',
            renderBody: function () { return { html: '<div class="vms-modal-loading">Loading PR/PO…</div>', onMount: function (api, root) {
                $.when(VMS.Services.PRPOService.GetRecord(destination.id), VMS.Repositories.CurrencyRepository.query({ pageSize: 100 })).then(function (recordResult, currencyData) {
                    if (!recordResult.ok) { api.showError(recordResult); return; }
                    var record = recordResult.data, currencyCode = '';
                    if (record.PRNumber !== destination.key) { api.showError(VMS.Utilities.failure('INVALID_LINK', 'The requested link is invalid.')); return; }
                    if (record.StageCode !== 'MANAGER_REVIEW' || record.StatusCode !== 'IN_PROGRESS') { api.showError(VMS.Utilities.failure('INVALID_STAGE', 'The PR/PO is no longer pending Manager review.')); return; }
                    $.each(currencyData.items, function (_, currency) { if (currency.ID === VMS.Utilities.lookupId(record.Currency)) { currencyCode = currency.CurrencyCode; } });
                    state.record = record;
                    root.html('<section class="vms-approval-context"><dl><div><dt>PR Number</dt><dd>' + safe(record.PRNumber) + '</dd></div><div><dt>Vendor</dt><dd>' + safe(record.VendorNameSnapshot) + '</dd></div><div><dt>PR Amount</dt><dd>' + money(currencyCode, record.PRAmount) + '</dd></div><div><dt>Current Stage</dt><dd>' + safe(VMS.Services.DisplayLabelService.Resolve(record.StageCode, 'PR_PO_STAGE')) + '</dd></div><div><dt>Current Status</dt><dd>' + safe(VMS.Services.DisplayLabelService.Resolve(record.StatusCode, 'PR_PO_STATUS')) + '</dd></div><div class="vms-approval-description"><dt>Description</dt><dd>' + safe(record.Description || '—') + '</dd></div></dl></section><div class="form-group vms-approval-reason" data-approval-reason hidden><label data-approval-reason-label for="vms-DecisionReason">Manager Reason *</label><textarea id="vms-DecisionReason" name="DecisionReason" class="form-control" rows="3"></textarea></div>');
                    api.markClean();
                });
            } }; },
            secondaryActions: [
                { label: 'Update Required', style: 'pending', onClick: function (api) { reasonAction('update', api); } },
                { label: 'Reject', style: 'danger', onClick: function (api) { reasonAction('reject', api); } }
            ],
            primaryAction: { label: 'Approve', successMessage: 'PR/PO approved.', onExecute: function () {
                return VMS.Components.VmsConfirmation.open({ title: 'Approve PR/PO?', message: 'Approve this PR/PO and move it to Pending GPS?', confirmLabel: 'Approve' }).then(function (confirmed) { return confirmed ? VMS.Services.PRPOService.Approve(state.record.ID, state.record._etag, VMS.Utilities.guid()) : { ok: false, cancelled: true }; });
            } },
            onSuccess: function (result) { return resolver.ResolveEntityDestination('PRPO', result.data); }
        };
    }
    VMS.Components.VmsHostedInterfaces.register('PRPO_APPROVAL', approvalFactory);

    function poCreateFactory(destination) {
        var state = { record: null };
        return {
            title: 'Create PO', cancelLabel: 'Cancel',
            renderBody: function () { return { html: '<div class="vms-modal-loading">Loading PR/PO…</div>', onMount: function (api, root) {
                $.when(VMS.Services.PRPOService.GetRecord(destination.id), VMS.Services.PRPOService.GetFormOptions()).then(function (recordResult, optionsResult) {
                    if (!recordResult.ok || !optionsResult.ok) { api.showError(recordResult.ok ? optionsResult : recordResult); return; }
                    var record = recordResult.data, currency = null;
                    $.each(optionsResult.data.currencies, function (_, row) { if (row.ID === record.Currency) { currency = row; } }); state.record = record;
                    root.html('<div class="vms-prpo-context"><span class="vms-prpo-context-icon" aria-hidden="true">P</span><span><strong>' + safe(record.PRNumber) + '</strong><small>' + safe(record.VendorNameSnapshot) + ' · Pending GPS / In Progress</small></span></div><form novalidate><div class="vms-form-grid"><div class="form-group"><label for="vms-PONumber">PO Number *</label><input id="vms-PONumber" name="PONumber" class="form-control" required></div><div class="form-group"><label for="vms-POLineNumber">Initial PO Line Number</label><input id="vms-POLineNumber" class="form-control" value="10" readonly></div><div class="form-group"><label for="vms-POLineAmount">Amount *</label><input id="vms-POLineAmount" name="POLineAmount" type="number" min="0.01" step="0.01" class="form-control" required></div><div class="form-group"><label for="vms-CurrencyDisplay">Currency</label><input id="vms-CurrencyDisplay" class="form-control" value="' + safe(currency ? currency.CurrencyCode + ' — ' + currency.CurrencyName : '') + '" readonly></div></div></form>'); api.markClean();
                });
            } }; },
            primaryAction: { label: 'Create PO', successMessage: 'PO and initial Line 10 created successfully.', onExecute: function () {
                var root = $('#vms-hosted-modal');
                return VMS.Components.VmsConfirmation.open({ title: 'Create PO and Line 10?', message: 'Create the external PO and initialize Line 10 as one operation?', confirmLabel: 'Create PO' }).then(function (confirmed) { return confirmed ? VMS.Services.PRPOService.CreatePOAndInitialLine(state.record.ID, root.find('[name="PONumber"]').val(), root.find('[name="POLineAmount"]').val(), state.record._etag, VMS.Utilities.guid()) : { ok: false, cancelled: true }; });
            } }
        };
    }
    VMS.Components.VmsHostedInterfaces.register('PO_CREATE', poCreateFactory);

    function refinedRows(query) {
        return $.when(VMS.Services.PRPOService.QueryRegister(query), VMS.Repositories.CurrencyRepository.query({ pageSize: 100 })).then(function (result, currencies) {
            if (!result.ok) { return result; }
            var byId = {}, rows = result.data.items, d = $.Deferred(), index = 0;
            $.each(currencies.items, function (_, currency) { byId[currency.ID] = currency.CurrencyCode; });
            function next() {
                if (index >= rows.length) { d.resolve(result); return; }
                var row = rows[index++], baseActions = row.Actions || [], actions = [];
                row.CurrencyCode = byId[VMS.Utilities.lookupId(row.Currency)] || '';
                if (isWorker() || isAdmin()) { actions = baseActions.slice(0); }
                row.Actions = actions;
                if (isManager() && row.StageCode === 'MANAGER_REVIEW' && row.StatusCode === 'IN_PROGRESS') {
                    resolver.ResolveActionDestination('PRPO', row, 'PRPO_APPROVAL').then(function (pending) { if (pending.ok) { row.Actions.push({ label: 'Pending', style: 'pending', destination: pending.data }); } next(); }); return;
                }
                if (row.StageCode === 'PO_ACTIVE' && row.StatusCode === 'APPROVED') {
                    resolver.ResolveEntityDestination('PRPO', row).then(function (view) { if (view.ok) { row.Actions.unshift({ label: 'View', style: 'secondary', destination: view.data }); } next(); }); return;
                }
                if (isUpper() || isManager()) { row.Actions = []; }
                next();
            }
            next(); return d.promise();
        });
    }
    function summaryCards(summary) { return VMS.Components.VmsSummaryCard('Total PRs', summary.TotalPRs) + VMS.Components.VmsSummaryCard('Total Amount', summary.TotalAmountAvailable ? 'SAR ' + Number(summary.TotalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Unavailable', '', summary.TotalAmountAvailable ? 'Current Currency conversion rates' : 'A current Currency rate is unavailable'); }
    function open(destination, refresh) { return VMS.Components.VmsHostedInterfaces.open(destination, { onRefresh: refresh }); }
    function RenderRegister() {
        return $.when(VMS.Services.PRPOService.GetRegisterSummary({ includeItems: false }), VMS.Services.PRPOService.GetRegisterFilterOptions(), resolver.ResolveCreateDestination('PRPO_NEW')).then(function (summary, filters, create) {
            if (!summary.ok) { return summary; }
            var tableInstance, refresh = function () { return $.when(VMS.Services.PRPOService.GetRegisterSummary({ includeItems: false }), tableInstance.refresh()).then(function (next) { if (next.ok) { $('#vms-page .vms-cards').html(summaryCards(next.data)); } return next; }); };
            tableInstance = VMS.Components.VmsRegisterPage.mount({ host: '#vms-page', title: 'PR/PO Register', description: 'Manage PR/PO workflow within your authorized scope.', summaryHtml: summaryCards(summary.data), search: { label: 'Search', placeholder: 'Search PR, PO or Vendor' }, filters: filters.ok ? [{ name: 'vendor', label: 'Vendor', options: filters.data.vendors }, { name: 'stage', label: 'Stage', options: filters.data.stages }, { name: 'status', label: 'Status', options: filters.data.statuses }] : [], pageSize: 10, pageActions: create.ok ? [{ label: 'Create New PR', style: 'primary', onClick: function () { open(create.data, refresh); } }] : [], dataSource: refinedRows, columns: [
                { field: 'PRNumber', label: 'PR Number', sortable: true },
                { field: 'VendorNameSnapshot', label: 'Vendor' },
                { field: 'PONumber', label: 'PO Number', formatter: function (value) { return value || '—'; } },
                { field: 'PRAmount', label: 'PR Amount', formatter: function (value, row) { return money(row.CurrencyCode, value); } },
                { field: 'StageCode', label: 'Stage', displayLabelGroup: 'PR_PO_STAGE' },
                { field: 'StatusCode', label: 'Status', displayLabelGroup: 'PR_PO_STATUS', statusBadge: true },
                { label: 'Action', align: 'right', actionRenderer: function (row) { return $.map(row.Actions, function (action) { return { label: action.label, style: action.style, onClick: function () { if (action.destination.interfaceCode) { open(action.destination, refresh); } else { window.location.href = resolver.ToUrl(action.destination); } } }; }); } }
            ] });
            return VMS.Utilities.success({ table: tableInstance, refresh: refresh });
        });
    }

    function basicTable(columns, items) { return VMS.Components.VmsTable(columns, items || []); }
    function RenderPending() {
        return $.when(VMS.Services.PendingApprovalService.GetCounts(), VMS.Services.PendingApprovalService.QueryPRPO({ pageSize: 10 }), VMS.Services.PendingApprovalService.QueryStandardInvoices({ pageSize: 10 }), VMS.Services.PendingApprovalService.QueryDirectPaymentBatches({ pageSize: 10 })).then(function (counts, prs, invoices, batches) {
            if (!counts.ok) { return counts; }
            var actionable = isManager(), destinations = {}, d = $.Deferred(), index = 0;
            function resolveNext() {
                if (index >= prs.data.items.length) { render(); d.resolve(VMS.Utilities.success({ refresh: RenderPending })); return; }
                var row = prs.data.items[index++];
                if (!actionable) { destinations[row.ID] = VMS.Routes.url('PRPO_REGISTER', row.ID, row.PRNumber); resolveNext(); return; }
                resolver.ResolveHostedDestination('PENDING_APPROVALS', { id: row.ID, key: row.PRNumber, interfaceCode: 'PRPO_APPROVAL' }).then(function (destination) { destinations[row.ID] = destination.ok ? resolver.ToUrl(destination.data) : VMS.Routes.url('PRPO_REGISTER', row.ID, row.PRNumber); resolveNext(); });
            }
            function render() {
                var invoiceById = {}, batchByKey = {};
                $.each(invoices.data.items, function (_, row) { invoiceById[row.ID] = row; });
                $.each(batches.data.items, function (_, row) { batchByKey[row.AggregationBatchKey] = row; });
                var prColumns = [{ field: 'PRNumber', label: 'PR Number' }, { field: 'VendorNameSnapshot', label: 'Vendor' }, { field: 'PRAmount', label: 'PR Amount', renderHtml: function (row) { return money(row.CurrencyCode, row.PRAmount); } }, { field: 'StageCode', label: 'Stage / Status', renderHtml: function (row) { return safe(VMS.Services.DisplayLabelService.Resolve(row.StageCode, 'PR_PO_STAGE') + ' / ' + VMS.Services.DisplayLabelService.Resolve(row.StatusCode, 'PR_PO_STATUS')); } }, { label: 'Action', renderHtml: function (row) { return '<a class="btn btn-sm ' + (actionable ? 'btn-vms-pending' : 'btn-outline-secondary') + '" href="' + safe(destinations[row.ID]) + '">' + (actionable ? 'Pending' : 'View') + '</a>'; } }];
                var invoiceColumns = [{ field: 'InvoiceIdentifier', label: 'Invoice Identifier' }, { field: 'VendorNameSnapshot', label: 'Vendor' }, { field: 'FinalInvoiceAmount', label: 'Final Invoice Amount' }, { field: 'CurrencyCodeSnapshot', label: 'Currency' }, { field: 'StageCode', label: 'Stage' }, { label: 'Action', renderHtml: function (row) { var view = '<a class="btn btn-sm btn-outline-secondary" href="' + safe(VMS.Routes.url('INVOICE_DETAILS', row.ID, row.InvoiceIdentifier)) + '">View</a>'; return actionable ? view + ' <button class="btn btn-sm btn-vms-primary" data-invoice-approve="' + row.ID + '">Approve</button> <button class="btn btn-sm btn-vms-pending" data-invoice-update="' + row.ID + '">Update Required</button>' : view; } }];
                var batchColumns = [{ field: 'AggregationBatchKey', label: 'Aggregation Batch Key' }, { field: 'Vendor', label: 'Vendor' }, { field: 'MemberCount', label: 'Member / Invoice Count' }, { field: 'CombinedAmount', label: 'Combined Amount' }, { field: 'Currency', label: 'Currency' }, { label: 'Action', renderHtml: function (row) { var view = '<a class="btn btn-sm btn-outline-secondary" href="' + safe(VMS.Routes.url('INVOICE_REGISTER', row.LeaderID, row.AggregationBatchKey)) + '">View</a>'; return actionable ? view + ' <button class="btn btn-sm btn-vms-primary" data-batch-approve="' + safe(row.AggregationBatchKey) + '">Approve Group</button> <button class="btn btn-sm btn-vms-pending" data-batch-update="' + safe(row.AggregationBatchKey) + '">Update Required Group</button>' : view; } }];
                $('#vms-page').html('<div class="vms-cards">' + VMS.Components.VmsSummaryCard('PR/PO Approvals', counts.data.PRPO, '', 'Pending Manager review') + VMS.Components.VmsSummaryCard('Standard Invoice Approvals', counts.data.StandardInvoice, '', 'Pending Manager approval') + VMS.Components.VmsSummaryCard('Direct Payment Batch Approvals', counts.data.DirectPaymentBatch, '', 'Complete grouped approval units') + VMS.Components.VmsSummaryCard('Total Pending', counts.data.Total, '', 'All authorized approval units') + '</div><section class="vms-panel"><h2>PR/PO Approvals</h2>' + basicTable(prColumns, prs.data.items) + '</section><section class="vms-panel"><h2>Standard Invoice Approvals</h2>' + basicTable(invoiceColumns, invoices.data.items) + '</section><section class="vms-panel"><h2>Direct Payment Batch Approvals</h2>' + basicTable(batchColumns, batches.data.items) + '</section><div id="vms-hosted-modal" class="modal" tabindex="-1"></div>');
                $('#vms-page').off('.phaseCApproval').on('click.phaseCApproval', '[data-invoice-approve]', function () { var row = invoiceById[Number($(this).attr('data-invoice-approve'))]; VMS.Services.InvoiceService.Approve(row.ID, row._etag).then(RenderPending); }).on('click.phaseCApproval', '[data-invoice-update]', function () { var row = invoiceById[Number($(this).attr('data-invoice-update'))], reason = window.prompt('Reason update is required'); if (reason) { VMS.Services.InvoiceService.ReturnForUpdate(row.ID, reason, row._etag).then(RenderPending); } }).on('click.phaseCApproval', '[data-batch-approve]', function () { VMS.Services.DirectPaymentBatchService.ApproveGroup($(this).attr('data-batch-approve')).then(RenderPending); }).on('click.phaseCApproval', '[data-batch-update]', function () { var key = $(this).attr('data-batch-update'), reason = window.prompt('Reason update is required for the complete group'); if (reason) { VMS.Services.DirectPaymentBatchService.ReturnGroup(key, reason).then(RenderPending); } });
            }
            resolveNext(); return d.promise();
        });
    }

    if (VMS.PRPOPages) {
        var oldWorkspace = VMS.PRPOPages.RenderWorkspace;
        VMS.PRPOPages.RenderRegister = RenderRegister;
        VMS.PRPOPages.RenderWorkspace = function (id, key) { return oldWorkspace(id, key).then(function (result) { if (result.ok) { $('#vms-page').prepend(VMS.Components.VmsBackLink('PRPO_REGISTER', 'Back to PR/PO')); $('[data-cancel-line]').text('Cancel Line'); } return result; }); };
    }
    if (VMS.VendorPages) {
        var oldProfile = VMS.VendorPages.RenderProfile;
        VMS.VendorPages.RenderProfile = function (id, key) { return oldProfile(id, key).then(function (result) { if (result.ok) { $('#vms-page').prepend(VMS.Components.VmsBackLink('VENDOR_LIST', 'Back to Vendors')); } return result; }); };
    }
    VMS.PhaseCRefinementPages = { RenderPending: RenderPending, QueryRegister: refinedRows };
}(window.VMS, window.jQuery, window));
