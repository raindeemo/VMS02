(function (VMS, $) {
    'use strict';
    function SummaryCard(label, value, className, context, options) {
        options = options || {};
        return '<section class="vms-summary-card ' + VMS.Utilities.safeText(className || '') + ' vms-accent-' + VMS.Utilities.safeText(options.accent || 'cyan') + '">' +
            '<span class="vms-summary-icon" aria-hidden="true">' + VMS.Utilities.safeText(options.icon || '•') + '</span>' +
            '<span class="vms-summary-content"><span class="vms-summary-label">' + VMS.Utilities.safeText(label) + '</span>' +
            '<strong class="vms-summary-value">' + VMS.Utilities.safeText(value) + '</strong>' +
            (context ? '<small class="vms-summary-context">' + VMS.Utilities.safeText(context) + '</small>' : '') + '</span></section>';
    }
    function displayValue(field, value) {
        if (/Code$/.test(field || '') && VMS.Services.DisplayLabelService) { return VMS.Services.DisplayLabelService.ResolveField(field, value); }
        if (/(Date|At)$/.test(field || '') && value) { return VMS.Utilities.formatDateTime(value); }
        return value;
    }
    function Table(columns, rows) {
        var html = '<div class="table-responsive"><table class="table table-hover vms-table"><thead><tr>';
        $.each(columns, function (_, column) { html += '<th scope="col">' + VMS.Utilities.safeText(column.label) + '</th>'; });
        html += '</tr></thead><tbody>';
        if (!rows.length) { html += '<tr><td colspan="' + columns.length + '">No records found.</td></tr>'; }
        $.each(rows, function (_, row) { html += '<tr>'; $.each(columns, function (_, column) { html += '<td>' + (column.renderHtml ? column.renderHtml(row) : VMS.Utilities.safeText(displayValue(column.field, row[column.field]))) + '</td>'; }); html += '</tr>'; });
        return html + '</tbody></table></div>';
    }
    function ValidationSummary(errors) { if (!errors || !errors.length) { return ''; } var html = '<div class="alert alert-danger" role="alert"><h2>Check the following</h2><ul>'; $.each(errors, function (_, error) { html += '<li>' + VMS.Utilities.safeText(error.message) + '</li>'; }); return html + '</ul></div>'; }
    function renderNavigation() {
        var links = [], destinations = [
            ['OVERVIEW', 'Overview', 'O'], ['PENDING_APPROVALS', 'Pending Approvals', '!'], ['VENDOR_LIST', 'Vendors', 'V'],
            ['PRPO_REGISTER', 'PR / PO', 'P'], ['INVOICE_REGISTER', 'Invoices', 'I'], ['DIRECT_PAYMENT_REVIEW', 'DP Review', 'D'], ['FEEDBACK_ASSIGNMENTS', 'Feedback', 'F'],
            ['REPORTS', 'Reports', 'R'], ['ADMINISTRATION', 'Administration', 'A']
        ];
        $.each(destinations, function (_, destination) {
            links.push('<a class="vms-nav-link' + (destination[0] === 'ADMINISTRATION' ? ' vms-nav-administration' : '') + '" hidden data-route="' + destination[0] + '" href="' + VMS.Routes.registry[destination[0]] + '"><span class="vms-nav-glyph" aria-hidden="true">' + destination[2] + '</span><span>' + VMS.Utilities.safeText(destination[1]) + '</span></a>');
        });
        return links.join('');
    }
    function buildDummyUserSwitcher(user, routeCode) {
        if (!VMS.Constants.USE_DUMMY_DATA) { return; }
        VMS.Services.AccessService.SearchUsers({ dummyHarness: true }).then(function (result) {
            var html = '';
            if (!result.ok) { return; }
            $.each(result.data.items, function (_, item) {
                var detail = item.UserName + ' — ' + VMS.Services.DisplayLabelService.Resolve(item.RoleCode, 'USER_ROLE') + ' / ' + VMS.Services.DisplayLabelService.Resolve(item.FunctionCode, 'FUNCTION');
                html += '<option value="' + VMS.Utilities.safeText(item.Email) + '"' + (item.UserKey === user.UserKey ? ' selected' : '') + '>' + VMS.Utilities.safeText(detail) + '</option>';
            });
            $('#vms-dummy-user').html(html).attr('title', $('#vms-dummy-user option:selected').text()).on('change', function () {
                var select = $(this), email = select.val();
                select.prop('disabled', true).attr('title', select.find('option:selected').text());
                VMS.AppContext.getProvider().setCurrentUserEmail(email).then(function () {
                    VMS.Services.AccessService.ResolveCurrentUser().then(function (identity) {
                        if (!identity.ok) { window.location.replace(VMS.Routes.registry.OVERVIEW); return; }
                        VMS.Services.AccessService.AuthorizeRoute(routeCode).then(function (authorization) {
                            if (authorization.ok) { window.location.reload(); } else { window.location.replace(VMS.Routes.registry.OVERVIEW); }
                        });
                    });
                });
            });
        });
    }
    function brand() { return '<div class="vms-brand-block"><a class="vms-brand" href="overview.html" aria-label="VMS Overview"><span class="vms-brand-mark" aria-hidden="true"></span>VMS</a><p>VENDOR MANAGEMENT<br>PORTAL</p></div>'; }
    function Shell(pageTitle, routeCode) {
        var user = VMS.Services.AccessService.GetCurrentUser(), initials = user.UserName.split(/\s+/).map(function (part) { return part.charAt(0); }).join('').substring(0, 2);
        var role = VMS.Services.DisplayLabelService.Resolve(user.RoleCode, 'USER_ROLE'), fn = VMS.Services.DisplayLabelService.Resolve(user.FunctionCode, 'FUNCTION');
        var switcher = VMS.Constants.USE_DUMMY_DATA ? '<div class="vms-user-switcher"><label for="vms-dummy-user">Test as user</label><select id="vms-dummy-user" class="form-control form-control-sm" aria-label="Test as user"><option>Loading users…</option></select></div>' : '';
        $('#vms-app').html('<div class="vms-shell"><aside class="vms-sidebar">' + brand() + '<nav aria-label="Primary">' + renderNavigation() + '</nav></aside><div class="vms-main"><header class="vms-header"><h1>' + VMS.Utilities.safeText(pageTitle) + '</h1><div class="vms-header-user">' + switcher + '<div class="vms-current-user"><span class="vms-avatar">' + VMS.Utilities.safeText(initials) + '</span><span><strong>' + VMS.Utilities.safeText(user.UserName) + '</strong><small>' + VMS.Utilities.safeText(role + ' · ' + fn) + '</small></span></div></div></header><main id="vms-page" tabindex="-1"></main></div></div>');
        $('.vms-nav-link[data-route="' + routeCode + '"]').addClass('active').attr('aria-current', 'page');
        $.each($('.vms-nav-link'), function (_, link) { VMS.Services.AccessService.AuthorizeRoute($(link).data('route')).then(function (auth) { if (auth.ok) { $(link).removeAttr('hidden'); } else { $(link).remove(); } }); });
        buildDummyUserSwitcher(user, routeCode);
    }
    function AccessDenied() {
        $('#vms-app').html('<div class="vms-shell vms-denied-shell"><aside class="vms-sidebar">' + brand() + '</aside><div class="vms-main"><header class="vms-header"><h1>VMS</h1></header><main id="vms-page" tabindex="-1"><section class="vms-access-denied" data-error-code="ACCESS_DENIED"><span class="vms-denied-icon" aria-hidden="true">!</span><h2>Access Denied</h2><p>You do not have permission to view this content.</p><a class="btn btn-vms-primary" href="overview.html">Return to Overview</a></section></main></div></div>');
    }
    VMS.Components.VmsSummaryCard = SummaryCard;
    VMS.Components.VmsTable = Table;
    VMS.Components.VmsValidationSummary = ValidationSummary;
    VMS.Components.VmsShell = Shell;
    VMS.Components.VmsAccessDenied = AccessDenied;
}(window.VMS, window.jQuery));
