(function (VMS, $, window) {
    'use strict';
    function safe(value) { return VMS.Utilities.safeText(value === null || value === undefined ? '' : String(value)); }
    function detail(label, value) { return '<div><dt>' + safe(label) + '</dt><dd>' + safe(value === null || value === undefined || value === '' ? '—' : value) + '</dd></div>'; }
    function render(id, key) {
        return VMS.Services.InvoiceService.GetAuthorizedDetails(id, key).then(function (result) {
            var row, sections, admin = VMS.Services.AccessService.GetCurrentUser();
            if (!result.ok) { return result; }
            row = result.data.invoice;
            sections = '<section class="vms-detail-section"><h3>Creation Details</h3><dl class="vms-detail-grid">' + detail('Source', VMS.Services.DisplayLabelService.Resolve(row.InvoiceSourceFunctionCode, 'FUNCTION')) + detail('Category', VMS.Utilities.lookupLabel(row.Category)) + detail('Focal Point', row.FocalPointName || row.FocalPointEmail) + detail('Direct Payment', row.DirectPayment ? 'Yes' : 'No') + '</dl></section>';
            if (row.TotalPrice !== null && row.TotalPrice !== undefined) { sections += '<section class="vms-detail-section"><h3>Processing / Financial Details</h3><dl class="vms-detail-grid">' + detail('Supplier Invoice', row.InvoiceNumber) + detail('Total Price', row.TotalPrice) + detail('Final Amount', row.FinalInvoiceAmount) + detail('Amount (SAR)', row.FinalInvoiceAmountInSAR) + detail('PO Line', row.POLineKeySnapshot) + detail('Currency', row.CurrencyCodeSnapshot) + '</dl></section>'; }
            sections += '<section class="vms-detail-section"><h3>Attachments</h3>' + (row.attachments.length ? VMS.Components.VmsAuthorizedAttachmentLinks.render(row.ID, row.attachments) : '<p>No attachments</p>') + '</section>';
            sections += '<section class="vms-detail-section"><h3>Workflow History</h3>' + VMS.Components.VmsActivityTimeline(result.data.history) + '</section>';
            $('#vms-page').html(VMS.Components.VmsBackLink('INVOICE_REGISTER', 'Back to Invoices') + '<section class="vms-profile-header"><div><span class="vms-profile-kicker">INVOICE DETAILS · READ ONLY</span><h2>' + safe(row.InvoiceIdentifier) + '</h2><p>' + safe(row.VendorNameSnapshot) + '</p></div><div>' + VMS.Components.VmsStatusBadge(row.StatusCode, VMS.Services.DisplayLabelService.Resolve(row.StatusCode, 'INVOICE_STATUS')) + '</div></section>' + sections + '<div id="vms-hosted-modal" class="modal" tabindex="-1"></div>');
            VMS.Components.VmsAuthorizedAttachmentLinks.bind('#vms-page');
            if (admin && $.inArray(admin.RoleCode, ['ADMIN', 'SUPER_ADMIN']) >= 0) { VMS.Services.DestinationResolverService.ResolveActionDestination('INVOICE', row, 'INVOICE_ADMIN').then(function (destination) { if (!destination.ok) { return; } $('#vms-page .vms-profile-header > div:last').append(' <button class="btn btn-vms-admin" data-pass1e-invoice-admin>Edit</button>'); $('#vms-page').off('click.pass1eAdmin').on('click.pass1eAdmin', '[data-pass1e-invoice-admin]', function () { VMS.Components.VmsHostedInterfaces.open(destination.data, { onRefresh: function () { render(id, key); } }); }); }); }
            return VMS.Utilities.success(row);
        });
    }
    VMS.PhaseDPages.RenderDetails = render;
    VMS.Pass1EInvoiceDetails = { Render: render };
}(window.VMS, window.jQuery, window));
