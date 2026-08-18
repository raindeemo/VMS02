(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var U = VMS.Utilities;

    var NAVIGATION = [
        { code: "OVERVIEW", label: "Overview" },
        { code: "VENDOR_LIST", label: "Vendors" },
        { code: "PRPO_REGISTER", label: "PR / PO" },
        { code: "INVOICE_REGISTER", label: "Invoices" },
        { code: "DIRECT_PAYMENT_REVIEW", label: "Direct Payment Review" },
        { code: "DIRECT_PAYMENT_BATCH", label: "Direct Payment Batches" },
        { code: "FEEDBACK_ASSIGNMENTS", label: "Feedback" },
        { code: "PENDING_APPROVALS", label: "Pending Approvals" },
        { code: "REPORTS", label: "Reports" },
        { code: "ADMINISTRATION", label: "Administration" }
    ];

    VMS.Shell = {
        render: function (user, routeCode, title, authorizedRoutes, dummyUsers) {
            var initials = $.map(String(user.UserName || "VMS").split(/\s+/), function (part) { return part.charAt(0); }).join("").substring(0, 2).toUpperCase();
            var nav = "";
            var dummy = "";
            $.each(NAVIGATION, function (_, item) {
                if ($.inArray(item.code, authorizedRoutes) >= 0) {
                    nav += '<a href="' + U.escapeHtml(VMS.Config.ROUTES[item.code]) + '"' + (item.code === routeCode ? ' aria-current="page"' : "") + '>' + U.escapeHtml(item.label) + "</a>";
                }
            });
            if (VMS.Config.USE_DUMMY_DATA === true) {
                dummy = '<div class="vms-dummy-tools"><label for="vms-dummy-user">Dummy test identity</label><select id="vms-dummy-user" class="custom-select custom-select-sm">';
                $.each(dummyUsers || [], function (_, item) { dummy += '<option value="' + U.escapeHtml(item.UserKey) + '"' + (item.UserKey === user.UserKey ? " selected" : "") + '>' + U.escapeHtml(item.UserName + " — " + item.RoleCode) + "</option>"; });
                dummy += '</select><details class="mt-2"><summary>Development controls</summary><label class="mt-2" for="vms-dummy-clock">Dummy clock (UTC)</label><input id="vms-dummy-clock" class="form-control form-control-sm" type="datetime-local" value="' + U.escapeHtml(VMS.ClockService.utcNow().substring(0, 16)) + '"><div class="mt-2"><button id="vms-set-clock" type="button" class="btn btn-secondary btn-sm">Set Clock</button> <button id="vms-reset-clock" type="button" class="btn btn-secondary btn-sm">Reset Clock</button></div><div class="form-check mt-2"><input id="vms-notification-failure" class="form-check-input" type="checkbox"' + (window.sessionStorage.getItem(VMS.Config.DUMMY_NOTIFICATION_FAILURE_KEY) === "true" ? " checked" : "") + '><label class="form-check-label" for="vms-notification-failure">Inject notification failure</label></div><button id="vms-run-scheduled" type="button" class="btn btn-secondary btn-sm mt-2">Run Scheduled Operations</button><button id="vms-reset-dummy" type="button" class="btn btn-danger btn-sm mt-2">Reset Dummy Data</button></details></div>';
            }
            $("#vms-app").html(
                '<a class="vms-skip-link" href="#vms-main-content">Skip to main content</a>' +
                '<div class="vms-layout"><aside class="vms-sidebar" aria-label="Primary"><div class="vms-brand"><span class="vms-brand-mark" aria-hidden="true">VMS</span><span class="vms-brand-name">Vendor Management<span class="vms-brand-subtitle">Operational workspace</span></span></div><nav class="vms-nav">' + nav + "</nav>" + dummy + "</aside>" +
                '<div class="vms-main"><header class="vms-topbar"><h1 class="vms-page-title">' + U.escapeHtml(title) + '</h1><div class="vms-user-block"><span class="vms-user-avatar" aria-hidden="true">' + U.escapeHtml(initials) + '</span><span><span class="vms-user-name">' + U.escapeHtml(user.UserName) + '</span><span class="vms-user-role">' + U.escapeHtml(VMS.UI.titleize(user.RoleCode) + " · " + VMS.UI.titleize(user.FunctionCode)) + '</span></span></div></header><main id="vms-main-content" class="vms-content" tabindex="-1"></main></div></div><div id="vms-toast-region" class="vms-toast-region" aria-live="polite" aria-atomic="false"></div>'
            );
            $("#vms-dummy-user").on("change", function () { VMS.App.accessService.SetDummyCurrentUser(this.value); window.location.reload(); });
            $("#vms-reset-dummy").on("click", function () {
                VMS.UI.confirm({ title: "Reset Dummy Data", message: "Reset all current session changes and restore the deterministic seed data?", actionLabel: "Reset Dummy Data", danger: true }).then(function () { return VMS.App.dummyDataService.Reset(); }).then(function () { window.location.href = VMS.Config.ROUTES.OVERVIEW; });
            });
            $("#vms-set-clock").on("click", function () {
                var value = $("#vms-dummy-clock").val();
                if (!value || !VMS.ClockService.setDummyTime(value + ":00Z")) { VMS.UI.toast("error", "Invalid Dummy clock", "Enter a valid UTC date and time."); return; }
                VMS.UI.toast("success", "Dummy clock updated", "Authoritative Dummy time is now " + VMS.ClockService.formatRiyadh(VMS.ClockService.utcNow(), false) + " Asia/Riyadh.");
            });
            $("#vms-reset-clock").on("click", function () { VMS.ClockService.resetDummyTime(); $("#vms-dummy-clock").val(VMS.ClockService.utcNow().substring(0, 16)); VMS.UI.toast("success", "Dummy clock reset", "The seed test time was restored."); });
            $("#vms-notification-failure").on("change", function () { if (this.checked) { window.sessionStorage.setItem(VMS.Config.DUMMY_NOTIFICATION_FAILURE_KEY, "true"); } else { window.sessionStorage.removeItem(VMS.Config.DUMMY_NOTIFICATION_FAILURE_KEY); } });
            $("#vms-run-scheduled").on("click", function () {
                var button = $(this);
                VMS.UI.confirm({ title: "Run Scheduled Operations", message: "Run Vendor reminders, Vendor expiries, PO Line reminders, and Direct Payment recovery at the current Dummy clock time?", actionLabel: "Run Operations" }).then(function () {
                    var operations = ["ProcessVendorOnboardingReminders", "ProcessVendorExpiries", "ProcessPOLineThresholdReminders", "RecoverDirectPaymentOperations"];
                    var totals = { processed: 0, succeeded: 0, failed: 0 };
                    var chain = $.Deferred().resolve().promise();
                    button.prop("disabled", true);
                    $.each(operations, function (_, operation) { chain = chain.then(function () { return VMS.App.scheduledOperationsService[operation]().then(function (result) { totals.processed += result.processed; totals.succeeded += result.succeeded; totals.failed += result.failed; }); }); });
                    return chain.then(function () { button.prop("disabled", false); VMS.UI.toast(totals.failed ? "warning" : "success", "Scheduled operations completed", totals.processed + " processed; " + totals.succeeded + " succeeded; " + totals.failed + " failed."); }, function (error) { button.prop("disabled", false); VMS.UI.handleError(error); });
                }, function () {});
            });
        }
    };
}(window, window.jQuery));
