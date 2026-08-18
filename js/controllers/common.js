(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var U = VMS.Utilities;

    VMS.PageControllers = {};
    VMS.ControllerHelpers = {
        content: function (html) { $("#vms-main-content").html(html); },
        loading: function (message) { $("#vms-main-content").html('<div class="vms-panel vms-loading" role="status">' + U.escapeHtml(message || "Loading authorized data...") + "</div>"); },
        fail: function (error) { $("#vms-main-content").html('<section class="vms-panel" role="alert"><h2 class="vms-section-heading">Unable to load this workspace</h2><p>' + U.escapeHtml(error && error.safeMessage ? error.safeMessage : "The requested information is unavailable.") + '</p><p><a class="btn btn-secondary" href="' + U.escapeHtml(VMS.Config.ROUTES.OVERVIEW) + '">Return to Overview</a></p></section>'); },
        query: function () { return { id: Number(U.getQueryParameter("id")), key: U.getQueryParameter("key") || "", tab: U.getQueryParameter("tab") || "" }; },
        actionButton: function (label, action, id, className) { return '<button type="button" class="btn btn-sm ' + U.escapeHtml(className || "btn-secondary") + '" data-action="' + U.escapeHtml(action) + '" data-id="' + Number(id) + '">' + U.escapeHtml(label) + "</button>"; },
        linkButton: function (label, url, className) { return '<a class="btn btn-sm ' + U.escapeHtml(className || "btn-secondary") + '" href="' + U.escapeHtml(url) + '">' + U.escapeHtml(label) + "</a>"; },
        options: function (rows, valueField, labelField) { return $.map(rows || [], function (row) { return { value: row[valueField], label: row[labelField] }; }); },
        lookupOptions: function (rows, labelField) { return $.map(rows || [], function (row) { return { value: row.ID, label: row[labelField] }; }); },
        bool: function (value) { return value === true ? "Yes" : "No"; },
        formBool: function (form, name) { return form.find('[name="' + name + '"]').is(":checked"); },
        showMutation: function (promise, refresh) {
            return promise.then(function (response) {
                VMS.UI.handleResponse(response);
                if (refresh) { refresh(response); }
                return response;
            }, function (error) { VMS.UI.handleError(error); return $.Deferred().reject(error).promise(); });
        },
        confirmationThen: function (options, work, refresh) {
            return VMS.UI.confirm(options).then(work).then(function (response) { VMS.UI.handleResponse(response); if (refresh) { refresh(response); } return response; }, function (error) { if (!error.cancelled) { VMS.UI.handleError(error); } });
        },
        stageStatus: function (row) { return VMS.UI.status(row.StageCode) + " " + VMS.UI.status(row.StatusCode); },
        activeLabel: function (value) { return VMS.UI.status(value ? "ACTIVE" : "INACTIVE"); }
    };
}(window, window.jQuery));
