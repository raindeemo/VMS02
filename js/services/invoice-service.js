(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;
    var F = VMS.Constants.FUNCTIONS;
    var SAFE_DETAIL_FIELDS = [
        "ID", "InvoiceIdentifier", "InvoiceSourceFunctionCode", "InvoiceNumber", "POLine", "POLineKeySnapshot",
        "Vendor", "VendorCodeSnapshot", "VendorNameSnapshot", "VendorCountrySnapshot", "Category", "RegionCode",
        "FocalPointName", "ManagedByCode", "ClassStartDate", "ClassEndDate", "ClassCode1", "ClassCode2", "ClassCode3",
        "MEALearnerCount", "GlobalLearnerCount", "StudentCount", "DirectPayment", "AdvancePayment", "Comment", "SESNumber",
        "SESDate", "CostCenter", "Currency", "CurrencyCodeSnapshot", "ConversionRateUsed", "ConversionRateModifiedDate",
        "TotalPrice", "TotalPriceInSAR", "HasDiscount", "DiscountInputTypeCode", "DiscountInputValue", "DiscountAmount",
        "NetAmountBeforeVAT", "HasVAT", "VATInputTypeCode", "VATInputValue", "VATAmount", "VATAmountInSAR",
        "FinalInvoiceAmount", "FinalInvoiceAmountInSAR", "WorkflowApproved", "RejectionReasonCode", "RejectionComment",
        "EBillingSettlement", "LMSSettlement", "DirectPaymentCompleted", "DirectPaymentDate", "AggregationPeriod",
        "AggregationBatchKey", "AggregationReleaseDate", "StageCode", "StatusCode", "InvoiceInitiationDate", "ProcessingDate",
        "WorkflowApprovalDate", "ChargebackDate", "SettlementDate", "IsActive", "CreatedBy", "Created", "Modified", "_etag"
    ];

    function InvoiceService(repositories, accessService, mutationRunner, poLineService) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
        this.poLineService = poLineService;
    }

    InvoiceService.prototype._authorize = function (actionCode, record) {
        var self = this;
        return this.accessService.ResolveCurrentUser().then(function (user) {
            if (!self.accessService.CanPerform(user, actionCode, record || {})) {
                return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "You are not authorized to perform this Invoice action.");
            }
            return user;
        });
    };

    InvoiceService.prototype._loadForAction = function (actionCode, id) {
        var self = this;
        var actor;
        return this.accessService.AuthorizeOperation(actionCode).then(function (user) {
            actor = user;
            return self.repositories.invoices.getById(id);
        }).then(function (record) {
            if (!record || !self.accessService.CanPerform(actor, actionCode, record)) {
                return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested Invoice is unavailable.");
            }
            return { user: actor, record: record };
        });
    };

    InvoiceService.prototype._identifier = function (dateValue, id) {
        var date = new Date(new Date(dateValue).getTime() + (3 * 60 * 60 * 1000));
        var pad = function (value) { return value < 10 ? "0" + value : String(value); };
        return "INV-" + pad(date.getUTCDate()) + pad(date.getUTCMonth() + 1) + date.getUTCFullYear() + "-" + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + "-" + id;
    };

    InvoiceService.prototype._validateCreation = function (input, sourceFunction) {
        var errors = [];
        var classCodes = [];
        if (!input.Category || !input.FocalPointEmail) {
            errors.push(VMS.ValidationService.error("Category", "REQUIRED", "Category and Focal Point are required."));
        }
        VMS.ValidationService.attachments(input.Attachments, ["pdf", "docx"], true, "Attachments", errors);
        if (input.DirectPayment === true) {
            if (!VMS.ValidationService.httpsUrl(input.PaymentLink)) {
                errors.push(VMS.ValidationService.error("PaymentLink", "INVALID_URL", "Payment Link must be a valid HTTPS URL."));
            }
            VMS.ValidationService.required(input.DirectInformation, "DirectInformation", "Direct Information", errors);
        }
        if (sourceFunction === F.EXECUTION) {
            VMS.ValidationService.required(input.RegionCode, "RegionCode", "Region", errors);
            VMS.ValidationService.required(input.ManagedByCode, "ManagedByCode", "Managed By", errors);
            if (!input.ClassStartDate || !input.ClassEndDate || new Date(input.ClassEndDate).getTime() < new Date(input.ClassStartDate).getTime()) {
                errors.push(VMS.ValidationService.error("ClassEndDate", "INVALID_DATE_RANGE", "Class End Date must be on or after Class Start Date."));
            }
            $.each([input.ClassCode1, input.ClassCode2, input.ClassCode3], function (_, code) {
                if (VMS.Utilities.trim(code)) { classCodes.push(VMS.Utilities.trim(code)); }
            });
            if (!classCodes.length || !/^[0-9]{1,6}$/.test(classCodes[0])) {
                errors.push(VMS.ValidationService.error("ClassCode1", "INVALID_CLASS_CODE", "At least one Class Code containing 1 to 6 digits is required."));
            }
            if (VMS.Utilities.unique(classCodes).length !== classCodes.length) {
                errors.push(VMS.ValidationService.error("ClassCode2", "DUPLICATE_CLASS_CODE", "Class Codes must be distinct."));
            }
            $.each(classCodes, function (_, code) {
                if (!/^[0-9]{1,6}$/.test(code)) { errors.push(VMS.ValidationService.error("ClassCode", "INVALID_CLASS_CODE", "Each Class Code must contain 1 to 6 digits.")); }
            });
            VMS.ValidationService.wholeNumber(input.MEALearnerCount, "MEALearnerCount", "MEA Learner Count", errors, true);
            VMS.ValidationService.wholeNumber(input.GlobalLearnerCount, "GlobalLearnerCount", "Global Learner Count", errors, true);
        } else if (input.StudentCount !== "" && input.StudentCount !== null && input.StudentCount !== undefined) {
            VMS.ValidationService.wholeNumber(input.StudentCount, "StudentCount", "Student Count", errors, true);
        }
        return { errors: errors, classCodes: classCodes };
    };

    InvoiceService.prototype.GetCreationLookups = function (sourceFunction) {
        var self = this;
        var actor;
        var actionCode = sourceFunction === F.EXECUTION ? "INVOICE_CREATE_EXECUTION" : sourceFunction === F.EDUCATION_PROGRAM ? "INVOICE_CREATE_EDUCATION_PROGRAM" : "";
        if (!actionCode) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The Invoice source Function is invalid."); }
        return this.accessService.AuthorizeOperation(actionCode).then(function (user) {
            actor = user;
            return $.when(
                H.queryAll(self.repositories.vendors, { filters: [{ field: "StageCode", op: "eq", value: "APPROVED" }, { field: "StatusCode", op: "eq", value: "APPROVED" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "DisplayName", direction: "ASC" }] }),
                H.queryAll(self.repositories.categories, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: [{ field: "DisplayLabel", direction: "ASC" }] }),
                H.queryAll(self.repositories.users, { filters: [{ field: "FunctionCode", op: "eq", value: sourceFunction }, { field: "RoleCode", op: "eq", value: "EMPLOYEE" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "UserName", direction: "ASC" }] }),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["REGION", "INVOICE_MANAGED_BY"] }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "SortOrder", direction: "ASC" }] })
            );
        }).then(function (vendors, categories, users, configuration) {
            categories = $.grep(categories, function (category) {
                return category.FunctionCode !== F.ADMINISTRATION && (sourceFunction === F.EDUCATION_PROGRAM ? category.FunctionCode === F.EDUCATION_PROGRAM : category.FunctionCode !== F.EDUCATION_PROGRAM);
            });
            if ($.inArray(actor.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0) {
                categories = $.grep(categories, function (category) { return $.inArray(category.ID, VMS.Utilities.lookupIds(actor.AssignedCategories || [])) >= 0; });
            }
            return { vendors: vendors, categories: categories, focalPoints: users, configuration: configuration };
        });
    };

    InvoiceService.prototype._create = function (sourceFunction, input, actionRequestId) {
        var self = this;
        var actionCode = sourceFunction === F.EXECUTION ? "INVOICE_CREATE_EXECUTION" : "INVOICE_CREATE_EDUCATION_PROGRAM";
        var validated = this._validateCreation(input, sourceFunction);
        var actor;
        var vendor;
        var category;
        var focal;
        var initiated;
        if (validated.errors.length) {
            return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Invoice fields.", validated.errors);
        }
        return this._authorize(actionCode).then(function (user) {
            actor = user;
            if (input.DirectPayment === true) {
                return H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE").then(function (setting) {
                    return H.queryAll(self.repositories.vendors, { filters: [{ field: "VendorCodeNormalizedKey", op: "eq", value: VMS.Utilities.normalizeKey(setting.TextValue) }] });
                }).then(function (vendors) { return vendors.length === 1 ? vendors[0] : null; });
            }
            return self.repositories.vendors.getById(VMS.Utilities.lookupId(input.Vendor));
        }).then(function (value) {
            vendor = value;
            return $.when(
                self.repositories.categories.getById(VMS.Utilities.lookupId(input.Category)),
                self.repositories.users.getByKey(input.FocalPointEmail),
                H.setting(self.repositories, "MAX_CLASS_CODES"),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["REGION", "INVOICE_MANAGED_BY"] }, { field: "IsActive", op: "eq", value: true }] })
            );
        }).then(function (categoryValue, focalValue, maxClassSetting, creationOptions) {
            var regionValid;
            var managedByValid;
            category = categoryValue;
            focal = focalValue;
            if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED" || (input.DirectPayment === true && vendor.VendorProcessingTypeCode !== "DIRECT")) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The selected or configured Vendor is not eligible.");
            }
            if (!category || category.IsActive !== true || category.FunctionCode === F.ADMINISTRATION || (sourceFunction === F.EDUCATION_PROGRAM && category.FunctionCode !== F.EDUCATION_PROGRAM) || (sourceFunction === F.EXECUTION && category.FunctionCode === F.EDUCATION_PROGRAM)) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, sourceFunction === F.EXECUTION ? "Select an active Category from the Execution Category family." : "Select an active Education Program Category.");
            }
            if (!focal || focal.IsActive !== true || focal.RoleCode !== "EMPLOYEE" || focal.FunctionCode !== sourceFunction) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active Employee in the Invoice source Function as Focal Point.");
            }
            if (!($.inArray(actor.RoleCode, ["ADMIN", "SUPER_ADMIN", "MANAGER"]) >= 0) && $.inArray(category.ID, VMS.Utilities.lookupIds(actor.AssignedCategories || [])) < 0) {
                return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "The selected Category is outside your authorized scope.");
            }
            if (sourceFunction === F.EXECUTION && validated.classCodes.length > Number(maxClassSetting.NumericValue)) {
                return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The configured maximum number of Class Codes was exceeded.");
            }
            if (sourceFunction === F.EXECUTION) {
                regionValid = $.grep(creationOptions, function (option) { return option.GroupCode === "REGION" && option.ItemCode === input.RegionCode; }).length === 1;
                managedByValid = $.grep(creationOptions, function (option) { return option.GroupCode === "INVOICE_MANAGED_BY" && option.ItemCode === input.ManagedByCode; }).length === 1;
                if (!regionValid || !managedByValid) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select active Region and Managed By options."); }
            }
            initiated = VMS.ClockService.utcNow();
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: actionCode, entityTypeCode: "INVOICE", toStageCode: input.DirectPayment === true ? "DIRECT_PAYMENT_REVIEW" : "INVOICE_PROCESSING", toStatusCode: "IN_PROGRESS", successCode: "INVOICE_CREATED", successMessage: "Invoice was created." }, function () {
                return self.repositories.invoices.create({
                    InvoiceIdentifier: "",
                    InvoiceSourceFunctionCode: sourceFunction,
                    InvoiceNumber: "",
                    VendorInvoiceKey: "",
                    POLine: null,
                    POLineKeySnapshot: "",
                    Vendor: { id: vendor.ID, title: vendor.DisplayName },
                    VendorCodeSnapshot: vendor.VendorCode,
                    VendorNameSnapshot: vendor.VendorName,
                    VendorEmailSnapshot: vendor.Email,
                    VendorCountrySnapshot: vendor.Country ? vendor.Country.title : "",
                    Category: { id: category.ID, title: category.DisplayLabel },
                    RegionCode: sourceFunction === F.EXECUTION ? input.RegionCode : "",
                    FocalPointName: focal.UserName,
                    FocalPointEmail: focal.Email,
                    ManagedByCode: sourceFunction === F.EXECUTION ? input.ManagedByCode : "",
                    ClassStartDate: sourceFunction === F.EXECUTION ? new Date(input.ClassStartDate).toISOString() : null,
                    ClassEndDate: sourceFunction === F.EXECUTION ? new Date(input.ClassEndDate).toISOString() : null,
                    ClassCode1: sourceFunction === F.EXECUTION ? validated.classCodes[0] : "",
                    ClassCode2: sourceFunction === F.EXECUTION ? (validated.classCodes[1] || "") : "",
                    ClassCode3: sourceFunction === F.EXECUTION ? (validated.classCodes[2] || "") : "",
                    MEALearnerCount: sourceFunction === F.EXECUTION ? Number(input.MEALearnerCount) : 0,
                    GlobalLearnerCount: sourceFunction === F.EXECUTION ? Number(input.GlobalLearnerCount) : 0,
                    StudentCount: sourceFunction === F.EDUCATION_PROGRAM && input.StudentCount !== "" ? Number(input.StudentCount) : null,
                    DirectPayment: input.DirectPayment === true,
                    AdvancePayment: input.AdvancePayment === true,
                    Attachments: [],
                    PaymentLink: input.DirectPayment === true ? VMS.Utilities.trim(input.PaymentLink) : "",
                    DirectInformation: input.DirectPayment === true ? VMS.Utilities.trim(input.DirectInformation) : "",
                    Comment: VMS.Utilities.trim(input.Comment),
                    SESNumber: "",
                    SESDate: null,
                    CostCenter: "",
                    Currency: null,
                    CurrencyCodeSnapshot: "",
                    ConversionRateUsed: null,
                    ConversionRateModifiedDate: null,
                    TotalPrice: null,
                    TotalPriceInSAR: null,
                    HasDiscount: false,
                    DiscountInputTypeCode: "",
                    DiscountInputValue: null,
                    DiscountAmount: null,
                    NetAmountBeforeVAT: null,
                    HasVAT: false,
                    VATInputTypeCode: "",
                    VATInputValue: null,
                    VATAmount: null,
                    VATAmountInSAR: null,
                    FinalInvoiceAmount: null,
                    FinalInvoiceAmountInSAR: null,
                    WorkflowApproved: false,
                    RejectionReasonCode: "",
                    RejectionComment: "",
                    EBillingSettlement: null,
                    LMSSettlement: null,
                    DirectPaymentCompleted: false,
                    DirectPaymentDate: null,
                    DirectPaymentConfirmedBy: null,
                    AggregationPeriod: "",
                    AggregationBatchKey: "",
                    AggregationReleaseDate: null,
                    AggregationReleasedBy: null,
                    StageCode: input.DirectPayment === true ? "DIRECT_PAYMENT_REVIEW" : "INVOICE_PROCESSING",
                    StatusCode: "IN_PROGRESS",
                    InvoiceInitiationDate: initiated,
                    ProcessingDate: null,
                    WorkflowApprovalDate: null,
                    ChargebackDate: null,
                    SettlementDate: null,
                    BatchVersion: 0,
                    BatchLockToken: "",
                    BatchLockExpiresAt: null,
                    BatchOperationStateCode: "NONE",
                    BatchOperationId: "",
                    BatchOperationPayloadJSON: "",
                    IsActive: false
                }, H.actorContext(actor)).then(function (created) {
                    var identifier = self._identifier(initiated, created.ID);
                    return self.repositories.invoices.update(created.ID, { InvoiceIdentifier: identifier }, created._etag, H.actorContext(actor)).then(function (identified) {
                        return self.repositories.invoices.addAttachments(identified.ID, input.Attachments, H.actorContext(actor));
                    }).then(function (withFiles) {
                        return $.when(self.repositories.invoices.getById(withFiles.ID), self.repositories.invoices.getAttachments(withFiles.ID));
                    }).then(function (complete, files) {
                        if (!complete || !complete.InvoiceIdentifier || !files || files.length < 1) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "Invoice creation could not be verified and requires reconciliation."); }
                        return self.repositories.invoices.update(complete.ID, { IsActive: true }, complete._etag, H.actorContext(actor));
                    });
                });
            }, function (record) {
                return { eventCode: "INVOICE_CREATED", context: { record: record } };
            });
        });
    };

    InvoiceService.prototype.CreateExecution = function (input, actionRequestId) { return this._create(F.EXECUTION, input, actionRequestId); };
    InvoiceService.prototype.CreateEducationProgram = function (input, actionRequestId) { return this._create(F.EDUCATION_PROGRAM, input, actionRequestId); };

    InvoiceService.prototype.Query = function (querySpec) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.INVOICE_REGISTER).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "REGISTER");
        }).then(function (context) {
            var spec = $.extend(true, {}, querySpec || {}, { authorizationScope: context.scope });
            spec.filters = (spec.filters || []).concat([{ field: "IsActive", op: "eq", value: true }]);
            return self.repositories.invoices.query(spec);
        });
    };

    InvoiceService.prototype.Get = function (id, key) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.INVOICE_DETAILS).then(function () {
            return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "DETAIL");
        }).then(function (context) {
            return self.repositories.invoices.query({ filters: [{ field: "ID", op: "eq", value: Number(id) }, { field: "IsActive", op: "eq", value: true }], authorizationScope: context.scope, select: SAFE_DETAIL_FIELDS, pageSize: 1 });
        }).then(function (result) {
            var record = result.items.length === 1 ? result.items[0] : null;
            return H.verifyDeepLink(record && record.IsActive === true ? record : null, id, key, record ? record.InvoiceIdentifier : "");
        });
    };

    InvoiceService.prototype.GetEligiblePOLines = function (id) {
        var self = this;
        var record;
        return this._loadForAction("INVOICE_PROCESS", id).then(function (context) {
            record = context.record;
            if (record.DirectPayment === true || record.StageCode !== "INVOICE_PROCESSING" || record.StatusCode !== "IN_PROGRESS") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not available for standard processing."); }
            return H.queryAll(self.repositories.poLines, { filters: [{ field: "VendorCodeSnapshot", op: "eq", value: record.VendorCodeSnapshot }, { field: "LineRequestStageCode", op: "eq", value: "ACTIVE" }, { field: "LineRequestStatusCode", op: "eq", value: "APPROVED" }, { field: "POLineStatusCode", op: "in", value: ["ACTIVE", "THRESHOLD_REACHED"] }, { field: "IsCancelled", op: "eq", value: false }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "POLineKey", direction: "ASC" }] });
        }).then(function (lines) { return $.grep(lines, function (line) { return Number(line.RemainingBalance) > 0; }); });
    };

    InvoiceService.prototype.GetRegisterSummary = function () {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.INVOICE_REGISTER).then(function () { return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "SUMMARY"); }).then(function (context) {
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "IsActive", op: "eq", value: true }], authorizationScope: context.scope });
        }).then(function (rows) {
            var output = { inProgress: 0, rejected: 0, settled: 0 };
            $.each(rows, function (_, row) { if (row.StatusCode === "IN_PROGRESS") { output.inProgress += 1; } if (row.StatusCode === "REJECTED") { output.rejected += 1; } if (row.StatusCode === "SETTLED") { output.settled += 1; } });
            return output;
        });
    };

    InvoiceService.prototype.GetVendorSummary = function (vendorId) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.VENDOR_PROFILE).then(function () { return self.accessService.GetScope(VMS.Constants.ENTITY_TYPES.INVOICE, "SUMMARY"); }).then(function (context) {
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "Vendor.id", op: "eq", value: Number(vendorId) }, { field: "IsActive", op: "eq", value: true }], authorizationScope: context.scope });
        }).then(function (rows) {
            var output = { total: rows.length, inProcess: 0, settled: 0 };
            $.each(rows, function (_, row) { if (row.StatusCode === "IN_PROGRESS") { output.inProcess += 1; } if (row.StatusCode === "SETTLED") { output.settled += 1; } });
            return output;
        });
    };

    InvoiceService.prototype.ReviewDirectPaymentDone = function (id, expectedEtag, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var period;
        return this._loadForAction("DP_REVIEW_DONE", id).then(function (context) {
            actor = context.user;
            record = context.record;
            if (!record || record.DirectPayment !== true || record.DirectPaymentCompleted === true || record.StageCode !== "DIRECT_PAYMENT_REVIEW" || record.StatusCode !== "IN_PROGRESS") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Direct Payment Invoice is not awaiting review."); }
            if (!VMS.ValidationService.httpsUrl(record.PaymentLink) || !VMS.Utilities.trim(record.DirectInformation)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The required Direct Payment information is incomplete."); }
            return $.when(H.setting(self.repositories, "DIRECT_PAYMENT_VENDOR_CODE"), self.repositories.vendors.getById(VMS.Utilities.lookupId(record.Vendor)), self.repositories.invoices.getAttachments(record.ID));
        }).then(function (setting, vendor, attachments) {
            if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED" || vendor.VendorProcessingTypeCode !== "DIRECT" || VMS.Utilities.normalizeKey(vendor.VendorCode) !== VMS.Utilities.normalizeKey(setting.TextValue) || vendor.ID !== VMS.Utilities.lookupId(record.Vendor)) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "The configured Direct Payment Vendor is unavailable or invalid."); }
            if (!attachments || !attachments.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "At least one valid Invoice attachment is required."); }
            period = VMS.ClockService.formatRiyadh(VMS.ClockService.utcNow(), true).substring(0, 7);
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "DP_REVIEW_DONE", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "PAYMENT_AGGREGATION", toStatusCode: "IN_PROGRESS", successMessage: "Direct Payment review was completed." }, function () {
                return self.repositories.invoices.update(id, { DirectPaymentCompleted: true, DirectPaymentDate: VMS.ClockService.utcNow(), DirectPaymentConfirmedBy: H.actorContext(actor).actorPerson, AggregationPeriod: period, AggregationBatchKey: "DP-" + period, StageCode: "PAYMENT_AGGREGATION", StatusCode: "IN_PROGRESS" }, expectedEtag || record._etag, H.actorContext(actor));
            }, function (updated) {
                return { eventCode: "DP_REVIEW_DONE", context: { record: updated } };
            });
        });
    };

    InvoiceService.prototype.ReviewDirectPaymentReject = function (id, expectedEtag, reasonCode, comment, actionRequestId) {
        return this._reject(id, expectedEtag, "DP_REVIEW_REJECT", "DP_REVIEW_REJECT", reasonCode, comment, actionRequestId);
    };

    InvoiceService.prototype._validateProcessing = function (record, input) {
        var errors = [];
        var calculated;
        VMS.ValidationService.required(input.InvoiceNumber, "InvoiceNumber", "Supplier Invoice Number", errors);
        if (VMS.Utilities.trim(input.InvoiceNumber).length > 100) { errors.push(VMS.ValidationService.error("InvoiceNumber", "MAX_LENGTH", "Supplier Invoice Number cannot exceed 100 characters.")); }
        VMS.ValidationService.required(input.CostCenter, "CostCenter", "Cost Center", errors);
        if (!record.DirectPayment) {
            VMS.ValidationService.required(input.SESNumber, "SESNumber", "SES Number", errors);
            if (!input.SESDate || isNaN(new Date(input.SESDate).getTime())) { errors.push(VMS.ValidationService.error("SESDate", "REQUIRED", "A valid SES Date is required.")); }
        }
        calculated = VMS.FinancialCalculationService.calculate(input);
        return { errors: errors.concat(calculated.fieldErrors), calculated: calculated };
    };

    InvoiceService.prototype.GetProcessingOptions = function (id) {
        var self = this;
        var record;
        return this._loadForAction("INVOICE_PROCESS", id).then(function (context) {
            record = context.record;
            if (!record || record.DirectPayment === true || record.StageCode !== "INVOICE_PROCESSING" || record.StatusCode !== "IN_PROGRESS") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not available for standard processing."); }
            return $.when(
                self.GetEligiblePOLines(record.ID),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "ConfigurationType", op: "eq", value: "SETTING" }, { field: "GroupCode", op: "eq", value: "SYSTEM_SETTING" }, { field: "ItemCode", op: "eq", value: "COST_CENTER" }, { field: "IsActive", op: "eq", value: true }] }),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "INVOICE_REJECTION_REASON" }, { field: "IsActive", op: "eq", value: true }], sort: [{ field: "SortOrder", direction: "ASC" }] })
            );
        }).then(function (lines, settings, rejectionReasons) {
            return { lines: lines, costCenter: settings.length === 1 ? VMS.Utilities.trim(settings[0].TextValue) : "", rejectionReasons: rejectionReasons };
        });
    };

    InvoiceService.prototype._resolveStandardProcessing = function (id, input) {
        var self = this;
        var context;
        var line;
        var header;
        var currency;
        var validation;
        return this._loadForAction("INVOICE_PROCESS", id).then(function (value) {
            context = value;
            if (context.record.DirectPayment === true || context.record.StageCode !== "INVOICE_PROCESSING" || context.record.StatusCode !== "IN_PROGRESS") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not available for standard processing."); }
            return self.repositories.poLines.getById(VMS.Utilities.lookupId(input.POLine));
        }).then(function (value) {
            line = value;
            if (!line || line.IsActive !== true || line.IsCancelled === true || line.LineRequestStageCode !== "ACTIVE" || line.LineRequestStatusCode !== "APPROVED" || $.inArray(line.POLineStatusCode, ["ACTIVE", "THRESHOLD_REACHED"]) < 0 || Number(line.RemainingBalance) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an eligible active PO Line."); }
            return self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader));
        }).then(function (value) {
            header = value;
            if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || VMS.Utilities.lookupId(header.Vendor) !== VMS.Utilities.lookupId(context.record.Vendor)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The selected PO Line does not belong to the active approved Invoice Vendor PO."); }
            return $.when(
                self.repositories.currencies.getById(VMS.Utilities.lookupId(header.Currency)),
                self.repositories.vendors.getById(VMS.Utilities.lookupId(context.record.Vendor)),
                self.repositories.categories.getById(VMS.Utilities.lookupId(context.record.Category)),
                self.repositories.invoices.getAttachments(context.record.ID)
            );
        }).then(function (currencyValue, vendor, category, attachments) {
            var key = VMS.Utilities.lookupId(context.record.Vendor) + "-" + H.normalizeSupplierInvoice(input.InvoiceNumber);
            currency = currencyValue;
            if (!vendor || vendor.IsActive !== true || vendor.StageCode !== "APPROVED" || vendor.StatusCode !== "APPROVED") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The Invoice Vendor is no longer eligible."); }
            if (!category || category.IsActive !== true || $.inArray(category.ID, VMS.Utilities.lookupIds(context.user.AssignedCategories || [])) < 0 && $.inArray(context.user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) < 0) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "The Invoice Category is no longer within your authorized scope."); }
            if (!attachments || !attachments.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "At least one valid Invoice attachment is required."); }
            if (!currency || currency.IsActive !== true || Number(currency.ConversionRateToSAR) <= 0) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "The selected PO Currency is unavailable or invalid."); }
            input.ConversionRateUsed = currency.ConversionRateToSAR;
            validation = self._validateProcessing(context.record, input);
            if (!validation.calculated.valid || validation.errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Invoice Processing fields.", validation.errors); }
            if (Number(validation.calculated.values.FinalInvoiceAmount) > Number(line.RemainingBalance)) { return H.reject(VMS.Constants.ERRORS.INSUFFICIENT_PO_BALANCE, "The selected PO Line has insufficient remaining balance."); }
            return H.queryAll(self.repositories.invoices, { filters: [{ field: "VendorInvoiceKey", op: "eq", value: key }] }).then(function (duplicates) {
                if ($.grep(duplicates, function (item) { return item.ID !== context.record.ID; }).length) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Supplier Invoice Number already exists for this Vendor."); }
                return { actor: context.user, record: context.record, line: line, header: header, currency: currency, validation: validation, vendorInvoiceKey: key };
            });
        });
    };

    InvoiceService.prototype.CalculateProcessing = function (id, input) {
        return this._resolveStandardProcessing(id, input).then(function (context) {
            return { values: context.validation.calculated.values, currencyCode: context.currency.CurrencyCode, conversionRateModifiedDate: context.currency.Modified, poLineKey: context.line.POLineKey, remainingBalance: context.line.RemainingBalance };
        });
    };

    InvoiceService.prototype.SubmitForApproval = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        return this._resolveStandardProcessing(id, input).then(function (context) {
            var record = context.record;
            var currency = context.currency;
            var values = context.validation.calculated.values;
            if (!input.ConversionRateModifiedDate || String(currency.Modified) !== String(input.ConversionRateModifiedDate) || Number(input.ConversionRateUsed) !== Number(currency.ConversionRateToSAR)) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The selected Currency conversion rate changed or the calculation has not been confirmed. Recalculate before submission."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "INVOICE_SUBMIT_FOR_APPROVAL", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "PENDING_APPROVAL", toStatusCode: "IN_PROGRESS", successMessage: "Invoice was submitted for Manager approval." }, function () {
                return self.repositories.invoices.update(id, $.extend({}, values, {
                    InvoiceNumber: VMS.Utilities.collapseWhitespace(input.InvoiceNumber),
                    VendorInvoiceKey: context.vendorInvoiceKey,
                    POLine: { id: context.line.ID, title: context.line.POLineKey },
                    POLineKeySnapshot: context.line.POLineKey,
                    SESNumber: VMS.Utilities.trim(input.SESNumber),
                    SESDate: new Date(input.SESDate).toISOString(),
                    CostCenter: VMS.Utilities.trim(input.CostCenter),
                    Currency: { id: currency.ID, title: currency.CurrencyCode },
                    CurrencyCodeSnapshot: currency.CurrencyCode,
                    ConversionRateModifiedDate: currency.Modified,
                    HasDiscount: input.HasDiscount === true,
                    DiscountInputTypeCode: input.HasDiscount === true ? input.DiscountInputTypeCode : "",
                    DiscountInputValue: input.HasDiscount === true ? Number(input.DiscountInputValue) : null,
                    HasVAT: input.HasVAT === true,
                    VATInputTypeCode: input.HasVAT === true ? input.VATInputTypeCode : "",
                    VATInputValue: input.HasVAT === true ? Number(input.VATInputValue) : null,
                    StageCode: "PENDING_APPROVAL",
                    StatusCode: "IN_PROGRESS",
                    ProcessingDate: record.ProcessingDate || VMS.ClockService.utcNow(),
                    WorkflowApproved: false,
                    RejectionComment: ""
                }), expectedEtag || record._etag, H.actorContext(context.actor));
            }, function (updated) {
                return { eventCode: "INVOICE_SUBMITTED", context: { record: updated } };
            });
        });
    };

    InvoiceService.prototype.RejectAtProcessing = function (id, expectedEtag, reasonCode, comment, actionRequestId) {
        return this._reject(id, expectedEtag, "INVOICE_PROCESS", "INVOICE_REJECT_AT_PROCESSING", reasonCode, comment, actionRequestId);
    };

    InvoiceService.prototype._reject = function (id, expectedEtag, authorityCode, auditCode, reasonCode, comment, actionRequestId) {
        var self = this;
        var actor;
        var record;
        if (!reasonCode) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an Invoice rejection reason."); }
        return this._loadForAction(authorityCode, id).then(function (context) {
            actor = context.user;
            record = context.record;
            if ((authorityCode === "DP_REVIEW_REJECT" && (record.DirectPayment !== true || record.StageCode !== "DIRECT_PAYMENT_REVIEW" || record.StatusCode !== "IN_PROGRESS")) || (authorityCode === "INVOICE_PROCESS" && (record.DirectPayment === true || record.StageCode !== "INVOICE_PROCESSING" || record.StatusCode !== "IN_PROGRESS"))) {
                return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice cannot be rejected from its current workflow state.");
            }
            return H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "eq", value: "INVOICE_REJECTION_REASON" }, { field: "ItemCode", op: "eq", value: reasonCode }, { field: "IsActive", op: "eq", value: true }] });
        }).then(function (reasons) {
            if (reasons.length !== 1) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active configured Invoice rejection reason."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: auditCode, entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "REJECTED", toStatusCode: "REJECTED", rejectionReasonCode: reasonCode, comment: comment, successMessage: "Invoice was rejected." }, function () {
                return self.repositories.invoices.update(id, { StageCode: "REJECTED", StatusCode: "REJECTED", RejectionReasonCode: reasonCode, RejectionComment: VMS.Utilities.trim(comment), WorkflowApproved: false }, expectedEtag || record._etag, H.actorContext(actor));
            }, function (updated) {
                return { eventCode: authorityCode === "DP_REVIEW_REJECT" ? "DP_REVIEW_REJECTED" : "INVOICE_REJECTED", context: { record: updated, reasonLabel: reasons[0].DisplayLabel } };
            });
        });
    };

    InvoiceService.prototype.Approve = function (id, expectedEtag, lineEtag, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var line;
        var header;
        var calculated;
        return this._loadForAction("INVOICE_APPROVE", id).then(function (context) {
            actor = context.user;
            record = context.record;
            if (!record || record.DirectPayment === true || record.StageCode !== "PENDING_APPROVAL" || record.StatusCode !== "IN_PROGRESS") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not awaiting standard Manager approval."); }
            calculated = VMS.FinancialCalculationService.calculate(record);
            if (!calculated.valid || Number(calculated.values.FinalInvoiceAmount) !== Number(record.FinalInvoiceAmount) || Number(calculated.values.FinalInvoiceAmountInSAR) !== Number(record.FinalInvoiceAmountInSAR)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The persisted Invoice calculation is inconsistent and cannot be approved."); }
            return self.repositories.poLines.getById(VMS.Utilities.lookupId(record.POLine));
        }).then(function (value) {
            line = value;
            if (!line || VMS.Utilities.lookupId(line.POHeader) <= 0 || line.POLineKey !== record.POLineKeySnapshot) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The selected Invoice PO Line is unavailable or inconsistent."); }
            if (lineEtag && line._etag !== lineEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "The selected PO Line changed after the approval was loaded."); }
            return self.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader));
        }).then(function (value) {
            header = value;
            if (!header || header.StageCode !== "PO_ACTIVE" || header.StatusCode !== "APPROVED" || VMS.Utilities.lookupId(header.Vendor) !== VMS.Utilities.lookupId(record.Vendor) || VMS.Utilities.lookupId(header.Currency) !== VMS.Utilities.lookupId(record.Currency)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The Invoice PO, Vendor, or Currency relationship is inconsistent."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "INVOICE_APPROVE", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "CHARGEBACK_PROCESSING", toStatusCode: "IN_PROGRESS", recoveryContext: { schemaVersion: 1, invoiceId: record.ID, lineId: line.ID, priorConsumedAmount: line.ConsumedAmount, priorRemainingBalance: line.RemainingBalance, amount: record.FinalInvoiceAmount }, successMessage: "Invoice was approved and its PO Line balance was consumed." }, function () {
                var consumedLine;
                return self.poLineService.ConsumeForInvoiceApproval(line.ID, record.FinalInvoiceAmount, line._etag, actor).then(function (updatedLine) {
                    consumedLine = updatedLine;
                    var now = VMS.ClockService.utcNow();
                    return self.repositories.invoices.update(id, { StageCode: "CHARGEBACK_PROCESSING", StatusCode: "IN_PROGRESS", WorkflowApproved: true, WorkflowApprovalDate: now, ChargebackDate: now, RejectionComment: "" }, expectedEtag || record._etag, H.actorContext(actor));
                }).then(null, function (error) {
                    if (!consumedLine) {
                        return error && error.code === VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN ? H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The PO Line consumption outcome requires reconciliation before approval can be retried.") : $.Deferred().reject(error).promise();
                    }
                    if (error && error.code === VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN) { return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The Invoice approval outcome requires reconciliation before it can be retried."); }
                    return self.repositories.poLines.update(line.ID, { ConsumedAmount: line.ConsumedAmount, RemainingBalance: line.RemainingBalance, POLineStatusCode: line.POLineStatusCode }, consumedLine._etag, H.actorContext(actor)).then(function () {
                        return $.Deferred().reject(error).promise();
                    }, function () {
                        return H.reject(VMS.Constants.ERRORS.RECOVERY_REQUIRED, "The Invoice approval could not be compensated and requires reconciliation.");
                    });
                });
            }, function (updated) {
                return { eventCode: "INVOICE_APPROVED", context: { record: updated } };
            });
        });
    };

    InvoiceService.prototype.ReturnForUpdate = function (id, expectedEtag, reason, actionRequestId) {
        var self = this;
        var actor;
        var record;
        if (!VMS.Utilities.trim(reason)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An Update Required reason is required."); }
        return this._loadForAction("INVOICE_RETURN", id).then(function (context) {
            actor = context.user;
            record = context.record;
            if (!record || record.DirectPayment === true || record.StageCode !== "PENDING_APPROVAL") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not awaiting standard Manager approval."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "INVOICE_RETURN", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "INVOICE_PROCESSING", toStatusCode: "IN_PROGRESS", comment: reason, successMessage: "Invoice was returned for update." }, function () { return self.repositories.invoices.update(id, { StageCode: "INVOICE_PROCESSING", StatusCode: "IN_PROGRESS", RejectionComment: VMS.Utilities.trim(reason) }, expectedEtag || record._etag, H.actorContext(actor)); }, function (updated) { return { eventCode: "INVOICE_UPDATE_REQUIRED", context: { record: updated } }; });
        });
    };

    InvoiceService.prototype.SaveChargebackDraft = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._loadForAction("INVOICE_SETTLE", id).then(function (context) {
            actor = context.user;
            record = context.record;
            if (!record || record.DirectPayment === true || record.StageCode !== "CHARGEBACK_PROCESSING") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not available for standard Chargeback Processing."); }
            if (record.InvoiceSourceFunctionCode === F.EXECUTION && Number(record.GlobalLearnerCount) > 0 && typeof input.EBillingSettlement !== "boolean") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select the E-Billing settlement result."); }
            if (record.InvoiceSourceFunctionCode === F.EXECUTION && Number(record.MEALearnerCount) > 0 && typeof input.LMSSettlement !== "boolean") { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select the LMS settlement result."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "INVOICE_SAVE_CHARGEBACK_DRAFT", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, successMessage: "Chargeback draft was saved." }, function () {
                return self.repositories.invoices.update(id, { EBillingSettlement: record.InvoiceSourceFunctionCode === F.EXECUTION && Number(record.GlobalLearnerCount) > 0 ? input.EBillingSettlement : null, LMSSettlement: record.InvoiceSourceFunctionCode === F.EXECUTION && Number(record.MEALearnerCount) > 0 ? input.LMSSettlement : null, Comment: VMS.Utilities.trim(input.Comment || record.Comment) }, expectedEtag || record._etag, H.actorContext(actor));
            });
        });
    };

    InvoiceService.prototype.Settle = function (id, expectedEtag, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._loadForAction("INVOICE_SETTLE", id).then(function (context) {
            actor = context.user;
            record = context.record;
            if (!record || record.DirectPayment === true || record.StageCode !== "CHARGEBACK_PROCESSING") { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "This Invoice is not available for standard Settlement."); }
            if (record.InvoiceSourceFunctionCode === F.EXECUTION && Number(record.GlobalLearnerCount) > 0 && record.EBillingSettlement !== true) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Confirm E-Billing settlement before Settlement."); }
            if (record.InvoiceSourceFunctionCode === F.EXECUTION && Number(record.MEALearnerCount) > 0 && record.LMSSettlement !== true) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Confirm LMS settlement before Settlement."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "INVOICE_SETTLE", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: "SETTLED", toStatusCode: "SETTLED", successMessage: "Invoice was settled." }, function () { return self.repositories.invoices.update(id, { StageCode: "SETTLED", StatusCode: "SETTLED", SettlementDate: VMS.ClockService.utcNow() }, expectedEtag || record._etag, H.actorContext(actor)); }, function (updated) { return { eventCode: "INVOICE_SETTLED", context: { record: updated } }; });
        });
    };

    InvoiceService.prototype.AdminUpdateMetadata = function (id, expectedEtag, patch, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var target;
        var administrativeReason = VMS.Utilities.trim(patch.AdministrativeReason);
        var has = Object.prototype.hasOwnProperty;
        var allowedFields = ["AdministrativeReason", "Confirmed", "Category", "RegionCode", "FocalPointEmail", "ManagedByCode", "ClassStartDate", "ClassEndDate", "ClassCode1", "ClassCode2", "ClassCode3", "MEALearnerCount", "GlobalLearnerCount", "StudentCount", "AdvancePayment", "Comment", "PaymentLink", "DirectInformation"];
        var invalidField = false;
        if (!administrativeReason) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "An administrative reason is required."); }
        if (patch.Confirmed !== true) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Confirm the administrative correction before saving."); }
        if (!expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "A current record version is required for this correction."); }
        $.each(patch, function (field) { if ($.inArray(field, allowedFields) < 0) { invalidField = true; } });
        if (invalidField) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The correction contains a locked Invoice field."); }
        return this._authorize("ADMIN_INVOICE_UPDATE", {}).then(function (user) { actor = user; return self.repositories.invoices.getById(id); }).then(function (value) {
            record = value;
            if (!record || record.IsActive !== true) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested record is unavailable."); }
            if (record._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "This record changed after it was loaded."); }
            return $.when(self._hasReachedPendingApproval(record), self.repositories.invoices.getAttachments(id));
        }).then(function (hasReachedPending, attachments) {
            var input;
            var validated;
            if (hasReachedPending) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Invoice creation metadata is locked after first submission to Manager approval."); }
            input = {
                Category: has.call(patch, "Category") ? patch.Category : record.Category,
                FocalPointEmail: has.call(patch, "FocalPointEmail") ? patch.FocalPointEmail : record.FocalPointEmail,
                RegionCode: has.call(patch, "RegionCode") ? patch.RegionCode : record.RegionCode,
                ManagedByCode: has.call(patch, "ManagedByCode") ? patch.ManagedByCode : record.ManagedByCode,
                ClassStartDate: has.call(patch, "ClassStartDate") ? patch.ClassStartDate : record.ClassStartDate,
                ClassEndDate: has.call(patch, "ClassEndDate") ? patch.ClassEndDate : record.ClassEndDate,
                ClassCode1: has.call(patch, "ClassCode1") ? patch.ClassCode1 : record.ClassCode1,
                ClassCode2: has.call(patch, "ClassCode2") ? patch.ClassCode2 : record.ClassCode2,
                ClassCode3: has.call(patch, "ClassCode3") ? patch.ClassCode3 : record.ClassCode3,
                MEALearnerCount: has.call(patch, "MEALearnerCount") ? patch.MEALearnerCount : record.MEALearnerCount,
                GlobalLearnerCount: has.call(patch, "GlobalLearnerCount") ? patch.GlobalLearnerCount : record.GlobalLearnerCount,
                StudentCount: has.call(patch, "StudentCount") ? patch.StudentCount : record.StudentCount,
                DirectPayment: record.DirectPayment === true,
                AdvancePayment: has.call(patch, "AdvancePayment") ? patch.AdvancePayment === true : record.AdvancePayment === true,
                PaymentLink: has.call(patch, "PaymentLink") ? patch.PaymentLink : record.PaymentLink,
                DirectInformation: has.call(patch, "DirectInformation") ? patch.DirectInformation : record.DirectInformation,
                Comment: has.call(patch, "Comment") ? patch.Comment : record.Comment,
                Attachments: attachments
            };
            if (record.DirectPayment === true && record.StageCode !== "DIRECT_PAYMENT_REVIEW" && ((has.call(patch, "PaymentLink") && VMS.Utilities.trim(patch.PaymentLink) !== VMS.Utilities.trim(record.PaymentLink)) || (has.call(patch, "DirectInformation") && VMS.Utilities.trim(patch.DirectInformation) !== VMS.Utilities.trim(record.DirectInformation)))) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Direct Payment review information is locked after Review Done."); }
            validated = self._validateCreation(input, record.InvoiceSourceFunctionCode);
            if (validated.errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the highlighted Invoice fields.", validated.errors); }
            return $.when(
                self.repositories.categories.getById(VMS.Utilities.lookupId(input.Category)),
                self.repositories.users.getByKey(input.FocalPointEmail),
                H.setting(self.repositories, "MAX_CLASS_CODES"),
                H.queryAll(self.repositories.configuration, { filters: [{ field: "GroupCode", op: "in", value: ["REGION", "INVOICE_MANAGED_BY"] }, { field: "IsActive", op: "eq", value: true }] })
            ).then(function (category, focal, maxClassSetting, options) {
                var regionValid;
                var managedByValid;
                var source = record.InvoiceSourceFunctionCode;
                if (!category || category.IsActive !== true || category.FunctionCode === F.ADMINISTRATION || (source === F.EDUCATION_PROGRAM && category.FunctionCode !== F.EDUCATION_PROGRAM) || (source === F.EXECUTION && category.FunctionCode === F.EDUCATION_PROGRAM)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, source === F.EXECUTION ? "Select an active Category from the Execution Category family." : "Select an active Education Program Category."); }
                if (!focal || focal.IsActive !== true || focal.RoleCode !== "EMPLOYEE" || focal.FunctionCode !== source) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active Employee in the Invoice source Function as Focal Point."); }
                target = {
                    Category: { id: category.ID, title: category.DisplayLabel },
                    FocalPointName: focal.UserName,
                    FocalPointEmail: focal.Email,
                    AdvancePayment: input.AdvancePayment === true,
                    Comment: VMS.Utilities.trim(input.Comment)
                };
                if (source === F.EXECUTION) {
                    if (validated.classCodes.length > Number(maxClassSetting.NumericValue)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The configured maximum number of Class Codes was exceeded."); }
                    regionValid = $.grep(options, function (option) { return option.GroupCode === "REGION" && option.ItemCode === input.RegionCode; }).length === 1;
                    managedByValid = $.grep(options, function (option) { return option.GroupCode === "INVOICE_MANAGED_BY" && option.ItemCode === input.ManagedByCode; }).length === 1;
                    if (!regionValid || !managedByValid) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select active Region and Managed By options."); }
                    $.extend(target, {
                        RegionCode: input.RegionCode,
                        ManagedByCode: input.ManagedByCode,
                        ClassStartDate: new Date(input.ClassStartDate).toISOString(),
                        ClassEndDate: new Date(input.ClassEndDate).toISOString(),
                        ClassCode1: validated.classCodes[0],
                        ClassCode2: validated.classCodes[1] || "",
                        ClassCode3: validated.classCodes[2] || "",
                        MEALearnerCount: Number(input.MEALearnerCount),
                        GlobalLearnerCount: Number(input.GlobalLearnerCount)
                    });
                } else {
                    target.StudentCount = input.StudentCount === "" || input.StudentCount === null || input.StudentCount === undefined ? null : Number(input.StudentCount);
                }
                if (record.DirectPayment === true && record.StageCode === "DIRECT_PAYMENT_REVIEW") {
                    target.PaymentLink = VMS.Utilities.trim(input.PaymentLink);
                    target.DirectInformation = VMS.Utilities.trim(input.DirectInformation);
                }
            });
        }).then(function () {
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_INVOICE_UPDATE", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, comment: administrativeReason, changedFields: { before: record, after: target }, successMessage: "Invoice metadata was updated." }, function () { return self.repositories.invoices.update(id, target, expectedEtag, H.actorContext(actor)); });
        });
    };

    InvoiceService.prototype._hasReachedPendingApproval = function (record) {
        var self = this;
        var laterStages = ["PENDING_APPROVAL", "CHARGEBACK_PROCESSING", "SETTLED"];
        if ($.inArray(record.StageCode, laterStages) >= 0 || record.WorkflowApprovalDate || record.ChargebackDate || record.SettlementDate) { return $.Deferred().resolve(true).promise(); }
        return $.when(
            H.queryAll(this.repositories.history, { filters: [{ field: "EntityTypeCode", op: "eq", value: "INVOICE" }, { field: "EntityItemID", op: "eq", value: record.ID }, { field: "ActionCode", op: "eq", value: "INVOICE_SUBMIT_FOR_APPROVAL" }, { field: "ResultCode", op: "eq", value: "SUCCESS" }] }),
            H.queryAll(this.repositories.history, { filters: [{ field: "EntityTypeCode", op: "eq", value: "DIRECT_PAYMENT_BATCH" }, { field: "ActionCode", op: "eq", value: "DP_BATCH_SUBMIT" }, { field: "ResultCode", op: "eq", value: "SUCCESS" }] })
        ).then(function (ordinary, batches) {
            var found = ordinary.length > 0;
            $.each(batches, function (_, history) {
                var ids;
                try { ids = JSON.parse(history.AffectedItemIdsJSON || "[]"); } catch (ignore) { ids = []; }
                if ($.inArray(Number(record.ID), $.map(ids, Number)) >= 0) { found = true; }
            });
            return found;
        });
    };

    InvoiceService.prototype.GetAdministrationItem = function (id) {
        var self = this;
        return this._authorize("ADMIN_INVOICE_UPDATE", {}).then(function () { return self.repositories.invoices.getById(id); }).then(function (record) {
            if (!record || record.IsActive !== true) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested record is unavailable."); }
            return $.when(self._hasReachedPendingApproval(record), self.repositories.invoices.getAttachments(id)).then(function (locked, attachments) {
                return { record: record, attachments: attachments, creationMetadataLocked: locked, directReviewMetadataLocked: record.DirectPayment !== true || record.StageCode !== "DIRECT_PAYMENT_REVIEW" };
            });
        });
    };

    InvoiceService.prototype.ReplaceAdminAttachments = function (id, expectedEtag, files, administrativeReason, confirmed, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var reason = VMS.Utilities.trim(administrativeReason);
        var errors = [];
        VMS.ValidationService.attachments(files, ["pdf", "docx"], true, "Attachments", errors);
        if (!reason) { errors.push(VMS.ValidationService.error("AdministrativeReason", "REQUIRED", "An administrative reason is required.")); }
        if (confirmed !== true) { errors.push(VMS.ValidationService.error("Confirmed", "REQUIRED", "Confirm the controlled administrative correction.")); }
        if (errors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Correct the Invoice attachment correction.", errors); }
        if (!expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "A current record version is required for this attachment correction."); }
        return this._authorize("ADMIN_INVOICE_UPDATE", {}).then(function (user) { actor = user; return self.repositories.invoices.getById(id); }).then(function (value) {
            record = value;
            if (!record || record.IsActive !== true) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested record is unavailable."); }
            if (record._etag !== expectedEtag) { return H.reject(VMS.Constants.ERRORS.STALE_RECORD, "This record changed after it was loaded."); }
            return self._hasReachedPendingApproval(record);
        }).then(function (locked) {
            if (locked) { return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Invoice attachments are locked after first submission to Manager approval."); }
            return self.mutationRunner.Run({ actionRequestId: actionRequestId, actionCode: "ADMIN_INVOICE_ATTACHMENTS", entityTypeCode: "INVOICE", entityItemId: id, businessKey: record.InvoiceIdentifier, fromStageCode: record.StageCode, fromStatusCode: record.StatusCode, toStageCode: record.StageCode, toStatusCode: record.StatusCode, comment: reason, changedFields: { before: { Attachments: record.Attachments || [] }, after: { Attachments: files || [] } }, successMessage: "Invoice attachments were updated." }, function () {
                return self.repositories.invoices.replaceAttachments(id, files || [], expectedEtag, H.actorContext(actor));
            });
        });
    };

    VMS.InvoiceService = InvoiceService;
}(window, window.jQuery));
