(function (VMS, $, window, document) {
    'use strict';

    var modalSequence = 0, confirmationSequence = 0, toastSequence = 0;

    function safe(value) { return VMS.Utilities.safeText(value); }
    function resolved(value) { return VMS.Utilities.resolved(value); }
    function visible(definition, row) { return !definition.visible || definition.visible(row) !== false; }
    function displayValue(column, row) {
        var value = row ? row[column.field] : null;
        if (column.formatter) { return column.formatter(value, row); }
        if (column.displayLabelResolver) { return column.displayLabelResolver(value, row); }
        if (column.displayLabelGroup && VMS.Services.DisplayLabelService) { return VMS.Services.DisplayLabelService.Resolve(value, column.displayLabelGroup); }
        if (/Code$/.test(column.field || '') && VMS.Services.DisplayLabelService) { return VMS.Services.DisplayLabelService.ResolveField(column.field, value); }
        if (/(Date|At)$/.test(column.field || '') && value) { return VMS.Utilities.formatDateTime(value); }
        return value;
    }
    function badgeContext(code, supplied) {
        if (supplied) { return typeof supplied === 'function' ? supplied(code) : supplied; }
        if ($.inArray(code, ['APPROVED', 'ACTIVE', 'SETTLED', 'SUCCESS', 'SUBMITTED', 'CLOSED']) >= 0) { return 'success'; }
        if ($.inArray(code, ['REJECTED', 'EXPIRED', 'FAILED']) >= 0) { return 'danger'; }
        if ($.inArray(code, ['IN_PROGRESS', 'PENDING', 'UPDATE_REQUIRED', 'PENDING_GPS', 'MANAGER_REVIEW', 'RECOVERY_REQUIRED']) >= 0) { return 'warning'; }
        return 'secondary';
    }
    function StatusBadge(value, label, context) {
        return '<span class="badge badge-' + safe(badgeContext(value, context)) + ' vms-status-badge">' + safe(label) + '</span>';
    }
    function actionClass(style, label) {
        if (style === 'primary') { return 'btn-vms-primary'; }
        if (style === 'danger') { return 'btn-danger'; }
        if (style === 'pending') { return 'btn-vms-pending'; }
        if (style === 'warning' || style === 'admin' || label === 'Edit') { return 'btn-vms-admin'; }
        return 'btn-outline-secondary';
    }
    function BackLink(routeCode, text) {
        var href = VMS.Routes.url(routeCode);
        return '<a class="vms-back-link" href="' + safe(href) + '"><span aria-hidden="true">&larr;</span><span>' + safe(text || 'Back') + '</span></a>';
    }
    function actionMarkup(action, rowIndex, actionIndex) {
        var label = safe(action.label || 'Action'), css = 'btn btn-sm ' + actionClass(action.style, action.label), attrs = ' data-vms-row-index="' + rowIndex + '" data-vms-action-index="' + actionIndex + '"';
        if (action.href) { return '<a class="' + css + '" href="' + safe(action.href) + '"' + attrs + '>' + label + '</a>'; }
        return '<button class="' + css + '" type="button"' + attrs + (action.disabled ? ' disabled' : '') + '>' + label + '</button>';
    }
    function CategoryChips(values) {
        var items = $.isArray(values) ? values : String(values || '').split(','), html = '';
        $.each(items, function (_, value) { value = $.trim(String(value || '')); if (value) { html += '<span class="vms-category-chip">' + safe(value) + '</span>'; } });
        return html ? '<span class="vms-category-chips">' + html + '</span>' : '<span aria-hidden="true">—</span>';
    }
    function ActivityTimeline(items, options) {
        var rows = (items || []).slice(0, 5), html = '<ol class="vms-activity-timeline">';
        options = options || {};
        if (!rows.length) { return '<div class="vms-table-state vms-table-empty">' + safe(options.emptyMessage || 'No recent activity.') + '</div>'; }
        $.each(rows, function (_, item) {
            var reference = item.href ? '<a href="' + safe(item.href) + '">' + safe(item.reference) + '</a>' : '<span>' + safe(item.reference) + '</span>';
            html += '<li class="vms-activity-event"><span class="vms-activity-node" aria-hidden="true"></span><div class="vms-activity-content"><strong class="vms-activity-title">' + safe(item.action) + '</strong><div class="vms-activity-reference">' + reference + '</div><div class="vms-activity-state">' + safe(item.state) + '</div><time datetime="' + safe(item.date) + '">' + safe(VMS.Utilities.formatDateTime(item.date)) + '</time></div></li>';
        });
        return html + '</ol>';
    }
    function renderCell(column, row, rowIndex, actionMap) {
        var value, link, actions, html = '';
        if (column.renderHtml) { return column.renderHtml(row); }
        if (column.actionRenderer) {
            actions = column.actionRenderer(row) || [];
            $.each(actions, function (actionIndex, action) {
                if (action.visible === false) { return; }
                actionMap[rowIndex + ':' + actionIndex] = action;
                html += actionMarkup(action, rowIndex, actionIndex);
            });
            return html ? '<span class="vms-table-actions">' + html + '</span>' : '<span aria-hidden="true">—</span>';
        }
        value = displayValue(column, row);
        if (column.linkRenderer) {
            link = column.linkRenderer(row, value);
            return link && link.href ? '<a href="' + safe(link.href) + '">' + safe(link.label === undefined ? value : link.label) + '</a>' : safe(value);
        }
        if (column.statusBadge) { return StatusBadge(row[column.field], value, column.badgeContext); }
        if (column.categoryChips) { return CategoryChips(value); }
        return safe(value);
    }
    function activeColumns(columns) {
        return $.grep(columns || [], function (column) { return visible(column, null); });
    }
    function tableMarkup(columns, rows, actionMap) {
        var displayed = activeColumns(columns), html = '<div class="table-responsive"><table class="table table-hover vms-table"><thead><tr>';
        $.each(displayed, function (_, column) {
            var style = column.width ? ' style="width:' + safe(column.width) + '"' : '';
            html += '<th scope="col" class="text-' + safe(column.align || 'left') + '"' + style + '>' + safe(column.label) + '</th>';
        });
        html += '</tr></thead><tbody>';
        $.each(rows || [], function (rowIndex, row) {
            html += '<tr>';
            $.each(displayed, function (_, column) { html += '<td class="text-' + safe(column.align || 'left') + '">' + renderCell(column, row, rowIndex, actionMap) + '</td>'; });
            html += '</tr>';
        });
        return html + '</tbody></table></div>';
    }
    function legacyTable(columns, rows) {
        var actionMap = {}, html;
        if (!rows.length) { return '<div class="table-responsive"><table class="table table-hover vms-table"><thead><tr>' + $.map(activeColumns(columns), function (column) { return '<th scope="col">' + safe(column.label) + '</th>'; }).join('') + '</tr></thead><tbody><tr><td colspan="' + activeColumns(columns).length + '"><div class="vms-table-state vms-table-empty">No records are available.</div></td></tr></tbody></table></div>'; }
        html = tableMarkup(columns, rows, actionMap);
        return html;
    }

    function stateMessage(state, message) {
        var defaults = {
            LOADING: 'Loading records…', EMPTY: 'No authorized records are available.', NO_RESULTS: 'No records match the current search or filters.',
            ERROR: 'Records could not be loaded.', STALE: 'The displayed data changed. Refresh to continue.', RECOVERY: 'This data is temporarily unavailable while recovery is required.'
        };
        return '<div class="vms-table-state vms-table-' + state.toLowerCase().replace('_', '-') + '" role="' + (state === 'ERROR' || state === 'STALE' || state === 'RECOVERY' ? 'alert' : 'status') + '"><span aria-hidden="true">' + (state === 'LOADING' ? '◌' : state === 'EMPTY' || state === 'NO_RESULTS' ? '—' : '!') + '</span><p>' + safe(message || defaults[state] || defaults.ERROR) + '</p></div>';
    }
    function filtersMarkup(filters, values) {
        var html = '';
        $.each(filters || [], function (_, filter) {
            html += '<label class="vms-table-filter"><span>' + safe(filter.label) + '</span><select class="form-control form-control-sm" data-vms-filter="' + safe(filter.name) + '"><option value="">' + safe(filter.allLabel || 'All') + '</option>';
            $.each(filter.options || [], function (_, option) { html += '<option value="' + safe(option.value) + '"' + (String(values[filter.name] || '') === String(option.value) ? ' selected' : '') + '>' + safe(option.label) + '</option>'; });
            html += '</select></label>';
        });
        return html;
    }
    function TableInstance(options) {
        this.options = options || {};
        this.root = null;
        this.rows = [];
        this.actionMap = {};
        this.timer = null;
        this.requestNumber = 0;
        this.query = { search: '', filters: {}, page: 1, pageSize: this.options.pageSize === 25 ? 25 : 10, sort: null };
        this.result = { totalCount: null, continuationToken: null };
        this.tokens = { 1: null };
    }
    TableInstance.prototype.mount = function (host) {
        this.root = $(host);
        this.root.addClass('vms-table-component');
        this.renderFrame();
        this.bind();
        this.refresh();
        return this;
    };
    TableInstance.prototype.renderFrame = function () {
        var search = this.options.search === false ? '' : '<label class="vms-table-search"><span>' + safe((this.options.search && this.options.search.label) || 'Search') + '</span><input class="form-control form-control-sm" type="search" data-vms-search placeholder="' + safe((this.options.search && this.options.search.placeholder) || '') + '"></label>';
        this.root.html('<div class="vms-table-toolbar">' + search + '<div class="vms-table-controls"><div class="vms-table-filters">' + filtersMarkup(this.options.filters, this.query.filters) + '</div>' + (this.options.toolbarHtml || '') + '</div></div><div data-vms-table-content></div><div class="vms-table-pagination" data-vms-pagination></div>');
    };
    TableInstance.prototype.bind = function () {
        var self = this;
        self.root.on('input.vmsTable', '[data-vms-search]', function () {
            window.clearTimeout(self.timer);
            self.timer = window.setTimeout(function () { self.query.search = $(this).val(); self.query.page = 1; self.tokens = { 1: null }; self.refresh(); }.bind(this), 300);
        });
        self.root.on('change.vmsTable', '[data-vms-filter]', function () { self.query.filters[$(this).data('vms-filter')] = $(this).val(); self.query.page = 1; self.tokens = { 1: null }; self.refresh(); });
        self.root.on('change.vmsTable', '[data-vms-page-size]', function () { self.query.pageSize = Number($(this).val()) === 25 ? 25 : 10; self.query.page = 1; self.tokens = { 1: null }; self.refresh(); });
        self.root.on('click.vmsTable', '[data-vms-page]', function () { var page = Number($(this).data('vms-page')); if (page > 0 && Object.prototype.hasOwnProperty.call(self.tokens, page)) { self.query.page = page; self.refresh(); } });
        self.root.on('click.vmsTable', '[data-vms-sort]', function () { var field = $(this).data('vms-sort'), direction = self.query.sort && self.query.sort.field === field && self.query.sort.direction === 'asc' ? 'desc' : 'asc'; self.query.sort = { field: field, direction: direction }; self.query.page = 1; self.tokens = { 1: null }; self.refresh(); });
        self.root.on('click.vmsTable', '[data-vms-action-index]', function (event) {
            var key = $(this).data('vms-row-index') + ':' + $(this).data('vms-action-index'), action = self.actionMap[key];
            if (action && action.onClick) { event.preventDefault(); action.onClick(self.rows[Number($(this).data('vms-row-index'))], self); }
        });
    };
    TableInstance.prototype.renderState = function (state, message) { this.root.find('[data-vms-table-content]').html(stateMessage(state, message)); this.root.find('[data-vms-pagination]').empty(); };
    TableInstance.prototype.renderRows = function () {
        var self = this, columns = activeColumns(self.options.columns), html = '<div class="table-responsive"><table class="table table-hover vms-table"><thead><tr>';
        self.actionMap = {};
        $.each(columns, function (_, column) { var sortable = column.sortable === true; html += '<th scope="col" class="text-' + safe(column.align || 'left') + '">' + (sortable ? '<button type="button" class="vms-sort-button" data-vms-sort="' + safe(column.field) + '">' + safe(column.label) + '</button>' : safe(column.label)) + '</th>'; });
        html += '</tr></thead><tbody>';
        $.each(self.rows, function (rowIndex, row) { html += '<tr>'; $.each(columns, function (_, column) { html += '<td class="text-' + safe(column.align || 'left') + '">' + renderCell(column, row, rowIndex, self.actionMap) + '</td>'; }); html += '</tr>'; });
        html += '</tbody></table></div>';
        self.root.find('[data-vms-table-content]').html(html);
        self.renderPagination();
    };
    TableInstance.prototype.renderPagination = function () {
        var total = this.result.totalCount, page = this.query.page, size = this.query.pageSize, hasNext = total === null ? !!this.result.continuationToken : page * size < total, first = (page - 1) * size + 1, last = total === null ? first + this.rows.length - 1 : Math.min(page * size, total);
        this.root.find('[data-vms-pagination]').html('<span class="vms-page-summary">' + (total === null ? 'Page ' + page : 'Showing ' + first + '–' + last + ' of ' + total) + '</span><span class="vms-page-number">Page ' + page + '</span><label>Rows <select class="form-control form-control-sm" data-vms-page-size><option value="10"' + (size === 10 ? ' selected' : '') + '>10</option><option value="25"' + (size === 25 ? ' selected' : '') + '>25</option></select></label><button type="button" class="btn btn-sm btn-outline-secondary" data-vms-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>Previous</button><button type="button" class="btn btn-sm btn-outline-secondary" data-vms-page="' + (page + 1) + '"' + (!hasNext ? ' disabled' : '') + '>Next</button>');
    };
    TableInstance.prototype.refresh = function () {
        var self = this, request = self.requestNumber + 1, source = self.options.dataSource;
        self.requestNumber = request;
        self.renderState('LOADING');
        if (!source) { self.renderState('ERROR', 'A table data source is not configured.'); return resolved(VMS.Utilities.failure('CONFIGURATION_MISSING', 'A table data source is not configured.')); }
        var providerQuery = $.extend(true, {}, self.query, { continuationToken: self.tokens[self.query.page] || null });
        return source(providerQuery).then(function (result) {
            var data;
            if (request !== self.requestNumber) { return result; }
            if (!result || result.ok === false) {
                if (result && result.code === 'STALE_RECORD') { self.renderState('STALE', result.message); }
                else if (result && $.inArray(result.code, ['RECOVERY_REQUIRED', 'BATCH_LOCKED']) >= 0) { self.renderState('RECOVERY', result.message); }
                else { self.renderState('ERROR', result && result.message); }
                return result;
            }
            data = result.data || result;
            self.rows = data.items || [];
            self.result.totalCount = data.totalCount === undefined ? null : data.totalCount;
            self.result.continuationToken = data.continuationToken || null;
            if (data.continuationToken) { self.tokens[self.query.page + 1] = data.continuationToken; }
            if (!self.rows.length) { self.renderState(self.query.search || Object.keys(self.query.filters).some(function (key) { return !!self.query.filters[key]; }) ? 'NO_RESULTS' : 'EMPTY'); }
            else { self.renderRows(); }
            return result;
        }, function () { if (request === self.requestNumber) { self.renderState('ERROR'); } return VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'Records could not be loaded.'); });
    };
    TableInstance.prototype.setState = function (state, message) { this.renderState(state, message); };
    TableInstance.prototype.getQuery = function () { return $.extend(true, {}, this.query); };
    TableInstance.prototype.destroy = function () { window.clearTimeout(this.timer); if (this.root) { this.root.off('.vmsTable').empty(); } };

    function VmsTable(columns, rows) { return legacyTable(columns || [], rows || []); }
    VmsTable.create = function (options) { return new TableInstance(options); };

    function Toast(options) {
        options = options || {};
        var id = 'vms-toast-' + (++toastSequence), duration = Number(options.duration || 10000), type = $.inArray(options.type, ['success', 'warning', 'error']) >= 0 ? options.type : 'success';
        if (!$('#vms-toast-region').length) { $('body').append('<div id="vms-toast-region" class="vms-toast-region" aria-live="polite" aria-atomic="true"></div>'); }
        $('#vms-toast-region').append('<div id="' + id + '" class="toast vms-toast vms-toast-' + type + '" role="status" data-delay="' + duration + '"><div class="toast-header"><strong class="mr-auto">' + safe(options.title || (type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Error')) + '</strong><button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close"><span aria-hidden="true">&times;</span></button></div><div class="toast-body">' + safe(options.message || '') + '</div></div>');
        $('#' + id).on('hidden.bs.toast', function () { $(this).remove(); }).toast({ delay: duration }).toast('show');
    }

    function Confirmation(options) {
        options = options || {};
        var d = $.Deferred(), id = 'vms-confirm-' + (++confirmationSequence), confirmClass = options.danger ? 'btn-danger' : 'btn-vms-primary';
        $('body').append('<div id="' + id + '" class="modal vms-confirmation" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="' + id + '-title"><div class="modal-dialog modal-dialog-centered" role="document"><div class="modal-content"><div class="modal-header"><h2 class="modal-title" id="' + id + '-title">' + safe(options.title || 'Confirm') + '</h2></div><div class="modal-body"><p>' + safe(options.message || '') + '</p></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-vms-confirm-cancel>' + safe(options.cancelLabel || 'Cancel') + '</button><button type="button" class="btn ' + confirmClass + '" data-vms-confirm-ok>' + safe(options.confirmLabel || 'Confirm') + '</button></div></div></div></div>');
        $('#' + id).on('click', '[data-vms-confirm-ok]', function () { d.resolve(true); $('#' + id).modal('hide'); }).on('click', '[data-vms-confirm-cancel]', function () { d.resolve(false); $('#' + id).modal('hide'); }).on('hidden.bs.modal', function () { if (d.state() === 'pending') { d.resolve(false); } $(this).remove(); }).modal({ backdrop: 'static', keyboard: false, show: true });
        return d.promise();
    }

    function safeError(result) {
        var messages = {
            ACCESS_DENIED: 'You are no longer authorized for this operation.', INVALID_STAGE: 'This operation is no longer available in the current workflow stage.',
            INVALID_LINK: 'The requested link is invalid.', NOT_FOUND_OR_UNAUTHORIZED: 'The requested record was not found or is not authorized.',
            STALE_RECORD: 'The record changed after it was opened. Refresh before continuing.', RECOVERY_REQUIRED: 'This operation is unavailable while controlled recovery is required.',
            BATCH_LOCKED: 'This operation is temporarily unavailable because the batch is locked.', SERVICE_UNAVAILABLE: 'The requested interface is currently unavailable.'
        };
        return messages[result && result.code] || (result && result.message) || 'The operation could not be completed.';
    }
    function ModalHost() { this.current = null; }
    ModalHost.prototype.ensureHost = function () { if (!$('#vms-hosted-modal').length) { $('body').append('<div id="vms-hosted-modal" class="modal" tabindex="-1" aria-hidden="true"></div>'); } return $('#vms-hosted-modal'); };
    ModalHost.prototype.open = function (options) {
        var self = this, host = self.ensureHost(), id = 'vms-modal-' + (++modalSequence), body = options.renderBody ? options.renderBody(options) : (options.content || ''), secondary = options.secondaryActions || [], footer = '';
        if (self.current) { self.close(true); }
        $.each(secondary, function (index, action) { footer += '<button type="button" class="btn ' + actionClass(action.style) + '" data-vms-secondary="' + index + '">' + safe(action.label) + '</button>'; });
        footer = '<button type="button" class="btn btn-outline-secondary" data-vms-modal-close>' + safe(options.cancelLabel || 'Cancel') + '</button>' + footer + (options.primaryAction ? '<button type="button" class="btn btn-vms-primary" data-vms-primary><span data-vms-primary-label>' + safe(options.primaryAction.label || 'Save') + '</span><span class="spinner-border spinner-border-sm ml-2" data-vms-submit-spinner hidden aria-hidden="true"></span></button>' : '');
        host.html('<div class="modal-dialog ' + (options.size === 'wide' ? 'modal-xl vms-modal-wide' : 'modal-lg') + ' modal-dialog-scrollable" role="document"><div class="modal-content"><div class="modal-header"><h2 class="modal-title" id="' + id + '-title">' + safe(options.title || 'VMS') + '</h2><button type="button" class="close" data-vms-modal-close aria-label="Close"><span aria-hidden="true">&times;</span></button></div><div class="modal-body"><div data-vms-modal-message></div><div data-vms-validation></div><div data-vms-modal-body>' + (typeof body === 'string' ? body : body && body.html || '') + '</div></div><div class="modal-footer">' + footer + '</div></div></div>');
        self.current = { options: options, host: host, dirty: false, submitting: false, id: id };
        host.attr({ 'aria-labelledby': id + '-title', 'data-interface-code': options.interfaceCode || '', 'data-entity-type': options.entityType || '', 'data-entity-id': options.id || '', 'data-entity-key': options.key || '', 'data-mode': options.mode || '' });
        host.off('.vmsModalHost').on('click.vmsModalHost', '[data-vms-modal-close]', function () { self.close(false); }).on('change.vmsModalHost input.vmsModalHost', 'input,select,textarea', function () { self.markDirty(); self.clearField($(this).attr('name')); }).on('click.vmsModalHost', '[data-vms-primary]', function () { self.submit(); }).on('click.vmsModalHost', '[data-vms-secondary]', function () { var action = secondary[Number($(this).data('vms-secondary'))]; if (action && action.onClick) { action.onClick(self.api()); } });
        $(document).off('keydown.vmsModalHost').on('keydown.vmsModalHost', function (event) { if (event.keyCode === 27 && self.current) { event.preventDefault(); self.close(false); } });
        $(window).off('beforeunload.vmsModalHost').on('beforeunload.vmsModalHost', function () { if (self.current && self.current.dirty) { return 'Unsaved changes will be discarded.'; } });
        host.on('hide.bs.modal.vmsModalHost', function (event) { if (self.current && self.current.dirty && !self.current.forceClosing) { event.preventDefault(); self.close(false); } }).on('hidden.bs.modal.vmsModalHost', function () { self.cleanup(); });
        host.modal({ backdrop: 'static', keyboard: false, show: true });
        if (body && body.onMount) { body.onMount(self.api(), host.find('[data-vms-modal-body]')); }
        if (options.loading) { self.setLoading(true); }
        return self.api();
    };
    ModalHost.prototype.api = function () { var self = this; return { close: function (force) { return self.close(force); }, completeSuccess: function (result, message) { return self.completeSuccess(result, message); }, markDirty: function () { self.markDirty(); }, markClean: function () { self.markClean(); }, setLoading: function (value) { self.setLoading(value); }, setSubmitting: function (value) { self.setSubmitting(value); }, showValidation: function (result) { self.showValidation(result); }, showError: function (result) { self.showError(result); }, clearField: function (name) { self.clearField(name); }, clearValidation: function () { self.clearValidation(); }, submit: function () { return self.submit(); }, getState: function () { return self.current ? { dirty: self.current.dirty, submitting: self.current.submitting, interfaceCode: self.current.options.interfaceCode } : null; } }; };
    ModalHost.prototype.markDirty = function () { if (this.current) { this.current.dirty = true; } };
    ModalHost.prototype.markClean = function () { if (this.current) { this.current.dirty = false; } };
    ModalHost.prototype.setLoading = function (value) { if (!this.current) { return; } this.current.host.find('[data-vms-modal-body]').attr('aria-busy', value ? 'true' : 'false'); if (value) { this.current.host.find('[data-vms-modal-body]').html(stateMessage('LOADING')); } };
    ModalHost.prototype.setSubmitting = function (value) { if (!this.current) { return; } this.current.submitting = !!value; this.current.host.find('[data-vms-primary],[data-vms-secondary],[data-vms-modal-close]').prop('disabled', !!value); this.current.host.find('[data-vms-submit-spinner]').prop('hidden', !value); };
    ModalHost.prototype.clearField = function (name) { if (!this.current || !name) { return; } var source = this.current.host.find('[name="' + name.replace(/"/g, '') + '"]').first(), validationName = source.attr('data-vms-validation-name') || name, field = this.current.host.find('[name="' + String(validationName).replace(/"/g, '') + '"]'), region = this.current.host.find('[data-vms-validation-field="' + String(validationName).replace(/"/g, '') + '"]'); field.removeClass('is-invalid').removeAttr('aria-invalid'); field.siblings('[data-vms-field-error]').remove(); region.removeClass('vms-field-invalid').removeAttr('aria-invalid').find('[data-vms-field-error]').remove(); };
    ModalHost.prototype.clearValidation = function () { if (!this.current) { return; } this.current.host.find('[data-vms-validation]').empty(); this.current.host.find('.is-invalid').removeClass('is-invalid').removeAttr('aria-invalid'); this.current.host.find('.vms-field-invalid').removeClass('vms-field-invalid').removeAttr('aria-invalid'); this.current.host.find('[data-vms-field-error]').remove(); };
    ModalHost.prototype.showValidation = function (result) {
        var self = this, errors = result && result.fieldErrors || [], unplaced = [], placed = {};
        if (!self.current) { return; }
        self.clearValidation();
        $.each(errors, function (_, error) { var name = String(error.field || '').replace(/"/g, ''), field, region; if (name && placed[name]) { return; } if (name) { placed[name] = true; } field = self.current.host.find('[name="' + name + '"]').first(); region = self.current.host.find('[data-vms-validation-field="' + name + '"]').first(); if (field.length) { field.addClass('is-invalid').attr('aria-invalid', 'true').after('<div class="invalid-feedback" data-vms-field-error>' + safe(error.message) + '</div>'); } else if (region.length) { region.addClass('vms-field-invalid').attr('aria-invalid', 'true').append('<div class="invalid-feedback d-block" data-vms-field-error>' + safe(error.message) + '</div>'); } else { unplaced.push(error); } });
        if (!errors.length || unplaced.length) { self.current.host.find('[data-vms-validation]').html(VMS.Components.VmsValidationSummary(errors.length ? unplaced : [{ message: safeError(result) }])); }
        self.current.host.find('.is-invalid').first().focus();
    };
    ModalHost.prototype.showError = function (result) { if (!this.current) { return; } var css = result && result.code === 'STALE_RECORD' ? 'warning' : 'danger'; this.current.host.find('[data-vms-modal-message]').html('<div class="alert alert-' + css + '" role="alert" data-error-code="' + safe(result && result.code || 'ERROR') + '">' + safe(safeError(result)) + '</div>'); };
    ModalHost.prototype.completeSuccess = function (result, message) { var refresh = this.current && this.current.options.onRefresh; this.markClean(); this.close(true); Toast({ type: 'success', message: message || (result && result.message) || 'The operation completed successfully.' }); return $.when(refresh ? refresh(result) : true).then(function () { return result; }); };
    ModalHost.prototype.submit = function () {
        var self = this, action, request;
        if (!self.current || self.current.submitting || !self.current.options.primaryAction) { return resolved(VMS.Utilities.failure('UNSUPPORTED_OPERATION', 'Submission is not available.')); }
        action = self.current.options.primaryAction;
        self.clearValidation(); self.current.host.find('[data-vms-modal-message]').empty(); self.setSubmitting(true);
        try { request = action.onExecute ? action.onExecute(self.api()) : VMS.Utilities.failure('CONFIGURATION_MISSING', 'Submission is not configured.'); }
        catch (error) { request = VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The operation could not be completed.'); }
        if (!request || !request.then) { request = resolved(request); }
        return request.then(function (result) {
            if (!result || !result.ok) {
                self.setSubmitting(false);
                if (result && result.cancelled) { return result; }
                if (result && (result.code === 'VALIDATION_FAILED' || result.code === 'ATTACHMENT_INVALID')) { self.showValidation(result); }
                else { self.showError(result || VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The operation could not be completed.')); }
                return result;
            }
            self.markClean();
            return $.when(self.current.options.onSuccess ? self.current.options.onSuccess(result, self.api()) : true).then(function () {
                var refresh = self.current && self.current.options.onRefresh;
                self.close(true);
                Toast({ type: 'success', message: (result.message || action.successMessage || 'The operation completed successfully.') });
                $.each(result.warnings || [], function (_, warning) { Toast({ type: 'warning', message: warning.message }); });
                return $.when(refresh ? refresh(result) : true).then(function () { return result; });
            });
        }, function () { self.setSubmitting(false); self.showError(VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The operation could not be completed.')); return VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The operation could not be completed.'); });
    };
    ModalHost.prototype.close = function (force) {
        var self = this, d = $.Deferred();
        if (!self.current) { d.resolve(true); return d.promise(); }
        if (self.current.submitting && !force) { d.resolve(false); return d.promise(); }
        if (self.current.dirty && !force) {
            return Confirmation({ title: 'Discard changes?', message: 'Your unsaved changes will be discarded.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }).then(function (confirmed) { return confirmed ? self.close(true) : false; });
        }
        self.current.forceClosing = true;
        self.current.host.modal('hide');
        d.resolve(true);
        return d.promise();
    };
    ModalHost.prototype.cleanup = function () { var closed = this.current; $(document).off('keydown.vmsModalHost'); $(window).off('beforeunload.vmsModalHost'); if (closed) { closed.host.off('.vmsModalHost').empty().removeAttr('data-interface-code data-entity-type data-entity-id data-entity-key data-mode aria-labelledby'); if (closed.options.onClose) { closed.options.onClose(); } } this.current = null; };

    var modalHost = new ModalHost(), hostedFactories = {};
    var HostedInterfaces = {
        register: function (interfaceCode, factory) { hostedFactories[interfaceCode] = factory; },
        unregister: function (interfaceCode) { delete hostedFactories[interfaceCode]; },
        open: function (destination, hostOptions) {
            var factory = hostedFactories[destination.interfaceCode], options;
            hostOptions = hostOptions || {};
            if (!factory) { return resolved(VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The authorized interface is not available in the current build.')); }
            options = factory(destination, hostOptions);
            if (!options) { return resolved(VMS.Utilities.failure('SERVICE_UNAVAILABLE', 'The authorized interface is not available in the current build.')); }
            options.interfaceCode = destination.interfaceCode; options.entityType = destination.entityType; options.id = destination.id; options.key = destination.key; options.mode = destination.mode; options.onRefresh = options.onRefresh || hostOptions.onRefresh; options.onClose = options.onClose || hostOptions.onClose;
            if ($(document.body).data('route') === destination.routeCode && window.history && window.history.pushState) { var targetUrl = VMS.Services.DestinationResolverService.ToUrl(destination), baseUrl = destination.routeCode === 'VENDOR_PROFILE' ? VMS.Routes.url(destination.routeCode, destination.id, destination.key) : VMS.Routes.url(destination.routeCode), previousClose = options.onClose; if (targetUrl && window.location.pathname.split('/').pop() + window.location.search !== targetUrl) { window.history.pushState({ interfaceCode: destination.interfaceCode }, '', targetUrl); } options.onClose = function () { var restoreUrl = options.baseUrl || hostOptions.baseUrl || baseUrl; if (restoreUrl) { window.history.replaceState({}, '', restoreUrl); } if (previousClose) { previousClose(); } }; }
            return resolved(VMS.Utilities.success(modalHost.open(options)));
        }
    };

    function RegisterPage(options) {
        var host = $(options.host || '#vms-page'), actions = $.grep(options.pageActions || [], function (action) { return action.visible !== false; }), actionHtml = '', intro = options.title ? '<div class="vms-register-intro"><h2>' + safe(options.title) + '</h2>' + (options.description ? '<p>' + safe(options.description) + '</p>' : '') + '</div>' : '';
        $.each(actions, function (index, action) {
            var label = safe(action.label || 'Action'), css = 'btn btn-sm ' + actionClass(action.style), attrs = ' data-vms-page-action-index="' + index + '"';
            actionHtml += action.href ? '<a class="' + css + '" href="' + safe(action.href) + '"' + attrs + '>' + label + '</a>' : '<button class="' + css + '" type="button"' + attrs + (action.disabled ? ' disabled' : '') + '>' + label + '</button>';
        });
        host.html('<div class="vms-register-heading">' + intro + '<div class="vms-cards">' + (options.summaryHtml || '') + '</div></div><section class="vms-panel vms-register-panel"><div data-vms-register-table></div></section><div id="vms-hosted-modal" class="modal" tabindex="-1" aria-hidden="true"></div>');
        host.on('click.vmsRegister', '.vms-register-actions [data-vms-page-action-index]', function (event) { var action = actions[Number($(this).attr('data-vms-page-action-index'))]; if (action && action.onClick) { event.preventDefault(); action.onClick(); } });
        return VmsTable.create({ columns: options.columns, dataSource: options.dataSource, search: options.search, filters: options.filters || [], pageSize: options.pageSize || 10, toolbarHtml: actionHtml ? '<div class="vms-register-actions vms-register-action-slot">' + actionHtml + '</div>' : '' }).mount(host.find('[data-vms-register-table]'));
    }

    function DetailsAccordion(options) {
        options = options || {};
        var id = options.id || ('vms-details-' + (++modalSequence)), expanded = options.expanded !== false;
        return '<section class="vms-details-accordion' + (expanded ? ' is-open' : '') + '" data-vms-details-accordion>' +
            '<button type="button" class="vms-details-accordion-toggle" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="' + safe(id) + '" data-vms-accordion-toggle>' +
            '<span>' + safe(options.title || 'Details') + '</span><span aria-hidden="true">⌄</span></button>' +
            '<div id="' + safe(id) + '" class="vms-details-accordion-panel"' + (expanded ? '' : ' hidden') + '>' + (options.content || '') + '</div></section>';
    }
    function BindDetailsAccordions(root) {
        $(root).off('click.vmsAccordion').on('click.vmsAccordion', '[data-vms-accordion-toggle]', function () {
            var button = $(this), section = button.closest('[data-vms-details-accordion]'), open = button.attr('aria-expanded') === 'true';
            button.attr('aria-expanded', open ? 'false' : 'true'); section.toggleClass('is-open', !open); section.find('> .vms-details-accordion-panel').prop('hidden', open);
        });
        BindAuthorizedAttachmentLinks(root);
    }
    function InlineDetailsGrid(items) {
        var html = '<dl class="vms-inline-details-grid">';
        $.each(items || [], function (_, item) {
            html += '<div class="vms-inline-detail"><dt>' + safe(item.label) + ':</dt><dd>' + (item.valueHtml !== undefined ? item.valueHtml : safe(item.value)) + '</dd></div>';
        });
        return html + '</dl>';
    }
    function AuthorizedAttachmentLinks(invoiceId, attachments) {
        var html = '<span class="vms-authorized-attachments">';
        $.each(attachments || [], function (index, attachment) { html += '<a href="#" target="_blank" rel="noopener noreferrer" data-vms-invoice-attachment="' + safe(index) + '" data-vms-invoice-id="' + safe(invoiceId) + '">' + safe(attachment.name) + '</a>'; });
        return html + '</span>';
    }
    function BindAuthorizedAttachmentLinks(root) {
        $(root).off('click.vmsAttachment').on('click.vmsAttachment', '[data-vms-invoice-attachment]', function (event) {
            var link = $(this), pending = window.open('about:blank', '_blank');
            event.preventDefault();
            if (pending) { pending.opener = null; }
            VMS.Services.AttachmentService.ResolveAuthorizedRead('INVOICE', Number(link.attr('data-vms-invoice-id')), Number(link.attr('data-vms-invoice-attachment'))).then(function (result) {
                if (!result.ok) { if (pending) { pending.close(); } Toast({ type: 'error', message: 'The attachment is not available or is no longer authorized.' }); return; }
                if (pending) { pending.location = result.data.url; }
                else { window.open(result.data.url, '_blank', 'noopener'); }
            });
        });
    }
    function ViewTabs(options) {
        options = options || {};
        var html = '<div class="vms-view-tabs" role="tablist">';
        $.each(options.items || [], function (index, item) { html += '<button type="button" class="vms-view-tab' + (index === (options.activeIndex || 0) ? ' active' : '') + '" role="tab" aria-selected="' + (index === (options.activeIndex || 0) ? 'true' : 'false') + '" data-vms-view-tab="' + index + '">' + safe(item.label) + (item.count === undefined ? '' : ' <span class="vms-view-tab-count">' + safe(item.count) + '</span>') + '</button>'; });
        return html + '</div><div data-vms-view-tab-panel></div>';
    }

    function SearchableMultiSelect(options) {
        this.options = options || {};
        this.host = null;
        this.items = (this.options.items || []).slice(0);
        this.selected = {};
        this.timer = null;
        $.each(this.options.selected || [], $.proxy(function (_, value) { this.selected[String(value)] = true; }, this));
    }
    SearchableMultiSelect.prototype.mount = function (host) {
        this.host = $(host);
        this.render();
        this.bind();
        return this;
    };
    SearchableMultiSelect.prototype.filteredItems = function (term) {
        var normalized = VMS.Utilities.normalize(term || '');
        return $.grep(this.items, function (item) { return !normalized || VMS.Utilities.normalize((item.label || '') + ' ' + (item.searchText || '')).indexOf(normalized) >= 0; });
    };
    SearchableMultiSelect.prototype.renderOptions = function (term) {
        var self = this, items = self.filteredItems(term), html = '';
        $.each(items, function (_, item) { var key = String(item.value); html += '<label class="vms-multi-option" tabindex="-1"><input type="checkbox" value="' + safe(key) + '"' + (self.selected[key] ? ' checked' : '') + '> <span>' + safe(item.label) + '</span></label>'; });
        self.host.find('[data-vms-multi-options]').html(html || '<div class="vms-multi-empty">No matching Vendors.</div>');
    };
    SearchableMultiSelect.prototype.renderSelected = function () {
        var self = this, selectedItems = $.grep(self.items, function (item) { return !!self.selected[String(item.value)]; }), html = '';
        $.each(selectedItems, function (_, item) { html += '<span class="vms-multi-chip">' + safe(item.label) + '<button type="button" aria-label="Remove ' + safe(item.label) + '" data-vms-multi-remove="' + safe(item.value) + '">×</button></span>'; });
        self.host.find('[data-vms-multi-selected]').html(html || '<span class="vms-multi-placeholder">Search / Select Vendors…</span>');
        self.host.find('[data-vms-multi-count]').text(selectedItems.length ? selectedItems.length + ' selected' : 'None selected');
    };
    SearchableMultiSelect.prototype.render = function () {
        var id = this.options.id || ('vms-multi-' + (++modalSequence)), labelledBy = this.host.attr('aria-labelledby'), labelAttribute = labelledBy ? ' aria-labelledby="' + safe(labelledBy) + '"' : ' aria-label="' + safe(this.options.ariaLabel || 'Select options') + '"';
        this.host.addClass('vms-searchable-multi').html('<button type="button" class="vms-multi-trigger"' + labelAttribute + ' aria-haspopup="listbox" aria-expanded="false" aria-controls="' + safe(id) + '"><span data-vms-multi-selected></span><span data-vms-multi-count></span><span aria-hidden="true">⌄</span></button><div id="' + safe(id) + '" class="vms-multi-menu" hidden><label class="sr-only" for="' + safe(id) + '-search">Search Vendors</label><input id="' + safe(id) + '-search" class="form-control form-control-sm" type="search" placeholder="Search by Vendor Name or Code" data-vms-multi-search><div class="vms-multi-options" role="listbox" aria-multiselectable="true" data-vms-multi-options></div></div>');
        this.renderSelected(); this.renderOptions('');
    };
    SearchableMultiSelect.prototype.open = function () { this.host.find('.vms-multi-menu').prop('hidden', false); this.host.find('.vms-multi-trigger').attr('aria-expanded', 'true'); this.host.find('[data-vms-multi-search]').trigger('focus'); };
    SearchableMultiSelect.prototype.close = function () { this.host.find('.vms-multi-menu').prop('hidden', true); this.host.find('.vms-multi-trigger').attr('aria-expanded', 'false').trigger('focus'); };
    SearchableMultiSelect.prototype.notify = function () { if (this.options.onChange) { this.options.onChange(this.getValue()); } };
    SearchableMultiSelect.prototype.bind = function () {
        var self = this;
        self.host.off('.vmsMulti').on('click.vmsMulti', '.vms-multi-trigger', function () { if ($(this).attr('aria-expanded') === 'true') { self.close(); } else { self.open(); } }).on('keydown.vmsMulti', '.vms-multi-trigger', function (event) { if ($.inArray(event.key, ['Enter', ' ', 'ArrowDown']) >= 0) { event.preventDefault(); self.open(); } }).on('input.vmsMulti', '[data-vms-multi-search]', function () { var input = this; window.clearTimeout(self.timer); self.timer = window.setTimeout(function () { self.renderOptions($(input).val()); }, 300); }).on('keydown.vmsMulti', '[data-vms-multi-search]', function (event) { if (event.key === 'ArrowDown') { event.preventDefault(); self.host.find('.vms-multi-option').first().trigger('focus'); } else if (event.key === 'Escape') { self.close(); } }).on('keydown.vmsMulti', '.vms-multi-option', function (event) { var options = self.host.find('.vms-multi-option'), index = options.index(this); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); options.eq(event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : Math.max(index - 1, 0)).trigger('focus'); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $(this).find('input').trigger('click'); } else if (event.key === 'Escape') { self.close(); } }).on('change.vmsMulti', '.vms-multi-option input', function () { self.selected[String(this.value)] = this.checked; self.renderSelected(); self.notify(); }).on('click.vmsMulti', '[data-vms-multi-remove]', function (event) { event.stopPropagation(); delete self.selected[String($(this).attr('data-vms-multi-remove'))]; self.renderSelected(); self.renderOptions(self.host.find('[data-vms-multi-search]').val()); self.notify(); });
        $(document).off('click.vmsMulti.' + self.host.attr('id')).on('click.vmsMulti.' + self.host.attr('id'), function (event) { if (!self.host.is(event.target) && !self.host.has(event.target).length) { self.host.find('.vms-multi-menu').prop('hidden', true); self.host.find('.vms-multi-trigger').attr('aria-expanded', 'false'); } });
    };
    SearchableMultiSelect.prototype.getValue = function () { var self = this; return $.map(self.items, function (item) { return self.selected[String(item.value)] ? item.value : null; }); };
    SearchableMultiSelect.prototype.setItems = function (items) { var self = this, valid = {}; self.items = (items || []).slice(0); $.each(self.items, function (_, item) { valid[String(item.value)] = true; }); $.each(self.selected, function (key) { if (!valid[key]) { delete self.selected[key]; } }); self.renderSelected(); self.renderOptions(self.host.find('[data-vms-multi-search]').val()); self.notify(); return self; };
    SearchableMultiSelect.prototype.destroy = function () { window.clearTimeout(this.timer); if (this.host) { this.host.off('.vmsMulti').empty().removeClass('vms-searchable-multi'); } };

    VMS.Components.VmsStatusBadge = StatusBadge;
    VMS.Components.VmsCategoryChips = CategoryChips;
    VMS.Components.VmsActivityTimeline = ActivityTimeline;
    VMS.Components.VmsBackLink = BackLink;
    VMS.Components.VmsTable = VmsTable;
    VMS.Components.VmsToast = { show: Toast };
    VMS.Components.VmsConfirmation = { open: Confirmation };
    VMS.Components.VmsModalHost = modalHost;
    VMS.Components.VmsHostedInterfaces = HostedInterfaces;
    VMS.Components.VmsRegisterPage = { mount: RegisterPage };
    VMS.Components.VmsDetailsAccordion = { render: DetailsAccordion, bind: BindDetailsAccordions };
    VMS.Components.VmsInlineDetailsGrid = { render: InlineDetailsGrid };
    VMS.Components.VmsAuthorizedAttachmentLinks = { render: AuthorizedAttachmentLinks, bind: BindAuthorizedAttachmentLinks };
    VMS.Components.VmsViewTabs = { render: ViewTabs };
    VMS.Components.VmsSearchableMultiSelect = { create: function (options) { return new SearchableMultiSelect(options); } };
}(window.VMS, window.jQuery, window, document));
