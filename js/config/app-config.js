(function (window) {
    "use strict";

    window.VMS = window.VMS || {};
    window.VMS.Config = {
        USE_DUMMY_DATA: true,
        DUMMY_CURRENT_USER_KEY: "vm.manager@dummy.vms.test",
        DUMMY_CLOCK_UTC: "2026-08-17T09:00:00Z",
        DUMMY_SEED_URL: "data/seed.json",
        DUMMY_STATE_KEY: "vms.dummy.state.v1",
        DUMMY_USER_KEY: "vms.dummy.currentUser.v1",
        DUMMY_CLOCK_KEY: "vms.dummy.clock.v1",
        DUMMY_NOTIFICATION_KEY: "vms.dummy.notifications.v1",
        DUMMY_NOTIFICATION_FAILURE_KEY: "vms.dummy.notificationFailure.v1",
        TABLE_DEFAULT_PAGE_SIZE: 10,
        TABLE_PAGE_SIZES: [10, 25],
        SEARCH_DELAY_MS: 300,
        TOAST_DURATION_MS: 10000,
        APPLICATION_TIMEZONE: "Asia/Riyadh",
        ROUTES: {
            OVERVIEW: "overview.html",
            VENDOR_LIST: "vendors.html",
            VENDOR_PROFILE: "vendor-profile.html",
            PRPO_REGISTER: "prpo.html",
            PRPO_APPROVAL: "prpo-approval.html",
            PO_LINE_WORKSPACE: "po-lines.html",
            INVOICE_REGISTER: "invoices.html",
            INVOICE_PROCESSING: "invoice-processing.html",
            INVOICE_MANAGER_APPROVAL: "invoice-approval.html",
            CHARGEBACK_PROCESSING: "chargeback.html",
            INVOICE_DETAILS: "invoice-details.html",
            FEEDBACK_ASSIGNMENTS: "feedback.html",
            FEEDBACK_FORM: "feedback-form.html",
            REPORTS: "reports.html",
            ADMINISTRATION: "administration.html",
            PENDING_APPROVALS: "pending-approvals.html",
            DIRECT_PAYMENT_REVIEW: "direct-payment-review.html",
            DIRECT_PAYMENT_BATCH: "direct-payment-batch.html"
        }
    };
}(window));
