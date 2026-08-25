(function (VMS) {
    'use strict';
    VMS.Routes.registry = {
        OVERVIEW: 'overview.html', PENDING_APPROVALS: 'pending-approvals.html', VENDOR_LIST: 'vendor-list.html',
        VENDOR_PROFILE: 'vendor-profile.html', PRPO_REGISTER: 'prpo-register.html', PO_LINE_WORKSPACE: 'po-line-workspace.html',
        INVOICE_REGISTER: 'invoice-register.html', INVOICE_DETAILS: 'invoice-details.html', DIRECT_PAYMENT_REVIEW: 'direct-payment-review.html',
        FEEDBACK_ASSIGNMENTS: 'feedback-assignments.html', REPORTS: 'reports.html', ADMINISTRATION: 'administration.html'
    };
    VMS.Routes.interfaces = ['VENDOR_ADD', 'VENDOR_DOCUMENT_EVALUATION', 'VENDOR_INTERVIEW', 'VENDOR_ADMIN', 'PRPO_NEW', 'PRPO_APPROVAL', 'PRPO_UPDATE_REQUIRED', 'PO_CREATE', 'PO_LINE_ADD_DETAILS', 'PRPO_ADMIN', 'INVOICE_ADD_EXECUTION', 'INVOICE_ADD_EDUCATION_PROGRAM', 'INVOICE_PROCESSING', 'INVOICE_MANAGER_APPROVAL', 'CHARGEBACK_PROCESSING', 'INVOICE_ADMIN', 'DIRECT_PAYMENT_REVIEW_DETAILS', 'DIRECT_PAYMENT_BATCH', 'FEEDBACK_FORM'];
    VMS.Routes.url = function (routeCode, id, key, interfaceCode) { var file = VMS.Routes.registry[routeCode], query = []; if (!file) { return null; } if (id) { query.push('id=' + encodeURIComponent(id)); } if (key) { query.push('key=' + encodeURIComponent(key)); } if (interfaceCode) { query.push('interface=' + encodeURIComponent(interfaceCode)); } return file + (query.length ? '?' + query.join('&') : ''); };
}(window.VMS));
