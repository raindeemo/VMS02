(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    function filterControl(code, options) {
        var choices = options.values && options.values[code] ? $.map(options.values[code], function (item) { return { value: item.value, label: /^[A-Z0-9_]+$/.test(item.label) ? VMS.UI.titleize(item.label) : item.label }; }) : null;
        var type = /Date(From|To)$/.test(code) ? "date" : "text";
        return '<div class="col-md-4">' + VMS.UI.field("filter-" + code, VMS.UI.titleize(code.replace(/(From|To)$/, " $1")), choices ? "select" : type, "", false, choices) + "</div>";
    }

    VMS.PageControllers.REPORTS = {
        title: "Reports",
        run: function () {
            var definitions = {};
            var selectedSource = null;
            C.loading("Loading authorized report definitions...");
            VMS.App.reportService.GetDefinition().then(function (rows) {
                var sourceOptions = [];
                $.each(rows, function (_, definition) { definitions[definition.source] = definition; sourceOptions.push({ value: definition.source, label: VMS.UI.titleize(definition.source) }); });
                C.content('<p class="vms-context">Build an authorized Excel export. VMS does not provide a report preview.</p><section class="vms-panel"><div class="form-row"><div class="col-md-6">' + VMS.UI.field("report-source", "Source", "select", "", true, sourceOptions) + '</div></div><div id="report-builder"></div></section>');
                $("#vms-field-report-source").on("change", function () {
                    selectedSource = this.value;
                    if (!selectedSource) { $("#report-builder").empty(); return; }
                    $.when(VMS.App.reportService.GetFilterOptions(selectedSource)).then(function (options) {
                        var definition = definitions[selectedSource];
                        var filters = '<h2 class="vms-subheading">Filters</h2><div class="form-row">';
                        var columns = '<h2 class="vms-subheading">Columns</h2><div class="form-row">';
                        $.each(definition.filters, function (_, code) { filters += filterControl(code, options); });
                        filters += "</div>";
                        $.each(definition.columns, function (_, item) { columns += '<div class="col-md-4"><div class="form-check mb-2"><input class="form-check-input vms-report-column" type="checkbox" id="column-' + U.escapeHtml(item.code) + '" value="' + U.escapeHtml(item.code) + '"' + ($.inArray(item.code, definition.defaultColumns) >= 0 ? " checked" : "") + '><label class="form-check-label" for="column-' + U.escapeHtml(item.code) + '">' + U.escapeHtml(item.label) + "</label></div></div>"; });
                        columns += '</div><div class="vms-info-panel"><strong id="report-count">Result count not calculated.</strong> No row-level preview is generated.</div><div class="text-right"><button id="reset-report" class="btn btn-secondary" type="button">Reset</button> <button id="count-report" class="btn btn-secondary" type="button">Count Results</button> <button id="export-report" class="btn btn-primary" type="button">Export Excel</button></div>';
                        $("#report-builder").html(filters + columns);
                        function parameters() {
                            var filterValues = [];
                            var selectedColumns = [];
                            $.each(definition.filters, function (_, code) { var value = $("#vms-field-filter-" + code).val(); if (value !== "" && value !== null) { if (code === "IsActive" || code === "DirectPayment") { value = value === "true"; } if ($.inArray(code, ["Vendor", "Category", "AssignedCategory", "Currency"]) >= 0) { value = Number(value); } filterValues.push({ code: code, value: value }); } });
                            $(".vms-report-column:checked").each(function () { selectedColumns.push(this.value); });
                            return { filters: filterValues, columns: selectedColumns };
                        }
                        $("#count-report").on("click", function () { var value = parameters(); $("#report-count").text("Calculating authorized count..."); VMS.App.reportService.Count(selectedSource, value.filters).then(function (count) { $("#report-count").text(count + " authorized row" + (count === 1 ? "" : "s") + "."); }, function (error) { $("#report-count").text(error.safeMessage || "Count unavailable."); }); });
                        $("#export-report").on("click", function () { var button = $(this); var value = parameters(); button.prop("disabled", true).text("Generating..."); VMS.App.reportService.Export(selectedSource, value.filters, value.columns).then(function (result) { window.XLSX.writeFile(result.workbook, result.fileName); VMS.UI.toast("success", "Excel export ready", result.rowCount + " authorized rows were exported."); button.prop("disabled", false).text("Export Excel"); }, function (error) { VMS.UI.handleError(error); button.prop("disabled", false).text("Export Excel"); }); });
                        $("#reset-report").on("click", function () { $.each(definition.filters, function (_, code) { $("#vms-field-filter-" + code).val(""); }); $(".vms-report-column").each(function () { this.checked = $.inArray(this.value, definition.defaultColumns) >= 0; }); $("#report-count").text("Result count not calculated."); });
                    }, VMS.UI.handleError);
                });
            }, C.fail);
        }
    };
}(window, window.jQuery));
