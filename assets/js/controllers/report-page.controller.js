(function (VMS, $, window) {
    'use strict';
    var state = { source: null, definition: null, filters: [], columns: [], options: {}, exporting: false, overLimit: false };
    function safe(value) { return VMS.Utilities.safeText(value); }
    function find(items, code) { var found = null; $.each(items || [], function (_, item) { if (item.code === code) { found = item; return false; } }); return found; }
    function filterValue(code) { var item = find(state.filters, code); return item ? item.value : null; }
    function setFilter(code, value) { var next = [], replaced = false; $.each(state.filters, function (_, item) { if (item.code === code) { replaced = true; if (value !== null) { next.push({ code: code, value: value }); } } else { next.push(item); } }); if (!replaced && value !== null) { next.push({ code: code, value: value }); } state.filters = next; }
    function valueLabel(meta, value) {
        var match = null;
        if (meta.type === 'dateRange') { return (value.from || 'Any') + ' to ' + (value.to || 'Any'); }
        $.each(state.options[meta.code] || [], function (_, option) { if (String(option.value) === String(value)) { match = option.label; } });
        return match || String(value);
    }
    function renderSources(sources) {
        var html = '<section class="vms-report-sources" aria-labelledby="vms-report-source-title"><div class="vms-section-heading"><div><h2 id="vms-report-source-title">Choose a Source</h2><p>Only report sources authorized for your role and function are available.</p></div></div><div class="vms-report-source-grid">';
        $.each(sources, function (_, source) { html += '<button type="button" class="vms-report-source' + (state.source === source.code ? ' active' : '') + '" data-report-source="' + safe(source.code) + '" aria-pressed="' + (state.source === source.code ? 'true' : 'false') + '"><span class="vms-report-source-icon" aria-hidden="true">' + safe(source.code === 'SURVEY_QUESTION' ? 'Q' : source.code.charAt(0)) + '</span><span><strong>' + safe(source.label) + '</strong><small>Configure report</small></span></button>'; });
        $('#vms-report-source-host').html(html + '</div></section>');
    }
    function selectOptions(meta) {
        var current = filterValue(meta.code), html = '<option value="">All</option>';
        $.each(state.options[meta.code] || [], function (_, option) { html += '<option value="' + safe(option.value) + '"' + (String(option.value) === String(current) ? ' selected' : '') + '>' + safe(option.label) + '</option>'; });
        return html;
    }
    function renderFilters() {
        var html = '<div class="vms-report-section-header"><div><span class="vms-step-number">2</span><h2>Filters</h2><p>Filter values are limited to the current authorized report scope.</p></div><button type="button" class="btn btn-outline-secondary btn-sm" data-report-reset>Reset / Clear Filters</button></div><div class="vms-report-filter-grid">';
        $.each(state.definition.filters, function (_, meta) {
            var value = filterValue(meta.code), control;
            if (meta.type === 'dateRange') { value = value || {}; control = '<div class="vms-report-date-range"><input type="text" class="form-control" data-report-filter="' + safe(meta.code) + '" data-report-date="from" placeholder="From" value="' + safe(value.from || '') + '"><span>to</span><input type="text" class="form-control" data-report-filter="' + safe(meta.code) + '" data-report-date="to" placeholder="To" value="' + safe(value.to || '') + '"></div>'; }
            else if ($.inArray(meta.type, ['lookup', 'multiLookup', 'code', 'boolean']) >= 0) { control = '<select class="form-control" data-report-filter="' + safe(meta.code) + '" data-report-type="' + safe(meta.type) + '">' + selectOptions(meta) + '</select>'; }
            else { control = '<input type="text" class="form-control" data-report-filter="' + safe(meta.code) + '" data-report-type="text" value="' + safe(value || '') + '" placeholder="Enter ' + safe(meta.label.toLowerCase()) + '">'; }
            html += '<div class="form-group"><label>' + safe(meta.label) + '</label>' + control + '</div>';
        });
        $('#vms-report-filter-host').html(html + '</div><div id="vms-report-active-filters" class="vms-report-active-filters"></div>');
        if (window.flatpickr) { $('#vms-report-filter-host [data-report-date]').each(function () { window.flatpickr(this, { dateFormat: 'Y-m-d', allowInput: true }); }); }
        renderChips();
    }
    function renderChips() {
        var html = state.filters.length ? '<span class="vms-active-label">Active filters</span>' : '<span class="vms-muted-copy">No active filters</span>';
        $.each(state.filters, function (_, item) { var meta = find(state.definition.filters, item.code); html += '<button type="button" class="vms-filter-chip" data-report-remove-filter="' + safe(item.code) + '"><span>' + safe(meta.label + ': ' + valueLabel(meta, item.value)) + '</span><span aria-hidden="true">&times;</span><span class="sr-only">Remove ' + safe(meta.label) + ' filter</span></button>'; });
        $('#vms-report-active-filters').html(html);
    }
    function renderColumns() {
        var html = '<div class="vms-report-section-header"><div><span class="vms-step-number">3</span><h2>Columns</h2><p>Select the authorized fields to include in the Excel Data sheet.</p></div><div class="vms-column-actions"><button type="button" class="btn btn-link btn-sm" data-report-select-all>Select All</button><span aria-hidden="true">|</span><button type="button" class="btn btn-link btn-sm" data-report-unselect-all>Unselect All</button><span class="vms-column-count"><strong data-report-column-count>' + state.columns.length + '</strong> selected</span></div></div><fieldset class="vms-report-columns"><legend class="sr-only">Report columns</legend>';
        $.each(state.definition.columns, function (_, meta) { var checked = $.inArray(meta.code, state.columns) >= 0; html += '<label class="vms-column-option"><input type="checkbox" data-report-column="' + safe(meta.code) + '"' + (checked ? ' checked' : '') + '><span>' + safe(meta.label) + '</span>' + ($.inArray(meta.code, state.definition.defaultColumns) >= 0 ? '<small>Default</small>' : '') + '</label>'; });
        $('#vms-report-column-host').html(html + '</fieldset><div class="vms-column-validation" data-report-column-validation aria-live="polite"></div>');
        updateColumnState();
    }
    function updateColumnState() {
        var empty = state.columns.length === 0;
        $('[data-report-column-count]').text(state.columns.length);
        $('[data-report-export]').prop('disabled', empty || state.exporting || state.overLimit);
        $('[data-report-column-validation]').html(empty ? '<div class="alert alert-danger" role="alert">Select at least one column to export.</div>' : '');
    }
    function renderWorkspace() {
        $('#vms-report-workspace').html('<section class="vms-panel vms-report-config"><div class="vms-report-config-title"><span class="vms-step-number">1</span><div><h2>' + safe(state.definition.label) + ' Report</h2><p>Configure filters and columns, confirm the authorized result count, then export.</p></div></div><div id="vms-report-message" aria-live="polite"></div><section id="vms-report-filter-host" class="vms-report-section"></section><section id="vms-report-column-host" class="vms-report-section"></section><section class="vms-report-export-bar" aria-labelledby="vms-report-count-title"><div class="vms-report-count"><span class="vms-step-number">4</span><div><span id="vms-report-count-title">Authorized Result Count</span><strong data-report-count>—</strong><small>matching records</small></div></div><div class="vms-report-export-action"><span class="vms-step-number">5</span><button type="button" class="btn btn-vms-primary btn-lg" data-report-export><span data-report-export-label>Export Data</span><span class="spinner-border spinner-border-sm ml-2" data-report-export-spinner hidden aria-hidden="true"></span></button><small>.xlsx · Data + Parameters</small></div></section><div id="vms-report-export-state" aria-live="polite"></div></section>');
        renderFilters(); renderColumns();
    }
    function showMessage(result) { $('#vms-report-message').html('<div class="alert alert-danger" role="alert">' + safe(result && result.message || 'The report could not be loaded.') + '</div>'); }
    function refreshAuthorizedState() {
        $('#vms-report-filter-host, #vms-report-column-host').attr('aria-busy', 'true'); $('[data-report-count]').text('…');
        return $.when(VMS.Services.ReportService.GetFilterOptions({ source: state.source, filters: state.filters }), VMS.Services.ReportService.Count({ source: state.source, filters: state.filters })).then(function (options, count) {
            $('#vms-report-filter-host, #vms-report-column-host').removeAttr('aria-busy');
            if (!options.ok) { showMessage(options); return options; }
            if (!count.ok) { showMessage(count); return count; }
            state.options = options.data.options; state.overLimit = count.data.overLimit; $('#vms-report-message').empty(); renderFilters(); $('[data-report-count]').text(count.data.count.toLocaleString('en-US')).toggleClass('vms-over-limit', count.data.overLimit); updateColumnState();
            if (count.data.overLimit) { $('#vms-report-export-state').html('<div class="alert alert-warning">This report contains more than 10,000 rows. Apply additional filters and export again.</div>'); } else { $('#vms-report-export-state').empty(); }
            return count;
        });
    }
    function chooseSource(source) {
        return VMS.Services.ReportService.GetDefinition(source).then(function (result) {
            if (!result.ok) { showMessage(result); return result; }
            state.source = source; state.definition = result.data; state.filters = []; state.columns = result.data.defaultColumns.slice(0); state.options = {}; state.overLimit = false;
            $('[data-report-source]').removeClass('active').attr('aria-pressed', 'false'); $('[data-report-source="' + source + '"]').addClass('active').attr('aria-pressed', 'true'); renderWorkspace(); return refreshAuthorizedState();
        });
    }
    function readChangedFilter(element) {
        var input = $(element), code = input.data('report-filter'), meta = find(state.definition.filters, code), value;
        if (meta.type === 'dateRange') { value = { from: $('[data-report-filter="' + code + '"][data-report-date="from"]').val(), to: $('[data-report-filter="' + code + '"][data-report-date="to"]').val() }; if (!value.from && !value.to) { value = null; } }
        else { value = input.val(); if (value === '') { value = null; } else if (meta.type === 'boolean') { value = value === 'true'; } else if (meta.type === 'lookup' || meta.type === 'multiLookup') { value = Number(value); } }
        setFilter(code, value); return refreshAuthorizedState();
    }
    function setExporting(value) { state.exporting = !!value; $('[data-report-export]').prop('disabled', !!value || !state.columns.length || state.overLimit); $('[data-report-export-spinner]').prop('hidden', !value); $('[data-report-export-label]').text(value ? 'Generating…' : 'Export Data'); $('#vms-report-export-state').attr('data-state', value ? 'busy' : 'idle'); }
    function exportData() {
        var startedAt;
        if (state.exporting) { return; }
        if (!state.columns.length) { updateColumnState(); return; }
        startedAt = new Date().getTime();
        setExporting(true); $('#vms-report-export-state').html('<div class="vms-report-progress"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Generating the authorized workbook…</span></div>').attr('data-state', 'busy');
        VMS.Services.ReportService.Export({ source: state.source, filters: state.filters, columns: state.columns }).then(function (result) {
            window.setTimeout(function () {
                setExporting(false);
                if (!result.ok) { $('#vms-report-export-state').html('<div class="alert alert-danger" role="alert">' + safe(result.message) + ' You can retry without losing this configuration.</div>').attr('data-state', 'error'); return; }
                $('#vms-report-export-state').html('<div class="alert alert-success" role="status"><strong>Export ready.</strong> ' + safe(result.data.fileName) + ' contains ' + safe(result.data.rowCount) + ' data rows.</div>').attr('data-state', 'success');
            }, Math.max(0, 400 - (new Date().getTime() - startedAt)));
        });
    }
    function bind() {
        $('#vms-page').off('.vmsReports').on('click.vmsReports', '[data-report-source]', function () { chooseSource($(this).data('report-source')); }).on('change.vmsReports', '[data-report-filter]', function () { readChangedFilter(this); }).on('click.vmsReports', '[data-report-remove-filter]', function () { setFilter($(this).data('report-remove-filter'), null); refreshAuthorizedState(); }).on('click.vmsReports', '[data-report-reset]', function () { state.filters = []; state.columns = state.definition.defaultColumns.slice(0); renderColumns(); refreshAuthorizedState(); }).on('click.vmsReports', '[data-report-select-all]', function () { state.columns = $.map(state.definition.columns, function (column) { return column.code; }); renderColumns(); }).on('click.vmsReports', '[data-report-unselect-all]', function () { state.columns = []; renderColumns(); }).on('change.vmsReports', '[data-report-column]', function () { var code = $(this).data('report-column'); if (this.checked && $.inArray(code, state.columns) < 0) { state.columns.push(code); } if (!this.checked) { state.columns = $.grep(state.columns, function (item) { return item !== code; }); } updateColumnState(); }).on('click.vmsReports', '[data-report-export]', exportData);
    }
    function Render() {
        state = { source: null, definition: null, filters: [], columns: [], options: {}, exporting: false, overLimit: false };
        $('#vms-page').html('<div class="vms-report-page"><div class="vms-report-hero"><div><p class="vms-eyebrow">Authorized reporting</p><h2>Reports &amp; Export</h2><p>Source <span aria-hidden="true">→</span> Filters <span aria-hidden="true">→</span> Columns <span aria-hidden="true">→</span> Authorized Result Count <span aria-hidden="true">→</span> Excel Export</p></div><span class="vms-report-format">XLSX</span></div><div id="vms-report-source-host"></div><div id="vms-report-workspace"><section class="vms-panel vms-report-placeholder"><span aria-hidden="true">R</span><h2>Select a report Source</h2><p>Your authorized filters, columns, and matching-record count will appear here.</p></section></div></div>');
        bind();
        return VMS.Services.ReportService.GetSources().then(function (result) { if (!result.ok) { VMS.Components.VmsAccessDenied(); return result; } renderSources(result.data); return chooseSource(result.data[0].code).then(function () { return VMS.Utilities.success({ refresh: refreshAuthorizedState }); }); });
    }
    VMS.ReportPages = { Render: Render };
}(window.VMS, window.jQuery, window));
