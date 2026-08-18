(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var U = VMS.Utilities;

    function titleize(value) {
        return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function (character) { return character.toUpperCase(); });
    }

    VMS.UI = {
        escape: U.escapeHtml,
        titleize: titleize,
        status: function (code) {
            var css = String(code || "").toLowerCase().replace(/_/g, "-");
            return '<span class="vms-status vms-status-' + U.escapeHtml(css) + '">' + U.escapeHtml(titleize(code)) + '</span>';
        },
        lookup: function (value) {
            return value && typeof value === "object" ? (value.title || value.email || "") : (value || "");
        },
        money: function (value, currency) {
            if (value === null || value === undefined || value === "") { return "Not available"; }
            return U.escapeHtml((currency ? currency + " " : "") + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        },
        date: function (value) {
            return value ? U.escapeHtml(VMS.ClockService.formatRiyadh(value, false)) : "Not available";
        },
        summaryCards: function (cards) {
            var html = '<div class="vms-card-row">';
            $.each(cards, function (_, card) {
                html += '<section class="vms-summary-card ' + U.escapeHtml(card.className || "") + '"><h2 class="vms-card-title">' + U.escapeHtml(card.label) + '</h2><p class="vms-card-value">' + U.escapeHtml(card.value === null || card.value === undefined ? "No Data" : card.value) + '</p>';
                if (card.link) { html += '<a class="vms-card-link" href="' + U.escapeHtml(card.link.url) + '">' + U.escapeHtml(card.link.label) + '</a>'; }
                html += '</section>';
            });
            return html + '</div>';
        },
        keyValues: function (items) {
            var html = '<div class="vms-kv">';
            $.each(items, function (_, item) { html += '<div class="vms-kv-item"><span class="vms-kv-label">' + U.escapeHtml(item.label) + '</span><span class="vms-kv-value">' + (item.html ? item.value : U.escapeHtml(item.value === null || item.value === undefined || item.value === "" ? "Not available" : item.value)) + '</span></div>'; });
            return html + '</div>';
        },
        toast: function (type, title, message, link) {
            var region = $("#vms-toast-region");
            var id = "vms-toast-" + U.guid();
            var role = type === "error" ? "alert" : "status";
            var html = '<div id="' + id + '" class="vms-toast vms-toast-' + U.escapeHtml(type) + '" role="' + role + '"><p class="vms-toast-title">' + U.escapeHtml(title) + '</p><p>' + U.escapeHtml(message) + '</p>';
            if (link) { html += '<p><a href="' + U.escapeHtml(link.url) + '">' + U.escapeHtml(link.label) + '</a></p>'; }
            html += '</div>';
            region.append(html);
            window.setTimeout(function () { $("#" + id).fadeOut(250, function () { $(this).remove(); }); }, VMS.Config.TOAST_DURATION_MS);
        },
        handleError: function (error) {
            VMS.UI.toast("error", "Action unavailable", error && error.safeMessage ? error.safeMessage : "The requested operation could not be completed.");
        },
        handleResponse: function (response) {
            if (!response || !response.ok) { VMS.UI.handleError(response); return false; }
            VMS.UI.toast(response.warnings && response.warnings.length ? "warning" : "success", response.warnings && response.warnings.length ? "Completed with warning" : "Completed", response.message, response.destination ? { label: "Open", url: response.destination.url } : null);
            return true;
        },
        confirm: function (options) {
            var deferred = $.Deferred();
            var modal = $(
                '<div class="modal fade" tabindex="-1" role="dialog" aria-modal="true">' +
                '<div class="modal-dialog" role="document"><div class="modal-content">' +
                '<div class="modal-header"><h2 class="modal-title">' + U.escapeHtml(options.title || "Confirm action") + '</h2><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button></div>' +
                '<div class="modal-body"><p>' + U.escapeHtml(options.message) + '</p></div>' +
                '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button><button type="button" class="btn ' + (options.danger ? "btn-danger" : "btn-primary") + ' vms-confirm-action">' + U.escapeHtml(options.actionLabel || "Confirm") + '</button></div>' +
                '</div></div></div>');
            $("body").append(modal);
            modal.on("shown.bs.modal", function () { modal.find(".modal-title").attr("tabindex", "-1").focus(); });
            modal.on("hidden.bs.modal", function () { modal.remove(); deferred.reject({ cancelled: true }); });
            modal.find(".vms-confirm-action").on("click", function () { modal.off("hidden.bs.modal"); modal.modal("hide"); modal.on("hidden.bs.modal", function () { modal.remove(); deferred.resolve(true); }); });
            modal.modal({ backdrop: "static", keyboard: true });
            return deferred.promise();
        },
        modalForm: function (options) {
            var deferred = $.Deferred();
            var modal = $('<div class="modal fade" tabindex="-1" role="dialog" aria-modal="true"><div class="modal-dialog ' + U.escapeHtml(options.size || "") + '" role="document"><div class="modal-content"><div class="modal-header"><h2 class="modal-title">' + U.escapeHtml(options.title) + '</h2><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button></div><form novalidate><div class="modal-body"><div class="vms-validation-summary d-none" tabindex="-1"></div>' + options.bodyHtml + '</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">' + U.escapeHtml(options.submitLabel || "Save") + '</button></div></form></div></div></div>');
            $("body").append(modal);
            if (options.onReady) { options.onReady(modal, modal.find("form")); }
            modal.on("shown.bs.modal", function () { var control = modal.find("input,select,textarea,button").filter(":visible").first(); control.focus(); });
            modal.on("hidden.bs.modal", function () { modal.remove(); });
            modal.find("form").on("submit", function (event) {
                var form = this;
                var button = modal.find('[type="submit"]');
                var result;
                event.preventDefault();
                button.prop("disabled", true).text("Working...");
                modal.data("bs.modal")._config.keyboard = false;
                result = options.onSubmit($(form));
                $.when(result).then(function (response) {
                    if (response && response.ok === false) { return $.Deferred().reject(response).promise(); }
                    modal.off("hidden.bs.modal");
                    modal.modal("hide");
                    modal.on("hidden.bs.modal", function () { modal.remove(); deferred.resolve(response); });
                }, function (error) {
                    var messages = [];
                    $.each(error.fieldErrors || [], function (_, item) { messages.push(item.message); });
                    if (!messages.length) { messages.push(error.safeMessage || "The form could not be saved."); }
                    modal.find(".vms-validation-summary").removeClass("d-none").html('<strong>Correct the following:</strong><ul><li>' + $.map(messages, U.escapeHtml).join("</li><li>") + "</li></ul>").focus();
                    button.prop("disabled", false).text(options.submitLabel || "Save");
                    modal.data("bs.modal")._config.keyboard = true;
                });
            });
            modal.modal({ backdrop: "static", keyboard: true });
            return deferred.promise();
        },
        field: function (name, label, type, value, required, options) {
            var id = "vms-field-" + name;
            var html = '<div class="form-group"><label class="vms-form-label" for="' + U.escapeHtml(id) + '">' + U.escapeHtml(label) + (required ? ' <span class="vms-required" aria-hidden="true">*</span>' : "") + '</label>';
            if (type === "select") {
                html += '<select class="custom-select" id="' + U.escapeHtml(id) + '" name="' + U.escapeHtml(name) + '"' + (required ? ' required aria-required="true"' : "") + '><option value="">Select</option>';
                $.each(options || [], function (_, option) { html += '<option value="' + U.escapeHtml(option.value) + '"' + (String(option.value) === String(value) ? " selected" : "") + '>' + U.escapeHtml(option.label) + '</option>'; });
                html += "</select>";
            } else if (type === "textarea") {
                html += '<textarea class="form-control" id="' + U.escapeHtml(id) + '" name="' + U.escapeHtml(name) + '" rows="3"' + (required ? ' required aria-required="true"' : "") + '>' + U.escapeHtml(value || "") + "</textarea>";
            } else {
                html += '<input class="form-control" id="' + U.escapeHtml(id) + '" name="' + U.escapeHtml(name) + '" type="' + U.escapeHtml(type || "text") + '" value="' + U.escapeHtml(value || "") + '"' + (required ? ' required aria-required="true"' : "") + ">";
            }
            return html + "</div>";
        },
        multiSelectField: function (name, label, options, selectedValues, required) {
            var id = "vms-field-" + name;
            var selected = $.map(selectedValues || [], function (value) { return String(value && value.id !== undefined ? value.id : value); });
            var html = '<div class="form-group"><label class="vms-form-label" for="' + U.escapeHtml(id) + '">' + U.escapeHtml(label) + (required ? ' <span class="vms-required" aria-hidden="true">*</span>' : "") + '</label><select class="custom-select" id="' + U.escapeHtml(id) + '" name="' + U.escapeHtml(name) + '" multiple size="6"' + (required ? ' required aria-required="true"' : "") + ">";
            $.each(options || [], function (_, option) { html += '<option value="' + U.escapeHtml(option.value) + '"' + ($.inArray(String(option.value), selected) >= 0 ? " selected" : "") + '>' + U.escapeHtml(option.label) + "</option>"; });
            return html + '</select><small class="form-text text-muted">Use Ctrl or Command to select more than one value.</small></div>';
        },
        formValue: function (form, name) { return form.find('[name="' + name + '"]').val(); },
        formValues: function (form, name) { return form.find('[name="' + name + '"]').val() || []; }
    };

    function TableComponent(container, options) {
        this.container = $(container);
        this.options = options;
        this.pageSize = VMS.Config.TABLE_DEFAULT_PAGE_SIZE;
        this.offset = 0;
        this.search = "";
        this.requestNumber = 0;
        this.timer = null;
        this.filters = {};
    }

    TableComponent.prototype.render = function () {
        var self = this;
        var search = this.options.searchPlaceholder || "Search authorized records";
        var filters = "";
        $.each(this.options.filters || [], function (_, filter) {
            filters += '<div><label class="vms-form-label" for="' + U.escapeHtml(self.options.id + "-filter-" + filter.name) + '">' + U.escapeHtml(filter.label) + '</label><select id="' + U.escapeHtml(self.options.id + "-filter-" + filter.name) + '" class="custom-select vms-table-filter" data-filter="' + U.escapeHtml(filter.name) + '"><option value="">All</option>';
            $.each(filter.options || [], function (_, option) { filters += '<option value="' + U.escapeHtml(option.value) + '">' + U.escapeHtml(option.label) + "</option>"; });
            filters += "</select></div>";
        });
        this.container.html('<div class="vms-toolbar"><div class="vms-toolbar-group"><div><label class="vms-form-label" for="' + this.options.id + '-search">Search</label><input id="' + this.options.id + '-search" class="form-control vms-search" type="search" placeholder="' + U.escapeHtml(search) + '"></div>' + filters + '<button type="button" class="btn btn-secondary vms-clear-search">Clear</button></div><div class="vms-table-actions"></div></div><div class="vms-table-content"><div class="vms-table-state" role="status">Loading authorized records...</div></div>');
        if (this.options.toolbarHtml) { this.container.find(".vms-table-actions").html(this.options.toolbarHtml); }
        this.container.find(".vms-clear-search").on("click", function () { self.container.find("input[type=search], .vms-table-filter").val(""); self.search = ""; self.filters = {}; self.offset = 0; self.load(); });
        this.container.find("input[type=search]").on("input", function () {
            var value = U.trim(this.value);
            window.clearTimeout(self.timer);
            self.timer = window.setTimeout(function () { if (value !== self.search) { self.search = value; self.offset = 0; self.load(); } }, VMS.Config.SEARCH_DELAY_MS);
        });
        this.container.find(".vms-table-filter").on("change", function () { self.filters[$(this).attr("data-filter")] = this.value; self.offset = 0; self.load(); });
        if (this.options.onToolbarReady) { this.options.onToolbarReady(this.container); }
        this.load();
    };

    TableComponent.prototype.load = function () {
        var self = this;
        var requestNumber = this.requestNumber + 1;
        this.requestNumber = requestNumber;
        this.container.find(".vms-table-content").html('<div class="vms-table-state" role="status">Loading authorized records...</div>');
        var queryFilters = [];
        $.each(this.options.filters || [], function (_, filter) { var raw = self.filters[filter.name]; if (raw !== undefined && raw !== "") { queryFilters.push({ field: filter.field, op: filter.op || "eq", value: filter.parse ? filter.parse(raw) : raw }); } });
        this.options.query({ filters: queryFilters, search: this.search ? { value: this.search, fields: this.options.searchFields || [] } : null, pageSize: this.pageSize, continuationToken: String(this.offset), sort: this.options.sort || [] }).then(function (result) {
            if (requestNumber !== self.requestNumber) { return; }
            self._draw(result);
        }, function (error) {
            if (requestNumber !== self.requestNumber) { return; }
            self.container.find(".vms-table-content").html('<div class="vms-table-state" role="alert">' + U.escapeHtml(error.safeMessage || "Records could not be loaded.") + '<div><button class="btn btn-secondary vms-retry" type="button">Retry</button></div></div>');
            self.container.find(".vms-retry").on("click", function () { self.load(); });
        });
    };

    TableComponent.prototype._draw = function (result) {
        var self = this;
        var columns = this.options.columns;
        var html;
        var start = result.totalCount ? this.offset + 1 : 0;
        var end = Math.min(this.offset + this.pageSize, result.totalCount);
        if (!result.items.length) {
            this.container.find(".vms-table-content").html('<div class="vms-table-state">' + (this.search ? "No authorized records match the current search." : "No authorized records are available.") + "</div>");
            return;
        }
        html = '<div class="vms-table-wrap"><table class="vms-table"><thead><tr>';
        $.each(columns, function (_, item) { html += '<th scope="col">' + U.escapeHtml(item.label) + "</th>"; });
        if (this.options.actions) { html += '<th scope="col">Actions</th>'; }
        html += "</tr></thead><tbody>";
        $.each(result.items, function (_, row) {
            html += "<tr>";
            $.each(columns, function (_, item) { var value = item.render ? item.render(row) : U.escapeHtml(row[item.field] === null || row[item.field] === undefined ? "" : row[item.field]); html += "<td>" + value + "</td>"; });
            if (self.options.actions) { html += '<td class="vms-actions">' + self.options.actions(row) + "</td>"; }
            html += "</tr>";
        });
        html += '</tbody></table></div><div class="vms-table-footer"><span>Showing ' + start + "–" + end + " of " + result.totalCount + '</span><div><label class="sr-only" for="' + this.options.id + '-page-size">Rows per page</label><select id="' + this.options.id + '-page-size" class="custom-select custom-select-sm d-inline-block" style="width:75px"><option value="10"' + (this.pageSize === 10 ? " selected" : "") + '>10</option><option value="25"' + (this.pageSize === 25 ? " selected" : "") + '>25</option></select><button type="button" class="btn btn-secondary btn-sm vms-pagination-button vms-prev"' + (this.offset === 0 ? " disabled" : "") + '>Previous</button><button type="button" class="btn btn-secondary btn-sm vms-pagination-button vms-next"' + (end >= result.totalCount ? " disabled" : "") + ">Next</button></div></div>";
        this.container.find(".vms-table-content").html(html);
        this.container.find("tbody").on("click", "[data-action]", function () { self.options.onAction($(this).attr("data-action"), Number($(this).attr("data-id"))); });
        this.container.find(".vms-prev").on("click", function () { self.offset = Math.max(0, self.offset - self.pageSize); self.load(); });
        this.container.find(".vms-next").on("click", function () { self.offset += self.pageSize; self.load(); });
        this.container.find("select").on("change", function () { self.pageSize = Number(this.value); self.offset = 0; self.load(); });
    };

    VMS.TableComponent = TableComponent;
}(window, window.jQuery));
