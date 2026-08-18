(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var R = VMS.Constants.ROLES;
    var F = VMS.Constants.FUNCTIONS;

    function isRole(user, roles) {
        return user && $.inArray(user.RoleCode, roles) >= 0;
    }

    function isAdmin(user) {
        return isRole(user, [R.ADMIN, R.SUPER_ADMIN]);
    }

    function isVM(user) {
        return user && user.FunctionCode === F.VENDOR_MANAGEMENT;
    }

    function isOperational(user) {
        return isRole(user, [R.EMPLOYEE, R.CO_OP]);
    }

    function isManager(user) {
        return user && user.RoleCode === R.MANAGER;
    }

    function categoryIds(user) {
        return VMS.Utilities.lookupIds(user && user.AssignedCategories ? user.AssignedCategories : []);
    }

    function containsCategory(user, record) {
        return $.inArray(VMS.Utilities.lookupId(record.Category), categoryIds(user)) >= 0;
    }

    function personEmail(person) {
        return VMS.Utilities.normalizeKey(person && person.email ? person.email : person);
    }

    function isAssociatedInvoice(user, record) {
        var key = VMS.Utilities.normalizeKey(user.Email);
        return personEmail(record.CreatedBy) === key || VMS.Utilities.normalizeKey(record.FocalPointEmail) === key;
    }

    function AccessService(repositories, config) {
        this.repositories = repositories;
        this.config = config;
        this.currentUser = null;
        this.mutationRunner = null;
    }

    AccessService.prototype.ConfigureMutationRunner = function (mutationRunner) {
        this.mutationRunner = mutationRunner;
    };

    AccessService.prototype.IsValidRoleFunction = function (roleCode, functionCode) {
        var roles = [R.SUPER_ADMIN, R.ADMIN, R.UPPER_MANAGEMENT, R.MANAGER, R.EMPLOYEE, R.CO_OP];
        var functions = [F.LFO_COMMERCIAL, F.LFO_MANUFACTURING, F.LFO_LEADERSHIP, F.EXCELLENCE, F.VENDOR_MANAGEMENT, F.EXECUTION, F.EDUCATION_PROGRAM, F.ADMINISTRATION];
        if ($.inArray(roleCode, roles) < 0 || $.inArray(functionCode, functions) < 0) {
            return false;
        }
        if (roleCode === R.ADMIN || roleCode === R.SUPER_ADMIN) {
            return functionCode === F.ADMINISTRATION;
        }
        return functionCode !== F.ADMINISTRATION;
    };

    AccessService.prototype.ResolveCurrentUser = function () {
        var self = this;
        var configuredKey;
        var identity;
        if (this.currentUser) {
            return $.Deferred().resolve(VMS.Utilities.clone(this.currentUser)).promise();
        }
        if (this.config.USE_DUMMY_DATA === true) {
            configuredKey = window.sessionStorage.getItem(this.config.DUMMY_USER_KEY) || this.config.DUMMY_CURRENT_USER_KEY;
            identity = $.Deferred().resolve({ email: configuredKey }).promise();
        } else if (this.repositories.users.provider && typeof this.repositories.users.provider.resolveCurrentUser === "function") {
            identity = this.repositories.users.provider.resolveCurrentUser();
        } else {
            identity = $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "Your VMS identity could not be resolved." }).promise();
        }
        return identity.then(function (current) {
            configuredKey = VMS.Utilities.normalizeKey(current && current.email);
            if (!configuredKey) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "Your VMS identity could not be resolved." }).promise();
            }
            return VMS.DomainHelpers.queryAll(self.repositories.users, { filters: [{ field: "UserKey", op: "eq", value: configuredKey }] });
        }).then(function (users) {
            var user = users.length === 1 ? users[0] : null;
            if (!user || user.IsActive !== true || !self.IsValidRoleFunction(user.RoleCode, user.FunctionCode)) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "Your VMS access is inactive or unavailable." }).promise();
            }
            self.currentUser = user;
            return VMS.Utilities.clone(user);
        });
    };

    AccessService.prototype.SetDummyCurrentUser = function (userKey) {
        if (this.config.USE_DUMMY_DATA !== true) {
            return false;
        }
        window.sessionStorage.setItem(this.config.DUMMY_USER_KEY, VMS.Utilities.normalizeKey(userKey));
        this.currentUser = null;
        return true;
    };

    AccessService.prototype._routeAllowed = function (user, routeCode, routeContext) {
        var allOperational = isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT || isVM(user) ||
            user.FunctionCode === F.EXECUTION || user.FunctionCode === F.EDUCATION_PROGRAM;
        if (routeCode === VMS.Constants.ROUTES.OVERVIEW) {
            return true;
        }
        if ($.inArray(routeCode, [VMS.Constants.ROUTES.VENDOR_LIST, VMS.Constants.ROUTES.VENDOR_PROFILE]) >= 0) {
            return isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT || isVM(user);
        }
        if ($.inArray(routeCode, [VMS.Constants.ROUTES.PRPO_REGISTER, VMS.Constants.ROUTES.PRPO_APPROVAL, VMS.Constants.ROUTES.PO_LINE_WORKSPACE]) >= 0) {
            return isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT || isVM(user);
        }
        if ($.inArray(routeCode, [VMS.Constants.ROUTES.INVOICE_REGISTER, VMS.Constants.ROUTES.INVOICE_DETAILS]) >= 0) {
            return allOperational;
        }
        if (routeCode === VMS.Constants.ROUTES.INVOICE_PROCESSING || routeCode === VMS.Constants.ROUTES.CHARGEBACK_PROCESSING) {
            return isAdmin(user) || (isVM(user) && isOperational(user));
        }
        if (routeCode === VMS.Constants.ROUTES.INVOICE_MANAGER_APPROVAL) {
            return isVM(user) && isManager(user);
        }
        if (routeCode === VMS.Constants.ROUTES.DIRECT_PAYMENT_REVIEW) {
            return isAdmin(user) || (isVM(user) && isOperational(user) && user.IsDirectPaymentAuthorized === true);
        }
        if (routeCode === VMS.Constants.ROUTES.DIRECT_PAYMENT_BATCH) {
            return isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT ||
                (isVM(user) && (isManager(user) || (isOperational(user) && user.IsDirectPaymentAuthorized === true)));
        }
        if ($.inArray(routeCode, [VMS.Constants.ROUTES.FEEDBACK_ASSIGNMENTS, VMS.Constants.ROUTES.FEEDBACK_FORM]) >= 0) {
            return isRole(user, [R.MANAGER, R.EMPLOYEE, R.CO_OP]) &&
                $.inArray(user.FunctionCode, [F.LFO_COMMERCIAL, F.LFO_MANUFACTURING, F.LFO_LEADERSHIP, F.VENDOR_MANAGEMENT, F.EXECUTION, F.EDUCATION_PROGRAM]) >= 0;
        }
        if (routeCode === VMS.Constants.ROUTES.REPORTS) {
            return isAdmin(user) || (isOperational(user) && $.inArray(user.FunctionCode, [F.EXCELLENCE, F.VENDOR_MANAGEMENT]) >= 0);
        }
        if (routeCode === VMS.Constants.ROUTES.ADMINISTRATION) {
            if (isAdmin(user)) {
                return true;
            }
            return isManager(user) && (!routeContext || !routeContext.tab || routeContext.tab === "access");
        }
        if (routeCode === VMS.Constants.ROUTES.PENDING_APPROVALS) {
            return isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT || (isVM(user) && isManager(user));
        }
        return false;
    };

    AccessService.prototype.AuthorizeRoute = function (routeCode, routeContext) {
        var self = this;
        return this.ResolveCurrentUser().then(function (user) {
            if (!self._routeAllowed(user, routeCode, routeContext || {})) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "You do not have access to this VMS area." }).promise();
            }
            return user;
        });
    };

    AccessService.prototype.GetAuthorizedRoutes = function () {
        var self = this;
        return this.ResolveCurrentUser().then(function (user) {
            var routes = [];
            var code;
            for (code in VMS.Constants.ROUTES) {
                if (Object.prototype.hasOwnProperty.call(VMS.Constants.ROUTES, code) && self._routeAllowed(user, code, code === "ADMINISTRATION" ? { tab: "access" } : {})) {
                    routes.push(code);
                }
            }
            return routes;
        });
    };

    AccessService.prototype.GetDummyUsers = function () {
        var self = this;
        if (this.config.USE_DUMMY_DATA !== true) {
            return $.Deferred().resolve([]).promise();
        }
        return this.ResolveCurrentUser().then(function () {
            return self.repositories.users.query({ filters: [{ field: "IsActive", op: "eq", value: true }], select: ["ID", "UserName", "UserKey", "RoleCode", "FunctionCode"], sort: [{ field: "UserName", direction: "ASC" }], pageSize: 10000 });
        }).then(function (result) { return result.items; });
    };

    AccessService.prototype.AuthorizeInterface = function (interfaceCode, context) {
        var routeByInterface = context && context.routeCode;
        if (!routeByInterface) {
            return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "The requested interface is unavailable." }).promise();
        }
        return this.AuthorizeRoute(routeByInterface, context);
    };

    AccessService.prototype._canRead = function (user, entityType, record) {
        if (entityType === VMS.Constants.ENTITY_TYPES.VENDOR || entityType === VMS.Constants.ENTITY_TYPES.PR_PO || entityType === VMS.Constants.ENTITY_TYPES.PO_LINE) {
            return isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT || isVM(user);
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.INVOICE) {
            if (record.IsActive !== true) {
                return false;
            }
            if (isAdmin(user) || user.RoleCode === R.UPPER_MANAGEMENT || (isVM(user) && isManager(user))) {
                return true;
            }
            if (isVM(user) && isOperational(user)) {
                return containsCategory(user, record) || (record.DirectPayment === true && user.IsDirectPaymentAuthorized === true);
            }
            return isAssociatedInvoice(user, record);
        }
        if (entityType === VMS.Constants.ENTITY_TYPES.FEEDBACK_ASSIGNMENT) {
            return VMS.Utilities.normalizeKey(record.AssignedUserEmail) === VMS.Utilities.normalizeKey(user.Email);
        }
        return isAdmin(user);
    };

    AccessService.prototype.AuthorizeRecord = function (entityType, record, operation) {
        var self = this;
        return this.ResolveCurrentUser().then(function (user) {
            if (!record || !self._canRead(user, entityType, record)) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, safeMessage: "The requested record is unavailable." }).promise();
            }
            if (operation && operation !== "READ" && !self.CanPerform(user, operation, record)) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "You are not authorized to perform this action." }).promise();
            }
            return { user: user, record: record };
        });
    };

    AccessService.prototype.CanPerform = function (user, actionCode, record) {
        if ($.inArray(actionCode, ["VENDOR_CREATE", "VENDOR_EVALUATE", "VENDOR_INTERVIEW"]) >= 0) {
            return isAdmin(user) || isVM(user);
        }
        if (actionCode === "PRPO_CREATE" || actionCode === "PO_CREATE" || actionCode === "PO_LINE_PROCESS") {
            return isAdmin(user) || (isVM(user) && isOperational(user));
        }
        if ($.inArray(actionCode, ["PRPO_APPROVE", "PRPO_RETURN", "PRPO_REJECT", "INVOICE_APPROVE", "INVOICE_RETURN", "DP_BATCH_APPROVE", "DP_BATCH_RETURN"]) >= 0) {
            return isVM(user) && isManager(user);
        }
        if (actionCode === "INVOICE_CREATE_EXECUTION") {
            return isAdmin(user) || (user.FunctionCode === F.EXECUTION && isRole(user, [R.MANAGER, R.EMPLOYEE, R.CO_OP]));
        }
        if (actionCode === "INVOICE_CREATE_EDUCATION_PROGRAM") {
            return isAdmin(user) || (user.FunctionCode === F.EDUCATION_PROGRAM && isRole(user, [R.MANAGER, R.EMPLOYEE, R.CO_OP]));
        }
        if ($.inArray(actionCode, ["DP_REVIEW_DONE", "DP_REVIEW_REJECT", "DP_BATCH_RELEASE", "DP_BATCH_PROCESS", "DP_BATCH_SETTLE"]) >= 0) {
            return isAdmin(user) || (isVM(user) && isOperational(user) && user.IsDirectPaymentAuthorized === true);
        }
        if ($.inArray(actionCode, ["INVOICE_PROCESS", "INVOICE_SETTLE"]) >= 0) {
            return isAdmin(user) || (isVM(user) && isOperational(user) && containsCategory(user, record));
        }
        if (actionCode === "FEEDBACK_SUBMIT") {
            return VMS.Utilities.normalizeKey(record.AssignedUserEmail) === VMS.Utilities.normalizeKey(user.Email) && record.AssignmentStatusCode === "OPEN" && record.IsActive === true;
        }
        if (actionCode.indexOf("ADMIN_") === 0) {
            return isAdmin(user);
        }
        return false;
    };

    AccessService.prototype.AuthorizeOperation = function (actionCode) {
        var self = this;
        return this.ResolveCurrentUser().then(function (user) {
            var allowed;
            if ($.inArray(actionCode, ["INVOICE_PROCESS", "INVOICE_SETTLE"]) >= 0) {
                allowed = isAdmin(user) || (isVM(user) && isOperational(user));
            } else if (actionCode === "FEEDBACK_SUBMIT") {
                allowed = isRole(user, [R.MANAGER, R.EMPLOYEE, R.CO_OP]) && user.FunctionCode !== F.ADMINISTRATION;
            } else {
                allowed = self.CanPerform(user, actionCode, {});
            }
            if (!allowed) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "You are not authorized to perform this action." }).promise();
            }
            return user;
        });
    };

    AccessService.prototype.GetScope = function (entityType, purpose) {
        var self = this;
        return this.ResolveCurrentUser().then(function (user) {
            var scope = { code: entityType + "_" + purpose, actorKey: user.UserKey, criteria: {}, predicate: function () { return true; } };
            if (entityType === VMS.Constants.ENTITY_TYPES.INVOICE) {
                scope.criteria = { role: user.RoleCode, functionCode: user.FunctionCode, categoryIds: categoryIds(user), includeAssociation: purpose !== "REPORT", directPaymentAuthorized: user.IsDirectPaymentAuthorized === true };
                scope.predicate = function (record) {
                    if (purpose === "REPORT") {
                        return record.IsActive === true && (isAdmin(user) || (isVM(user) && isOperational(user) && containsCategory(user, record)));
                    }
                    return self._canRead(user, entityType, record);
                };
            } else if (entityType === VMS.Constants.ENTITY_TYPES.FEEDBACK_ASSIGNMENT) {
                scope.criteria = { assignedUserEmail: user.Email };
                scope.predicate = function (record) { return self._canRead(user, entityType, record); };
            } else if (entityType === VMS.Constants.ENTITY_TYPES.USER && isManager(user) && !isAdmin(user)) {
                scope.criteria = { functionCode: user.FunctionCode, roles: [R.EMPLOYEE, R.CO_OP] };
                scope.predicate = function (record) { return record.FunctionCode === user.FunctionCode && isRole(record, [R.EMPLOYEE, R.CO_OP]); };
            }
            return { user: user, scope: scope };
        });
    };

    AccessService.prototype.SearchUsers = function (querySpec) {
        return this.GetScope(VMS.Constants.ENTITY_TYPES.USER, "ADMINISTRATION").then(function (result) {
            var spec = $.extend(true, {}, querySpec || {}, { authorizationScope: result.scope });
            return result.user && result.scope ? result : null;
        }).then(function (context) {
            var spec = $.extend(true, {}, querySpec || {}, { authorizationScope: context.scope });
            return this.repositories.users.query(spec);
        }.bind(this));
    };

    AccessService.prototype.GetAdministrationSummary = function () {
        return this.GetScope(VMS.Constants.ENTITY_TYPES.USER, "ADMINISTRATION").then(function (context) {
            return this.repositories.users.count({ filters: [{ field: "IsActive", op: "eq", value: true }], authorizationScope: context.scope });
        }.bind(this)).then(function (count) {
            return { activeUsers: Number(count || 0) };
        });
    };

    AccessService.prototype.GetAdministrationUser = function (id) {
        var self = this;
        var actor;
        return this.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "access" }).then(function (user) {
            actor = user;
            return self.repositories.users.getById(id);
        }).then(function (record) {
            if (!record || !self._authorizeAccessTarget(actor, record)) {
                return $.Deferred().reject({ code: VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, safeMessage: "The requested user is unavailable." }).promise();
            }
            record = VMS.Utilities.clone(record);
            if (!isAdmin(actor)) { delete record.AccessNotes; }
            return record;
        });
    };

    AccessService.prototype.GetAccessCategoryOptions = function () {
        return this.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "access" }).then(function (user) {
            return VMS.DomainHelpers.queryAll(this.repositories.categories, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "DisplayLabel", direction: "ASC" }] }).then(function (categories) {
                if (isAdmin(user)) { return categories; }
                if (user.FunctionCode === F.EDUCATION_PROGRAM) { return $.grep(categories, function (category) { return category.FunctionCode === F.EDUCATION_PROGRAM; }); }
                if (user.FunctionCode === F.EXECUTION) { return $.grep(categories, function (category) { return category.FunctionCode !== F.EDUCATION_PROGRAM && category.FunctionCode !== F.ADMINISTRATION; }); }
                if (user.FunctionCode === F.VENDOR_MANAGEMENT) { return $.grep(categories, function (category) { return category.FunctionCode !== F.ADMINISTRATION; }); }
                return [];
            });
        }.bind(this));
    };

    AccessService.prototype._authorizeAccessTarget = function (actor, target) {
        if (isAdmin(actor)) {
            return true;
        }
        return isManager(actor) && target && target.FunctionCode === actor.FunctionCode && isRole(target, [R.EMPLOYEE, R.CO_OP]);
    };

    AccessService.prototype._validateAccessModel = function (actor, input, existing) {
        var self = this;
        var errors = [];
        var roleCode = input.RoleCode;
        var functionCode = input.FunctionCode;
        var assigned = input.AssignedCategories || [];
        var needsCategories;
        var normalizedAssigned = [];
        if (roleCode === R.ADMIN || roleCode === R.SUPER_ADMIN) {
            functionCode = F.ADMINISTRATION;
        }
        if (!isAdmin(actor)) {
            roleCode = $.inArray(roleCode, [R.EMPLOYEE, R.CO_OP]) >= 0 ? roleCode : null;
            functionCode = actor.FunctionCode;
        }
        if (!roleCode || !this.IsValidRoleFunction(roleCode, functionCode)) {
            errors.push(VMS.ValidationService.error("RoleCode", "INVALID_ROLE_FUNCTION", "Select a valid Role and Function combination."));
        }
        if (!VMS.Utilities.trim(input.UserName)) {
            errors.push(VMS.ValidationService.error("UserName", "REQUIRED", "User Name is required."));
        }
        if (!existing && !VMS.ValidationService.email(input.Email)) {
            errors.push(VMS.ValidationService.error("Email", "INVALID_EMAIL", "Enter a valid work email."));
        }
        needsCategories = (roleCode === R.EMPLOYEE || roleCode === R.CO_OP) && $.inArray(functionCode, [F.VENDOR_MANAGEMENT, F.EXECUTION, F.EDUCATION_PROGRAM]) >= 0 && input.IsActive !== false;
        if (needsCategories && !assigned.length) {
            errors.push(VMS.ValidationService.error("AssignedCategories", "REQUIRED", "At least one eligible Assigned Category is required."));
        }
        if (!needsCategories) {
            assigned = [];
        }
        return VMS.DomainHelpers.queryAll(this.repositories.categories, { filters: [{ field: "IsActive", op: "eq", value: true }] }).then(function (categories) {
            var byId = {};
            var ids = VMS.Utilities.lookupIds(assigned);
            $.each(categories, function (_, category) { byId[category.ID] = category; });
            if (VMS.Utilities.unique(ids).length !== ids.length) {
                errors.push(VMS.ValidationService.error("AssignedCategories", "DUPLICATE_CATEGORY", "Assigned Categories cannot contain duplicates."));
            }
            $.each(ids, function (_, id) {
                var category = byId[id];
                var allowed = category && category.FunctionCode !== F.ADMINISTRATION;
                if (allowed && functionCode === F.EDUCATION_PROGRAM) { allowed = category.FunctionCode === F.EDUCATION_PROGRAM; }
                if (allowed && functionCode === F.EXECUTION) { allowed = category.FunctionCode !== F.EDUCATION_PROGRAM; }
                if (!allowed) { errors.push(VMS.ValidationService.error("AssignedCategories", "INVALID_CATEGORY", "One or more Assigned Categories are not eligible for the selected access.")); }
                if (allowed) { normalizedAssigned.push({ id: category.ID, code: category.CategoryCode, label: category.DisplayLabel }); }
            });
            return {
                errors: errors,
                model: {
                    UserName: VMS.Utilities.collapseWhitespace(input.UserName),
                    FunctionCode: functionCode,
                    RoleCode: roleCode,
                    AssignedCategories: normalizedAssigned,
                    IsActive: input.IsActive !== false,
                    AccessNotes: isAdmin(actor) ? VMS.Utilities.trim(input.AccessNotes) : (existing ? existing.AccessNotes : ""),
                    IsDirectPaymentAuthorized: input.IsDirectPaymentAuthorized === true && functionCode === F.VENDOR_MANAGEMENT && (roleCode === R.EMPLOYEE || roleCode === R.CO_OP) && input.IsActive !== false
                }
            };
        });
    };

    AccessService.prototype.GrantAccess = function (input, actionRequestId) {
        var self = this;
        var actor;
        var validated;
        var key = VMS.Utilities.normalizeKey(input.Email);
        return this.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "access" }).then(function (user) {
            actor = user;
            return self._validateAccessModel(actor, input, null);
        }).then(function (value) {
            validated = value;
            if (validated.errors.length) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Access Control fields.", validated.errors); }
            return VMS.DomainHelpers.queryAll(self.repositories.users, { filters: [{ field: "UserKey", op: "eq", value: key }] });
        }).then(function (duplicates) {
            if (duplicates.length) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, duplicates[0].IsActive ? "This user already has active VMS access." : "This user already exists. Update or reactivate the existing record."); }
            if (!self.mutationRunner) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.SERVICE_UNAVAILABLE, "Access mutation services are unavailable."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_ACCESS_GRANT", entityTypeCode: "USER", businessKey: key, countsAsCompletedAction: false, successMessage: "VMS access was granted." }, function () {
                return self.repositories.users.create($.extend({}, validated.model, { Email: VMS.Utilities.trim(input.Email), UserKey: key }), VMS.DomainHelpers.actorContext(actor));
            }, function (created) {
                return { eventCode: "ACCESS_GRANTED", context: { record: created } };
            });
        });
    };

    AccessService.prototype.UpdateAccess = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var target;
        var validated;
        return this.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "access" }).then(function (user) { actor = user; return self.repositories.users.getById(id); }).then(function (record) {
            target = record;
            if (!self._authorizeAccessTarget(actor, target)) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested access record is unavailable."); }
            input.Email = target.Email;
            return self._validateAccessModel(actor, input, target);
        }).then(function (value) {
            validated = value;
            if (validated.errors.length) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Access Control fields.", validated.errors); }
            if (VMS.Utilities.normalizeKey(actor.UserKey) === VMS.Utilities.normalizeKey(target.UserKey) && isAdmin(actor) && (validated.model.RoleCode !== target.RoleCode || validated.model.FunctionCode !== F.ADMINISTRATION)) {
                return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An Admin or Super Admin cannot remove their own privileged access.");
            }
            if (target.RoleCode === R.SUPER_ADMIN && validated.model.RoleCode !== R.SUPER_ADMIN) {
                return VMS.DomainHelpers.queryAll(self.repositories.users, { filters: [{ field: "RoleCode", op: "eq", value: R.SUPER_ADMIN }, { field: "IsActive", op: "eq", value: true }] }).then(function (supers) {
                    if ($.grep(supers, function (item) { return item.ID !== target.ID; }).length < 1) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The last active Super Admin cannot be demoted."); }
                });
            }
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_ACCESS_UPDATE", entityTypeCode: "USER", entityItemId: id, businessKey: target.UserKey, countsAsCompletedAction: false, successMessage: "VMS access was updated." }, function () {
                return self.repositories.users.update(id, validated.model, expectedEtag || target._etag, VMS.DomainHelpers.actorContext(actor));
            });
        });
    };

    AccessService.prototype.SetUserActive = function (id, expectedEtag, active, reason, actionRequestId) {
        var self = this;
        var actor;
        var target;
        var validationInput;
        if (!VMS.Utilities.trim(reason)) {
            return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An administrative reason is required.");
        }
        return this.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "access" }).then(function (user) { actor = user; return self.repositories.users.getById(id); }).then(function (record) {
            target = record;
            if (!self._authorizeAccessTarget(actor, target)) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested access record is unavailable."); }
            if (active !== true && VMS.Utilities.normalizeKey(actor.UserKey) === VMS.Utilities.normalizeKey(target.UserKey) && isAdmin(actor)) {
                return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An Admin or Super Admin cannot deactivate their own access.");
            }
            if (target.RoleCode === R.SUPER_ADMIN && active !== true) {
                return VMS.DomainHelpers.queryAll(self.repositories.users, { filters: [{ field: "RoleCode", op: "eq", value: R.SUPER_ADMIN }, { field: "IsActive", op: "eq", value: true }] }).then(function (supers) {
                    if (supers.length <= 1) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The last active Super Admin cannot be deactivated."); }
                });
            }
            if (active === true) {
                validationInput = {
                    UserName: target.UserName,
                    Email: target.Email,
                    RoleCode: target.RoleCode,
                    FunctionCode: target.FunctionCode,
                    AssignedCategories: target.AssignedCategories || [],
                    IsActive: true,
                    AccessNotes: target.AccessNotes,
                    IsDirectPaymentAuthorized: false
                };
                return self._validateAccessModel(actor, validationInput, target).then(function (validated) {
                    if (validated.errors.length) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The user cannot be reactivated until their access model is valid.", validated.errors); }
                });
            }
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: active ? "ADMIN_ACCESS_REACTIVATE" : "ADMIN_ACCESS_DEACTIVATE", entityTypeCode: "USER", entityItemId: id, businessKey: target.UserKey, comment: VMS.Utilities.trim(reason), countsAsCompletedAction: false, successMessage: "User activation was updated." }, function () {
                return self.repositories.users.update(id, { IsActive: active === true, IsDirectPaymentAuthorized: false }, expectedEtag || target._etag, VMS.DomainHelpers.actorContext(actor));
            });
        });
    };

    AccessService.prototype.SetDirectPaymentAuthorization = function (id, expectedEtag, authorized, actionRequestId) {
        var self = this;
        var actor;
        var target;
        return this.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: "access" }).then(function (user) { actor = user; return self.repositories.users.getById(id); }).then(function (record) {
            target = record;
            if (!self._authorizeAccessTarget(actor, target) || (authorized === true && !(target.IsActive === true && target.FunctionCode === F.VENDOR_MANAGEMENT && isRole(target, [R.EMPLOYEE, R.CO_OP])))) { return VMS.DomainHelpers.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested access record is unavailable or ineligible."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: authorized ? "ADMIN_DP_AUTH_GRANT" : "ADMIN_DP_AUTH_REMOVE", entityTypeCode: "USER", entityItemId: id, businessKey: target.UserKey, countsAsCompletedAction: false, successMessage: "Direct Payment Authorization was updated." }, function () {
                return self.repositories.users.update(id, { IsDirectPaymentAuthorized: authorized === true }, expectedEtag || target._etag, VMS.DomainHelpers.actorContext(actor));
            });
        });
    };

    VMS.AccessService = AccessService;
}(window, window.jQuery));
