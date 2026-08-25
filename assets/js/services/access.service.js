(function (VMS, $) {
    'use strict';
    var currentUser = null, adminRoles = ['ADMIN', 'SUPER_ADMIN'], employeeRoles = ['EMPLOYEE', 'CO_OP'];
    var vendorRoutes = ['VENDOR_LIST', 'VENDOR_PROFILE'], procurementRoutes = ['PRPO_REGISTER', 'PO_LINE_WORKSPACE'], invoiceRoutes = ['INVOICE_REGISTER', 'INVOICE_DETAILS'];
    var adminTabs = ['access', 'configuration', 'conversion-rate', 'feedback-question', 'city', 'country', 'category'];
    var businessFunctions = ['LFO_COMMERCIAL', 'LFO_MANUFACTURING', 'LFO_LEADERSHIP', 'EXCELLENCE', 'VENDOR_MANAGEMENT', 'EXECUTION', 'EDUCATION_PROGRAM'];
    function resolved(value) { return VMS.Utilities.resolved(value); }
    function denied(message) { return VMS.Utilities.failure('ACCESS_DENIED', message || 'Access administration is not authorized.'); }
    function hidden() { return VMS.Utilities.failure('NOT_FOUND_OR_UNAUTHORIZED', 'The user was not found or is not authorized.'); }
    function isAdmin(user) { return !!(user && $.inArray(user.RoleCode, adminRoles) >= 0); }
    function isVm(user) { return !!(user && user.FunctionCode === 'VENDOR_MANAGEMENT'); }
    function isEmployee(user) { return !!(user && $.inArray(user.RoleCode, employeeRoles) >= 0); }
    function validCombination(user) {
        if (!user || $.inArray(user.RoleCode, VMS.Constants.ROLES) < 0 || $.inArray(user.FunctionCode, VMS.Constants.FUNCTIONS) < 0) { return false; }
        if (isAdmin(user)) { return user.FunctionCode === 'ADMINISTRATION'; }
        return user.FunctionCode !== 'ADMINISTRATION';
    }
    function categoryApplicable(user) { return isEmployee(user) && $.inArray(user.FunctionCode, ['VENDOR_MANAGEMENT', 'EXECUTION', 'EDUCATION_PROGRAM']) >= 0; }
    function requiresCategories(user) { return categoryApplicable(user) && user.IsActive !== false; }
    function categoryEligible(functionCode, category) {
        if (!category || !category.IsActive || category.FunctionCode === 'ADMINISTRATION') { return false; }
        if (functionCode === 'EDUCATION_PROGRAM') { return category.FunctionCode === 'EDUCATION_PROGRAM'; }
        if (functionCode === 'EXECUTION') { return category.FunctionCode !== 'EDUCATION_PROGRAM'; }
        if (functionCode === 'VENDOR_MANAGEMENT') { return $.inArray(category.FunctionCode, businessFunctions) >= 0; }
        return false;
    }
    function validateCategoryScope(user) {
        var assigned = VMS.Utilities.lookupIds(user.AssignedCategories || []), seen = {}, invalid = false;
        if (!categoryApplicable(user)) { return resolved(assigned.length === 0); }
        if (!assigned.length) { return resolved(!requiresCategories(user)); }
        $.each(assigned, function (_, id) { if (!isFinite(id) || id <= 0 || Math.floor(id) !== id || seen[id]) { invalid = true; } seen[id] = true; });
        if (invalid) { return resolved(false); }
        return VMS.Repositories.CategoryRepository.query({ filters: [{ field: 'ID', operator: 'in', value: assigned }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 1000 }).then(function (data) {
            var valid = data.items.length === assigned.length;
            $.each(data.items, function (_, category) { valid = valid && categoryEligible(user.FunctionCode, category); });
            return valid;
        });
    }
    function validateResolvedUser(user) {
        if (!validCombination(user) || !user.IsActive) { return resolved(false); }
        if (user.IsDirectPaymentAuthorized && !(isVm(user) && isEmployee(user))) { return resolved(false); }
        return validateCategoryScope(user);
    }
    function allowedRoute(user, route) {
        if (!VMS.Routes.registry[route]) { return false; }
        if (route === 'OVERVIEW') { return true; }
        if (route === 'REPORTS') { return isAdmin(user) || (isEmployee(user) && user.FunctionCode === 'EXCELLENCE'); }
        if (route === 'ADMINISTRATION') { return isAdmin(user) || user.RoleCode === 'MANAGER'; }
        if (route === 'PENDING_APPROVALS') { return isAdmin(user) || user.RoleCode === 'UPPER_MANAGEMENT' || (user.RoleCode === 'MANAGER' && isVm(user)); }
        if (route === 'FEEDBACK_ASSIGNMENTS') { return (user.RoleCode === 'MANAGER' || isEmployee(user)) && $.inArray(user.FunctionCode, ['LFO_COMMERCIAL', 'LFO_MANUFACTURING', 'LFO_LEADERSHIP', 'VENDOR_MANAGEMENT', 'EXECUTION', 'EDUCATION_PROGRAM']) >= 0; }
        if (route === 'DIRECT_PAYMENT_REVIEW') { return isAdmin(user) || (isVm(user) && isEmployee(user) && user.IsDirectPaymentAuthorized); }
        if ($.inArray(route, vendorRoutes) >= 0 || $.inArray(route, procurementRoutes) >= 0) { return isAdmin(user) || user.RoleCode === 'UPPER_MANAGEMENT' || isVm(user); }
        if ($.inArray(route, invoiceRoutes) >= 0) { return isAdmin(user) || user.RoleCode === 'UPPER_MANAGEMENT' || isVm(user) || (isEmployee(user) && $.inArray(user.FunctionCode, ['EXECUTION', 'EDUCATION_PROGRAM']) >= 0); }
        return false;
    }
    function ResolveCurrentUser() {
        return VMS.AppContext.getProvider().getCurrentUserEmail().then(function (email) {
            var key = VMS.Utilities.normalize(email);
            if (!key) { currentUser = null; return denied('A valid authenticated work email is required.'); }
            return VMS.Repositories.UserRepository.query({ filters: [{ field: 'UserKey', operator: 'eq', value: key }, { field: 'IsActive', operator: 'eq', value: true }], pageSize: 2 }).then(function (result) {
                if (result.items.length !== 1) { currentUser = null; return denied('Your VMS access record is missing or invalid.'); }
                return validateResolvedUser(result.items[0]).then(function (valid) { if (!valid) { currentUser = null; return denied('Your VMS access record is missing or invalid.'); } currentUser = result.items[0]; return VMS.Utilities.success(VMS.Utilities.clone(currentUser)); });
            });
        });
    }
    function withIdentity(work) { return ResolveCurrentUser().then(function (identity) { return identity.ok ? work(identity.data) : identity; }); }
    function AuthorizeRoute(routeCode) { return withIdentity(function (actor) { return allowedRoute(actor, routeCode) ? VMS.Utilities.success(true) : denied('You are not authorized for this page.'); }); }
    function AuthorizeAdministrationTab(tabCode) { return withIdentity(function (actor) { var allowed = $.inArray(tabCode, adminTabs) >= 0 && (isAdmin(actor) || (actor.RoleCode === 'MANAGER' && tabCode === 'access')); return allowed ? VMS.Utilities.success(true) : denied('The requested Administration tab is not authorized.'); }); }
    function GetAdministrationTabs() { return withIdentity(function (actor) { if (!allowedRoute(actor, 'ADMINISTRATION')) { return denied('Administration is not authorized.'); } return VMS.Utilities.success(actor.RoleCode === 'MANAGER' ? adminTabs.slice(0, 1) : adminTabs.slice(0)); }); }
    function AuthorizeInterface(interfaceCode) {
        if ($.inArray(interfaceCode, VMS.Routes.interfaces) < 0) { return resolved(denied('The requested interface is not authorized.')); }
        var adminOnly = ['VENDOR_ADMIN', 'PRPO_ADMIN', 'INVOICE_ADMIN'], vmVendorWork = ['VENDOR_ADD', 'VENDOR_DOCUMENT_EVALUATION', 'VENDOR_INTERVIEW'], vmOperational = ['PRPO_NEW', 'PRPO_UPDATE_REQUIRED', 'PO_CREATE', 'PO_LINE_ADD_DETAILS', 'INVOICE_PROCESSING', 'CHARGEBACK_PROCESSING'], managerApproval = ['PRPO_APPROVAL', 'INVOICE_MANAGER_APPROVAL'];
        if ($.inArray(interfaceCode, adminOnly) >= 0) { return resolved(isAdmin(currentUser) ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        if ($.inArray(interfaceCode, managerApproval) >= 0) { return resolved(currentUser && currentUser.RoleCode === 'MANAGER' && isVm(currentUser) ? VMS.Utilities.success(true) : denied('The requested Manager approval interface is not authorized.')); }
        if ($.inArray(interfaceCode, vmVendorWork) >= 0) { return resolved(isAdmin(currentUser) || (isVm(currentUser) && (isEmployee(currentUser) || currentUser.RoleCode === 'MANAGER')) ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        if ($.inArray(interfaceCode, vmOperational) >= 0) { return resolved(isAdmin(currentUser) || (isVm(currentUser) && isEmployee(currentUser)) ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        if (interfaceCode === 'INVOICE_ADD_EXECUTION') { return resolved(isAdmin(currentUser) || (currentUser && currentUser.FunctionCode === 'EXECUTION' && $.inArray(currentUser.RoleCode, ['MANAGER', 'EMPLOYEE', 'CO_OP']) >= 0) ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        if (interfaceCode === 'INVOICE_ADD_EDUCATION_PROGRAM') { return resolved(isAdmin(currentUser) || (currentUser && currentUser.FunctionCode === 'EDUCATION_PROGRAM' && $.inArray(currentUser.RoleCode, ['MANAGER', 'EMPLOYEE', 'CO_OP']) >= 0) ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        if (interfaceCode === 'DIRECT_PAYMENT_REVIEW_DETAILS') { return resolved(isAdmin(currentUser) || (isVm(currentUser) && isEmployee(currentUser) && currentUser.IsDirectPaymentAuthorized) ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        if (interfaceCode === 'DIRECT_PAYMENT_BATCH') { return resolved(isAdmin(currentUser) || (currentUser && $.inArray(currentUser.RoleCode, ['MANAGER', 'UPPER_MANAGEMENT']) >= 0) || (isVm(currentUser) && isEmployee(currentUser) && currentUser.IsDirectPaymentAuthorized) ? VMS.Utilities.success(true) : denied('The requested Direct Payment batch interface is not authorized.')); }
        if (interfaceCode === 'FEEDBACK_FORM') { return resolved(allowedRoute(currentUser, 'FEEDBACK_ASSIGNMENTS') ? VMS.Utilities.success(true) : denied('The requested interface is not authorized.')); }
        return resolved(denied('The requested interface is not authorized.'));
    }
    function AuthorizeRecord(entityType, record, action) {
        if (!currentUser || !record) { return resolved(hidden()); }
        if (entityType === 'FEEDBACK_ASSIGNMENT') { if (VMS.Utilities.lookupId(record.AssignedUser) !== Number(currentUser.ID) || VMS.Utilities.normalize(record.AssignedUserEmail) !== currentUser.UserKey || !record.IsActive || record.FunctionCode !== currentUser.FunctionCode || $.inArray(currentUser.RoleCode, ['MANAGER', 'EMPLOYEE', 'CO_OP']) < 0) { return resolved(hidden()); } return resolved(VMS.Utilities.success(true)); }
        if (action === 'APPROVE' || action === 'APPROVE_GROUP') { return resolved(currentUser.RoleCode === 'MANAGER' && isVm(currentUser) ? VMS.Utilities.success(true) : denied('Manager approval is required.')); }
        if (isAdmin(currentUser) || currentUser.RoleCode === 'UPPER_MANAGEMENT' || (currentUser.RoleCode === 'MANAGER' && isVm(currentUser))) { return resolved(VMS.Utilities.success(true)); }
        var assigned = VMS.Utilities.lookupIds(currentUser.AssignedCategories || []), categories = record.Categories || (record.Category ? [record.Category] : []), categoryMatch = false;
        $.each(categories, function (_, categoryId) { categoryMatch = categoryMatch || $.inArray(VMS.Utilities.lookupId(categoryId), assigned) >= 0; });
        if (entityType === 'VENDOR') { return resolved(isEmployee(currentUser) && categoryMatch ? VMS.Utilities.success(true) : hidden()); }
        if (entityType === 'INVOICE') { if (record.DirectPayment) { return resolved(isVm(currentUser) && isEmployee(currentUser) && currentUser.IsDirectPaymentAuthorized ? VMS.Utilities.success(true) : (VMS.Utilities.normalize(record.FocalPointEmail) === currentUser.UserKey && action === 'READ' ? VMS.Utilities.success(true) : hidden())); } if (VMS.Utilities.normalize(record.FocalPointEmail) === currentUser.UserKey && action === 'READ') { return resolved(VMS.Utilities.success(true)); } if (isVm(currentUser) && isEmployee(currentUser)) { return resolved(categoryMatch ? VMS.Utilities.success(true) : hidden()); } return resolved(isEmployee(currentUser) && action === 'READ' && currentUser.FunctionCode === record.InvoiceSourceFunctionCode && categoryMatch ? VMS.Utilities.success(true) : hidden()); }
        return resolved(hidden());
    }
    function safeUser(row, includeNotes) { var output = { ID: row.ID, UserName: row.UserName, Email: row.Email, UserKey: row.UserKey, RoleCode: row.RoleCode, FunctionCode: row.FunctionCode, AssignedCategories: VMS.Utilities.clone(row.AssignedCategories || []), IsActive: !!row.IsActive, IsDirectPaymentAuthorized: !!row.IsDirectPaymentAuthorized, _etag: row._etag }; if (includeNotes) { output.AccessNotes = row.AccessNotes || ''; } return output; }
    function managerTarget(actor, row) { return !!(row && row.FunctionCode === actor.FunctionCode && $.inArray(row.RoleCode, employeeRoles) >= 0); }
    function scopedUser(actor, id) { if (isAdmin(actor)) { return VMS.Repositories.UserRepository.getById(id); } return VMS.Repositories.UserRepository.query({ filters: [{ field: 'ID', operator: 'eq', value: Number(id) }, { field: 'FunctionCode', operator: 'eq', value: actor.FunctionCode }, { field: 'RoleCode', operator: 'in', value: employeeRoles }], pageSize: 1, select: ['ID', 'UserName', 'Email', 'UserKey', 'RoleCode', 'FunctionCode', 'AssignedCategories', 'IsActive', 'IsDirectPaymentAuthorized', '_etag'] }).then(function (data) { return data.items[0] || null; }); }
    function accessFilters(actor, input) {
        var filters = [], source = input && input.filters || {}, active = input && typeof input.isActive === 'boolean' ? input.isActive : null;
        if (source.status === 'active') { active = true; } if (source.status === 'inactive') { active = false; }
        if (typeof active === 'boolean') { filters.push({ field: 'IsActive', operator: 'eq', value: active }); }
        if (actor.RoleCode === 'MANAGER') { filters.push({ field: 'FunctionCode', operator: 'eq', value: actor.FunctionCode }); filters.push({ field: 'RoleCode', operator: 'in', value: employeeRoles }); }
        else { if (source.role && $.inArray(source.role, VMS.Constants.ROLES) >= 0) { filters.push({ field: 'RoleCode', operator: 'eq', value: source.role }); } if (source.functionCode && $.inArray(source.functionCode, VMS.Constants.FUNCTIONS) >= 0) { filters.push({ field: 'FunctionCode', operator: 'eq', value: source.functionCode }); } }
        if (source.category && Number(source.category) > 0) { filters.push({ field: 'AssignedCategories', operator: 'containsValue', value: Number(source.category) }); }
        return filters;
    }
    function SearchUsers(input) {
        if (VMS.Constants.USE_DUMMY_DATA && input && input.dummyHarness === true) { return VMS.Repositories.UserRepository.query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'UserName', direction: 'asc' }], pageSize: 100 }).then(function (data) { data.items = $.map(data.items, function (row) { return { UserName: row.UserName, Email: row.Email, UserKey: row.UserKey, RoleCode: row.RoleCode, FunctionCode: row.FunctionCode }; }); return VMS.Utilities.success(data); }); }
        return withIdentity(function (actor) {
            var page, size, filters, spec, countSpec;
            if (!isAdmin(actor) && actor.RoleCode !== 'MANAGER') { return denied('User search is not authorized.'); }
            input = input || {}; page = Math.max(1, Number(input.page || 1)); size = Number(input.pageSize) === 25 ? 25 : 10; filters = accessFilters(actor, input);
            spec = { search: { fields: ['UserName', 'Email'], value: input.search || '' }, filters: filters, authorizationScope: VMS.AuthorizationScope.build('userDB', actor, 'access-control'), sort: input.sort ? [input.sort] : [{ field: 'UserName', direction: 'asc' }, { field: 'ID', direction: 'asc' }], pageSize: size, continuationToken: input.continuationToken || null };
            countSpec = { search: spec.search, filters: filters, authorizationScope: spec.authorizationScope };
            if (actor.RoleCode === 'MANAGER') { spec.select = ['ID', 'UserName', 'Email', 'UserKey', 'RoleCode', 'FunctionCode', 'AssignedCategories', 'IsActive', 'IsDirectPaymentAuthorized', '_etag']; }
            return $.when(VMS.Repositories.UserRepository.query(spec), VMS.Repositories.UserRepository.count(countSpec)).then(function (data, count) { return VMS.Utilities.success({ items: $.map(data.items, function (row) { return safeUser(row, isAdmin(actor)); }), totalCount: count, page: page, pageSize: size, continuationToken: data.continuationToken }); });
        });
    }
    function GetUser(id) { return withIdentity(function (actor) { if (!isAdmin(actor) && actor.RoleCode !== 'MANAGER') { return denied(); } return scopedUser(actor, id).then(function (row) { return row ? VMS.Utilities.success(safeUser(row, isAdmin(actor))) : hidden(); }); }); }
    function GetAccessOptions() { return withIdentity(function (actor) { if (!isAdmin(actor) && actor.RoleCode !== 'MANAGER') { return denied(); } return VMS.Repositories.CategoryRepository.query({ filters: [{ field: 'IsActive', operator: 'eq', value: true }], sort: [{ field: 'DisplayLabel', direction: 'asc' }], pageSize: 1000 }).then(function (data) { var categories = $.grep(data.items, function (category) { return isAdmin(actor) || categoryEligible(actor.FunctionCode, category); }); return VMS.Utilities.success({ Roles: actor.RoleCode === 'MANAGER' ? employeeRoles.slice(0) : VMS.Constants.ROLES.slice(0), Functions: actor.RoleCode === 'MANAGER' ? [actor.FunctionCode] : VMS.Constants.FUNCTIONS.slice(0), Categories: categories, ShowAccessNotes: isAdmin(actor), ShowDirectPayment: isAdmin(actor) || (actor.RoleCode === 'MANAGER' && actor.FunctionCode === 'VENDOR_MANAGEMENT'), ManagerScope: actor.RoleCode === 'MANAGER' }); }); }); }
    function normalizeModel(model, existing, actor) {
        var candidate = $.extend({}, existing || {}, model || {}), errors = [], seen = {}, normalizedCategories = [];
        candidate.UserName = $.trim(String(candidate.UserName || '').replace(/\s+/g, ' ')); candidate.Email = $.trim(candidate.Email || ''); candidate.UserKey = VMS.Utilities.normalize(candidate.Email);
        candidate.RoleCode = String(candidate.RoleCode || ''); candidate.FunctionCode = String(candidate.FunctionCode || ''); candidate.IsActive = existing ? candidate.IsActive !== false : true;
        if (actor.RoleCode === 'MANAGER') { candidate.FunctionCode = actor.FunctionCode; }
        $.each(candidate.AssignedCategories || [], function (_, value) { var id = VMS.Utilities.lookupId(value); if (isFinite(id) && id > 0 && Math.floor(id) === id && !seen[id]) { seen[id] = true; normalizedCategories.push({ id: id, code: VMS.Utilities.lookupCode(value), label: VMS.Utilities.lookupLabel(value) }); } else { errors.push({ field: 'AssignedCategories', message: 'Assigned Categories must contain unique Category record IDs.' }); } });
        candidate.AssignedCategories = categoryApplicable(candidate) ? normalizedCategories : [];
        if (!candidate.UserName) { errors.push({ field: 'UserName', message: 'User Name is required.' }); }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate.Email)) { errors.push({ field: 'Email', message: 'A valid work email is required.' }); }
        if (!validCombination(candidate)) { errors.push({ field: 'RoleCode', message: 'The Role and Function combination is invalid.' }); }
        if (actor.RoleCode === 'MANAGER' && $.inArray(candidate.RoleCode, employeeRoles) < 0) { errors.push({ field: 'RoleCode', message: 'Managers may assign only Employee or Co-op.' }); }
        if (!isAdmin(actor) && candidate.RoleCode === 'UPPER_MANAGEMENT') { errors.push({ field: 'RoleCode', message: 'Only Admin or Super Admin may assign Upper Management.' }); }
        if (requiresCategories(candidate) && !candidate.AssignedCategories.length) { errors.push({ field: 'AssignedCategories', message: 'Assigned Categories are required.' }); }
        if (!candidate.IsActive || !(isVm(candidate) && isEmployee(candidate))) { candidate.IsDirectPaymentAuthorized = false; } else { candidate.IsDirectPaymentAuthorized = !!candidate.IsDirectPaymentAuthorized; }
        if (actor.RoleCode === 'MANAGER' && actor.FunctionCode !== 'VENDOR_MANAGEMENT') { candidate.IsDirectPaymentAuthorized = false; }
        if (actor.RoleCode === 'MANAGER') { candidate.AccessNotes = existing ? existing.AccessNotes || '' : ''; } else { candidate.AccessNotes = String(candidate.AccessNotes || ''); }
        return { model: candidate, errors: errors };
    }
    function lockoutCheck(actor, before, after) {
        if (isAdmin(actor) && Number(actor.ID) === Number(before.ID) && (!after.IsActive || $.inArray(after.RoleCode, adminRoles) < 0 || after.FunctionCode !== 'ADMINISTRATION')) { return resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'You cannot remove your own current Administration access.')); }
        if (before.RoleCode !== 'SUPER_ADMIN' || (after.IsActive && after.RoleCode === 'SUPER_ADMIN' && after.FunctionCode === 'ADMINISTRATION')) { return resolved(VMS.Utilities.success(true)); }
        return VMS.Repositories.UserRepository.count({ filters: [{ field: 'RoleCode', operator: 'eq', value: 'SUPER_ADMIN' }, { field: 'FunctionCode', operator: 'eq', value: 'ADMINISTRATION' }, { field: 'IsActive', operator: 'eq', value: true }, { field: 'ID', operator: 'ne', value: before.ID }] }).then(function (count) { return count > 0 ? VMS.Utilities.success(true) : VMS.Utilities.failure('VALIDATION_FAILED', 'The last active Super Administrator cannot be deactivated or demoted.'); });
    }
    function auditFields(row) { return { RoleCode: row.RoleCode, FunctionCode: row.FunctionCode, AssignedCategories: VMS.Utilities.clone(row.AssignedCategories || []), IsActive: !!row.IsActive, IsDirectPaymentAuthorized: !!row.IsDirectPaymentAuthorized }; }
    function preparePlatformAccess(actor, target) { if (!VMS.SharePointPermissionService || !VMS.SharePointPermissionService.PrepareAccessChange) { return resolved(VMS.Utilities.success({ PlatformAccessReady: true })); } return VMS.SharePointPermissionService.PrepareAccessChange(actor, target); }
    function saveAccess(actor, before, next, etag, actionCode, reason, actionRequestId, create) {
        var changed = { before: before ? auditFields(before) : null, after: auditFields(next) };
        return VMS.Services.BusinessActionService.Execute({ actionRequestId: actionRequestId || VMS.Utilities.guid(), entityType: 'USER_ACCESS', entityId: before ? before.ID : null, businessKey: next.UserKey, actionCode: actionCode, comment: reason || '', changedFields: changed, countsAsCompletedAction: false }, function () {
            var request = create ? VMS.Repositories.UserRepository.create(next) : VMS.Repositories.UserRepository.update(before.ID, next, etag);
            return request.then(function (saved) { if (!saved || saved.error) { return VMS.Utilities.failure('STALE_RECORD', 'The user record changed. Refresh before continuing.'); } return VMS.Utilities.success(auditFields(saved)); });
        }).then(function (result) { if (!result.ok) { return result; } return VMS.Repositories.UserRepository.getByKey(next.UserKey).then(function (fresh) { var output = VMS.Utilities.success(safeUser(fresh, isAdmin(actor))); output.actionRequestId = result.actionRequestId; return output; }); });
    }
    function GrantAccess(model, actionRequestId) { return withIdentity(function (actor) { var checked; if (!isAdmin(actor) && actor.RoleCode !== 'MANAGER') { return denied(); } if (actor.RoleCode === 'MANAGER' && model && Object.prototype.hasOwnProperty.call(model, 'AccessNotes')) { return denied('Managers cannot receive or mutate Access Notes.'); } checked = normalizeModel(model, null, actor); checked.model.IsActive = true; checked.model.IsDirectPaymentAuthorized = false; if (checked.errors.length) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Access details are invalid.', checked.errors); } return validateCategoryScope(checked.model).then(function (valid) { if (!valid) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Assigned Categories are invalid for this Function.', [{ field: 'AssignedCategories', message: 'Select active Categories allowed for this Function.' }]); } return VMS.Repositories.UserRepository.query({ filters: [{ field: 'UserKey', operator: 'eq', value: checked.model.UserKey }], pageSize: 2 }).then(function (data) { if (data.items.length) { var message = data.items[0].IsActive ? 'This user already has active access.' : 'An inactive identity already exists. Open that record to update or reactivate it.'; return VMS.Utilities.failure('DUPLICATE_KEY', message, [{ field: 'Email', message: message }]); } return preparePlatformAccess(actor, checked.model).then(function (platform) { return platform.ok ? saveAccess(actor, null, checked.model, null, 'GRANT_ACCESS', '', actionRequestId, true) : platform; }); }); }); }); }
    function UpdateAccess(id, patch, etag, actionRequestId) { return withIdentity(function (actor) { if (!isAdmin(actor) && actor.RoleCode !== 'MANAGER') { return denied(); } if (actor.RoleCode === 'MANAGER' && patch && Object.prototype.hasOwnProperty.call(patch, 'AccessNotes')) { return denied('Managers cannot receive or mutate Access Notes.'); } return scopedUser(actor, id).then(function (record) { var checked; if (!record) { return hidden(); } checked = normalizeModel($.extend({}, patch || {}, { Email: record.Email, UserKey: record.UserKey }), record, actor); if (checked.errors.length) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Access details are invalid.', checked.errors); } return validateCategoryScope(checked.model).then(function (valid) { if (!valid) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Assigned Categories are invalid for this Function.', [{ field: 'AssignedCategories', message: 'Select active Categories allowed for this Function.' }]); } return lockoutCheck(actor, record, checked.model).then(function (lockout) { if (!lockout.ok) { return lockout; } return preparePlatformAccess(actor, checked.model).then(function (platform) { return platform.ok ? saveAccess(actor, record, checked.model, etag, 'UPDATE_ACCESS', '', actionRequestId, false) : platform; }); }); }); }); }); }
    function SetUserActive(id, active, reason, etag, actionRequestId) { if (!$.trim(reason || '')) { return resolved(VMS.Utilities.failure('VALIDATION_FAILED', 'An administrative reason is required.', [{ field: 'Reason', message: 'Administrative Reason is required.' }])); } return withIdentity(function (actor) { return scopedUser(actor, id).then(function (record) { var checked; if (!record) { return hidden(); } checked = normalizeModel($.extend({}, record, { IsActive: !!active, IsDirectPaymentAuthorized: false }), record, actor); if (checked.errors.length) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Access details are invalid.', checked.errors); } return validateCategoryScope(checked.model).then(function (valid) { if (!valid) { return VMS.Utilities.failure('VALIDATION_FAILED', 'The user is not eligible for reactivation with the current Assigned Categories.'); } return lockoutCheck(actor, record, checked.model).then(function (lockout) { if (!lockout.ok) { return lockout; } return preparePlatformAccess(actor, checked.model).then(function (platform) { return platform.ok ? saveAccess(actor, record, checked.model, etag, active ? 'REACTIVATE_USER' : 'DEACTIVATE_USER', $.trim(reason), actionRequestId, false) : platform; }); }); }); }); }); }
    function SetDirectPaymentAuthorization(id, enabled, etag, actionRequestId) { return withIdentity(function (actor) { if (!isAdmin(actor) && !(actor.RoleCode === 'MANAGER' && isVm(actor))) { return denied('Direct Payment authorization is not permitted.'); } return scopedUser(actor, id).then(function (record) { var next; if (!record) { return hidden(); } next = $.extend({}, record, { IsDirectPaymentAuthorized: !!enabled }); if (enabled && (!record.IsActive || !isVm(record) || !isEmployee(record))) { return VMS.Utilities.failure('VALIDATION_FAILED', 'Direct Payment authorization is not eligible.', [{ field: 'IsDirectPaymentAuthorized', message: 'The user is not eligible for Direct Payment authorization.' }]); } return saveAccess(actor, record, next, etag, 'DIRECT_PAYMENT_PRIVILEGE_CHANGE', '', actionRequestId, false); }); }); }
    VMS.Services.AccessService = { ResolveCurrentUser: ResolveCurrentUser, AuthorizeRoute: AuthorizeRoute, AuthorizeInterface: AuthorizeInterface, AuthorizeRecord: AuthorizeRecord, AuthorizeAdministrationTab: AuthorizeAdministrationTab, GetAdministrationTabs: GetAdministrationTabs, SearchUsers: SearchUsers, GetUser: GetUser, GetAccessOptions: GetAccessOptions, GrantAccess: GrantAccess, UpdateAccess: UpdateAccess, SetUserActive: SetUserActive, SetDirectPaymentAuthorization: SetDirectPaymentAuthorization, RequiresCategories: requiresCategories, GetCurrentUser: function () { return VMS.Utilities.clone(currentUser); } };
}(window.VMS, window.jQuery));
