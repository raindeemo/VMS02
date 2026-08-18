(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;
    var F = VMS.Constants.FUNCTIONS;
    var BUSINESS_FUNCTIONS = [F.LFO_COMMERCIAL, F.LFO_MANUFACTURING, F.LFO_LEADERSHIP, F.EXCELLENCE, F.VENDOR_MANAGEMENT, F.EXECUTION, F.EDUCATION_PROGRAM];
    var FEEDBACK_FUNCTIONS = [F.LFO_COMMERCIAL, F.LFO_MANUFACTURING, F.LFO_LEADERSHIP, F.VENDOR_MANAGEMENT, F.EXECUTION, F.EDUCATION_PROGRAM];

    function normalizedDuplicate(rows, field, value, excludeId) {
        var normalized = VMS.Utilities.normalizeKey(value);
        return $.grep(rows || [], function (row) { return row.ID !== excludeId && VMS.Utilities.normalizeKey(row[field]) === normalized; }).length > 0;
    }

    function BaseAdministrationService(repository, entityType, accessService, mutationRunner) {
        this.repository = repository;
        this.entityType = entityType;
        this.accessService = accessService;
        this.mutationRunner = mutationRunner;
    }

    BaseAdministrationService.prototype._authorize = function (tab) {
        var self = this;
        return this.accessService.AuthorizeRoute(VMS.Constants.ROUTES.ADMINISTRATION, { tab: tab }).then(function (user) {
            if ($.inArray(user.RoleCode, ["ADMIN", "SUPER_ADMIN"]) < 0) { return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "This Administration tab is unavailable."); }
            return user;
        });
    };

    BaseAdministrationService.prototype.Query = function (tab, querySpec) {
        var self = this;
        return this._authorize(tab).then(function () { return self.repository.query(querySpec || {}); });
    };

    BaseAdministrationService.prototype.Get = function (tab, id) {
        var self = this;
        return this._authorize(tab).then(function () {
            return self.repository.getById(id);
        }).then(function (record) {
            if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "The requested Administration record is unavailable."); }
            return record;
        });
    };

    BaseAdministrationService.prototype.QueryActive = function (tab, sort) {
        var self = this;
        return this._authorize(tab).then(function () {
            return H.queryAll(self.repository, { filters: [{ field: "IsActive", op: "eq", value: true }], sort: sort || [{ field: "ID", direction: "ASC" }] });
        });
    };

    BaseAdministrationService.prototype._run = function (actor, definition, mutate) {
        definition.entityTypeCode = this.entityType;
        definition.countsAsCompletedAction = false;
        return this.mutationRunner.Run(definition, mutate);
    };

    function ConfigurationService(repositories, accessService, mutationRunner) {
        BaseAdministrationService.call(this, repositories.configuration, "CONFIG", accessService, mutationRunner);
        this.repositories = repositories;
    }
    ConfigurationService.prototype = Object.create(BaseAdministrationService.prototype);
    ConfigurationService.prototype.constructor = ConfigurationService;

    ConfigurationService.prototype.Query = function (querySpec) { return BaseAdministrationService.prototype.Query.call(this, "configuration", querySpec); };
    ConfigurationService.prototype.Get = function (id) { return BaseAdministrationService.prototype.Get.call(this, "configuration", id); };

    ConfigurationService.prototype.CreateOption = function (input, actionRequestId) {
        var self = this;
        var actor;
        var extensible = ["VENDOR_CLASSIFICATION", "INVOICE_MANAGED_BY", "INVOICE_REJECTION_REASON", "VENDOR_FEEDBACK_SCALE", "REGION", "SURVEY_VERSION"];
        var group = VMS.Utilities.trim(input.GroupCode).toUpperCase();
        var code = VMS.Utilities.trim(input.ItemCode).toUpperCase();
        var key = group + "-" + code;
        var sortOrder = Number(input.SortOrder);
        var numericValue = input.NumericValue === "" || input.NumericValue === null || input.NumericValue === undefined ? null : Number(input.NumericValue);
        return this._authorize("configuration").then(function (user) {
            actor = user;
            if ($.inArray(group, extensible) < 0 || !/^[A-Z0-9_]+$/.test(code) || !VMS.Utilities.trim(input.DisplayLabel) || !isFinite(sortOrder) || Math.floor(sortOrder) !== sortOrder || sortOrder <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid Option in an approved extensible group."); }
            if (group === "VENDOR_FEEDBACK_SCALE" && (!isFinite(numericValue) || numericValue <= 0)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Feedback Scale Options require a positive Numeric Value."); }
            if (group === "SURVEY_VERSION" && ($.inArray(VMS.Utilities.trim(input.TextValue), FEEDBACK_FUNCTIONS) < 0 || !isFinite(numericValue) || Math.floor(numericValue) !== numericValue || !new RegExp("^" + VMS.Utilities.trim(input.TextValue) + "_" + numericValue + "_V[1-9][0-9]*$").test(code))) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Survey Version identity must match its eligible Function, year, and positive version sequence."); }
            return self.repository.getByKey(key);
        }).then(function (duplicate) {
            if (duplicate) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "This configuration code already exists."); }
            return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CONFIG_CREATE_OPTION", businessKey: key, successMessage: "Configuration Option was created." }, function () {
                return self.repository.create({ ConfigurationType: "OPTION", GroupCode: group, ItemCode: code, DisplayLabel: VMS.Utilities.collapseWhitespace(input.DisplayLabel), TextValue: VMS.Utilities.trim(input.TextValue), NumericValue: numericValue, SortOrder: sortOrder, IsActive: input.IsActive !== false, IsLocked: false, Description: VMS.Utilities.trim(input.Description), ConfigKey: key }, H.actorContext(actor));
            });
        });
    };

    ConfigurationService.prototype.UpdateOption = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("configuration").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) {
            record = value;
            if (!record || record.ConfigurationType !== "OPTION" || !VMS.Utilities.trim(input.DisplayLabel) || !isFinite(Number(input.SortOrder)) || Math.floor(Number(input.SortOrder)) !== Number(input.SortOrder) || Number(input.SortOrder) <= 0) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The configuration Option is invalid."); }
            return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CONFIG_UPDATE_OPTION", entityItemId: id, businessKey: record.ConfigKey, successMessage: "Configuration Option was updated." }, function () {
                return self.repository.update(id, { DisplayLabel: VMS.Utilities.collapseWhitespace(input.DisplayLabel), SortOrder: Number(input.SortOrder), IsActive: record.IsLocked || record.GroupCode === "SURVEY_VERSION" ? record.IsActive : input.IsActive === true, Description: VMS.Utilities.trim(input.Description) }, expectedEtag || record._etag, H.actorContext(actor));
            });
        });
    };

    ConfigurationService.prototype._settingValid = function (record, input) {
        var code = record.ItemCode;
        var number = Number(input.NumericValue);
        var text = VMS.Utilities.trim(input.TextValue);
        if (code === "COST_CENTER") { return !!text; }
        if (code === "THRESHOLD_PERCENTAGE") { return isFinite(number) && number > 0 && number <= 100; }
        if (code === "VENDOR_DOCUMENT_EXPIRY_DAYS") { return isFinite(number) && Math.floor(number) === number && number > 15; }
        if (code === "MAX_CLASS_CODES" || code === "MAX_PO_LINES") { return isFinite(number) && Math.floor(number) === number && number >= 1 && number <= 3; }
        if (code === "POWER_BI_DASHBOARD_URL" || code === "SAMA_EXCHANGE_RATE_URL") { return VMS.Config.USE_DUMMY_DATA === true ? !!text : VMS.ValidationService.httpsUrl(text); }
        if (code === "DIRECT_PAYMENT_VENDOR_CODE") { return !!text; }
        if (code === "VM_TEAM_GROUP_EMAIL") { return VMS.ValidationService.email(text); }
        return false;
    };

    ConfigurationService.prototype.UpdateSetting = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("configuration").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) {
            record = value;
            if (!record || record.ConfigurationType !== "SETTING" || !self._settingValid(record, input)) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "The Setting value does not satisfy its approved contract."); }
            if (record.ItemCode === "DIRECT_PAYMENT_VENDOR_CODE") {
                return H.queryAll(self.repositories.vendors, { filters: [{ field: "VendorCodeNormalizedKey", op: "eq", value: VMS.Utilities.normalizeKey(input.TextValue) }] }).then(function (vendors) {
                    if (vendors.length !== 1 || vendors[0].IsActive !== true || vendors[0].StageCode !== "APPROVED" || vendors[0].VendorProcessingTypeCode !== "DIRECT") { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "The Direct Payment Vendor must be active, approved, unique, and use DIRECT processing."); }
                });
            }
        }).then(function () {
            return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CONFIG_UPDATE_SETTING", entityItemId: id, businessKey: record.ConfigKey, successMessage: "System Setting was updated." }, function () {
                return self.repository.update(id, { TextValue: VMS.Utilities.trim(input.TextValue), NumericValue: input.NumericValue === "" || input.NumericValue === null ? null : Number(input.NumericValue), Description: VMS.Utilities.trim(input.Description) }, expectedEtag || record._etag, H.actorContext(actor));
            });
        });
    };

    function CountryService(repositories, accessService, mutationRunner) {
        BaseAdministrationService.call(this, repositories.countries, "COUNTRY", accessService, mutationRunner);
        this.repositories = repositories;
    }
    CountryService.prototype = Object.create(BaseAdministrationService.prototype);
    CountryService.prototype.constructor = CountryService;
    CountryService.prototype.Query = function (querySpec) { return BaseAdministrationService.prototype.Query.call(this, "country", querySpec); };
    CountryService.prototype.Get = function (id) { return BaseAdministrationService.prototype.Get.call(this, "country", id); };
    CountryService.prototype.QueryActive = function () { return BaseAdministrationService.prototype.QueryActive.call(this, "country", [{ field: "CountryName", direction: "ASC" }]); };
    CountryService.prototype.Create = function (input, actionRequestId) {
        var self = this;
        var actor;
        var code = VMS.Utilities.trim(input.CountryCode).toUpperCase();
        return this._authorize("country").then(function (user) { actor = user; if (!/^[A-Z]{2}$/.test(code) || !VMS.Utilities.trim(input.CountryName) || !/^\+[0-9]{1,4}$/.test(input.PhoneCode)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid ISO country, name, and phone code."); } return $.when(self.repository.getByKey(code), H.queryAll(self.repository, {})); }).then(function (duplicate, countries) {
            if (duplicate || normalizedDuplicate(countries, "CountryName", input.CountryName, 0)) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Country Code and Country Name must be unique."); }
            return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_COUNTRY_CREATE", businessKey: code, successMessage: "Country was created." }, function () { return self.repository.create({ CountryCode: code, CountryName: VMS.Utilities.collapseWhitespace(input.CountryName), PhoneCode: input.PhoneCode, PhoneFormat: VMS.Utilities.trim(input.PhoneFormat), IsActive: true }, H.actorContext(actor)); });
        });
    };
    CountryService.prototype.Update = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("country").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) { record = value; if (!record || !VMS.Utilities.trim(input.CountryName) || !/^\+[0-9]{1,4}$/.test(input.PhoneCode)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid Country name and phone code."); } return H.queryAll(self.repository, {}); }).then(function (countries) { if (normalizedDuplicate(countries, "CountryName", input.CountryName, record.ID)) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Country Name must be unique."); } return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_COUNTRY_UPDATE", entityItemId: id, businessKey: record.CountryCode, successMessage: "Country was updated." }, function () { return self.repository.update(id, { CountryName: VMS.Utilities.collapseWhitespace(input.CountryName), PhoneCode: input.PhoneCode, PhoneFormat: VMS.Utilities.trim(input.PhoneFormat) }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };
    CountryService.prototype.SetActive = function (id, expectedEtag, active, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("country").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) {
            record = value;
            if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "Country is unavailable."); }
            if (!active) { return $.when(H.queryAll(self.repositories.cities, { filters: [{ field: "Country.id", op: "eq", value: id }, { field: "IsActive", op: "eq", value: true }] }), H.queryAll(self.repositories.vendors, { filters: [{ field: "Country.id", op: "eq", value: id }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }] })).then(function (cities, vendors) { if (cities.length || vendors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Country cannot be deactivated while active Cities or in-progress Vendors reference it."); } }); }
        }).then(function () { return self._run(actor, { actionRequestId: actionRequestId, actionCode: active ? "ADMIN_COUNTRY_REACTIVATE" : "ADMIN_COUNTRY_DEACTIVATE", entityItemId: id, businessKey: record.CountryCode, successMessage: "Country activation was updated." }, function () { return self.repository.update(id, { IsActive: active === true }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };

    function CityService(repositories, accessService, mutationRunner) {
        BaseAdministrationService.call(this, repositories.cities, "CITY", accessService, mutationRunner);
        this.repositories = repositories;
    }
    CityService.prototype = Object.create(BaseAdministrationService.prototype);
    CityService.prototype.constructor = CityService;
    CityService.prototype.Query = function (querySpec) { return BaseAdministrationService.prototype.Query.call(this, "city", querySpec); };
    CityService.prototype.Get = function (id) { return BaseAdministrationService.prototype.Get.call(this, "city", id); };
    CityService.prototype.Create = function (input, actionRequestId) {
        var self = this;
        var actor;
        var country;
        var key;
        return this._authorize("city").then(function (user) { actor = user; return self.repositories.countries.getById(VMS.Utilities.lookupId(input.Country)); }).then(function (value) { country = value; if (!country || country.IsActive !== true || !VMS.Utilities.trim(input.CityName)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active Country and enter a City name."); } key = country.CountryCode + "|" + VMS.Utilities.normalizeKey(input.CityName); return self.repository.getByKey(key); }).then(function (duplicate) { if (duplicate) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "This City already exists for the selected Country."); } return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CITY_CREATE", businessKey: key, successMessage: "City was created." }, function () { return self.repository.create({ CityName: VMS.Utilities.collapseWhitespace(input.CityName), Country: { id: country.ID, title: country.CountryName }, CountryCityKey: key, IsActive: true }, H.actorContext(actor)); }); });
    };
    CityService.prototype.Update = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var country;
        var newKey;
        var desiredCountryId;
        return this._authorize("city").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) {
            record = value;
            desiredCountryId = VMS.Utilities.lookupId(input.Country) || VMS.Utilities.lookupId(record && record.Country);
            if (!record || !VMS.Utilities.trim(input.CityName)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid City name."); }
            return $.when(self.repositories.countries.getById(desiredCountryId), H.queryAll(self.repositories.vendors, { filters: [{ field: "City.id", op: "eq", value: id }] }));
        }).then(function (countryValue, vendorReferences) {
            country = countryValue;
            if (!country || (desiredCountryId !== VMS.Utilities.lookupId(record.Country) && country.IsActive !== true)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Select an active Country when changing the parent Country."); }
            if (vendorReferences.length && desiredCountryId !== VMS.Utilities.lookupId(record.Country)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "A City's Country is immutable after the City has been referenced by a Vendor."); }
            newKey = country.CountryCode + "|" + VMS.Utilities.normalizeKey(input.CityName);
            return self.repository.getByKey(newKey);
        }).then(function (duplicate) {
            if (duplicate && duplicate.ID !== record.ID) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "This City already exists for the selected Country."); }
            return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CITY_UPDATE", entityItemId: id, businessKey: record.CountryCityKey, successMessage: "City was updated." }, function () { return self.repository.update(id, { CityName: VMS.Utilities.collapseWhitespace(input.CityName), Country: { id: country.ID, title: country.CountryName }, CountryCityKey: newKey }, expectedEtag || record._etag, H.actorContext(actor)); });
        });
    };
    CityService.prototype.SetActive = function (id, expectedEtag, active, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("city").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) { record = value; if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "City is unavailable."); } if (active) { return self.repositories.countries.getById(VMS.Utilities.lookupId(record.Country)).then(function (country) { if (!country || country.IsActive !== true) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The parent Country must be active before this City can be reactivated."); } }); } return H.queryAll(self.repositories.vendors, { filters: [{ field: "City.id", op: "eq", value: id }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }] }).then(function (vendors) { if (vendors.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "City cannot be deactivated while an in-progress Vendor references it."); } }); }).then(function () { return self._run(actor, { actionRequestId: actionRequestId, actionCode: active ? "ADMIN_CITY_REACTIVATE" : "ADMIN_CITY_DEACTIVATE", entityItemId: id, businessKey: record.CountryCityKey, successMessage: "City activation was updated." }, function () { return self.repository.update(id, { IsActive: active === true }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };

    function CurrencyService(repositories, accessService, mutationRunner) {
        BaseAdministrationService.call(this, repositories.currencies, "CURRENCY", accessService, mutationRunner);
        this.repositories = repositories;
    }
    CurrencyService.prototype = Object.create(BaseAdministrationService.prototype);
    CurrencyService.prototype.constructor = CurrencyService;
    CurrencyService.prototype.Query = function (querySpec) { return BaseAdministrationService.prototype.Query.call(this, "conversion-rate", querySpec); };
    CurrencyService.prototype.Get = function (id) { return BaseAdministrationService.prototype.Get.call(this, "conversion-rate", id); };
    CurrencyService.prototype.Create = function (input, actionRequestId) {
        var self = this;
        var actor;
        var code = VMS.Utilities.trim(input.CurrencyCode).toUpperCase();
        var rate = Number(input.ConversionRateToSAR);
        return this._authorize("conversion-rate").then(function (user) { actor = user; if (!/^[A-Z]{3}$/.test(code) || !VMS.Utilities.trim(input.CurrencyName) || !isFinite(rate) || rate <= 0 || (code === "SAR" && rate !== 1)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid ISO Currency, name, and positive rate. SAR must remain 1.000000."); } return $.when(self.repository.getByKey(code), H.queryAll(self.repository, {})); }).then(function (duplicate, currencies) { if (duplicate || normalizedDuplicate(currencies, "CurrencyName", input.CurrencyName, 0)) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Currency Code and Currency Name must be unique."); } return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CURRENCY_CREATE", businessKey: code, successMessage: "Currency was created." }, function () { return self.repository.create({ CurrencyCode: code, CurrencyName: VMS.Utilities.collapseWhitespace(input.CurrencyName), ConversionRateToSAR: code === "SAR" ? 1 : VMS.Utilities.roundHalfAwayFromZero(rate, 6), IsActive: true, RateNote: VMS.Utilities.trim(input.RateNote) }, H.actorContext(actor)); }); });
    };
    CurrencyService.prototype.UpdateRate = function (id, expectedEtag, rate, note, actionRequestId) {
        var self = this;
        var actor;
        var record;
        rate = Number(rate);
        return this._authorize("conversion-rate").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) { record = value; if (!record || !isFinite(rate) || rate <= 0 || (record.CurrencyCode === "SAR" && rate !== 1)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid positive rate. SAR must remain 1.000000."); } return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CURRENCY_UPDATE_RATE", entityItemId: id, businessKey: record.CurrencyCode, successMessage: "Conversion rate was updated." }, function () { return self.repository.update(id, { ConversionRateToSAR: VMS.Utilities.roundHalfAwayFromZero(rate, 6), RateNote: VMS.Utilities.trim(note) }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };
    CurrencyService.prototype.Update = function (id, expectedEtag, input, actionRequestId) { return this.UpdateRate(id, expectedEtag, input.ConversionRateToSAR, input.RateNote, actionRequestId); };
    CurrencyService.prototype.SetActive = function (id, expectedEtag, active, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("conversion-rate").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) {
            record = value;
            if (!record || (record.CurrencyCode === "SAR" && active !== true)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "SAR cannot be deactivated."); }
            if (!active) {
                return $.when(H.queryAll(self.repositories.prpo, { filters: [{ field: "Currency.id", op: "eq", value: id }] }), H.queryAll(self.repositories.poLines, { filters: [{ field: "IsActive", op: "eq", value: true }, { field: "LineRequestStageCode", op: "eq", value: "ACTIVE" }, { field: "LineRequestStatusCode", op: "eq", value: "APPROVED" }] }), H.queryAll(self.repositories.invoices, { filters: [{ field: "Currency.id", op: "eq", value: id }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }] })).then(function (prpos, poLines, invoices) {
                    var currencyHeaders = {};
                    var openPrpos = $.grep(prpos, function (header) { currencyHeaders[header.ID] = true; return header.StatusCode === "IN_PROGRESS"; });
                    var eligibleLines = $.grep(poLines, function (line) { return currencyHeaders[VMS.Utilities.lookupId(line.POHeader)] && Number(line.RemainingBalance) > 0; });
                    if (openPrpos.length || eligibleLines.length || invoices.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Currency cannot be deactivated while open PR/PO, eligible PO Lines, or unsettled Invoices reference it."); }
                });
            }
        }).then(function () { return self._run(actor, { actionRequestId: actionRequestId, actionCode: active ? "ADMIN_CURRENCY_REACTIVATE" : "ADMIN_CURRENCY_DEACTIVATE", entityItemId: id, businessKey: record.CurrencyCode, successMessage: "Currency activation was updated." }, function () { return self.repository.update(id, { IsActive: active === true }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };

    function CategoryService(repositories, accessService, mutationRunner) {
        BaseAdministrationService.call(this, repositories.categories, "CATEGORY", accessService, mutationRunner);
        this.repositories = repositories;
    }
    CategoryService.prototype = Object.create(BaseAdministrationService.prototype);
    CategoryService.prototype.constructor = CategoryService;
    CategoryService.prototype.Query = function (querySpec) { return BaseAdministrationService.prototype.Query.call(this, "category", querySpec); };
    CategoryService.prototype.Get = function (id) { return BaseAdministrationService.prototype.Get.call(this, "category", id); };
    CategoryService.prototype.Create = function (input, actionRequestId) {
        var self = this;
        var actor;
        var code = VMS.Utilities.trim(input.CategoryCode).toUpperCase();
        var competency = VMS.Utilities.collapseWhitespace(input.CompetencyName);
        var key = input.FunctionCode + "|" + code + "|" + VMS.Utilities.normalizeKey(competency);
        if ($.inArray(input.FunctionCode, BUSINESS_FUNCTIONS) < 0 || !/^[A-Z0-9_]+$/.test(code) || !competency || !VMS.Utilities.trim(input.DisplayLabel)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid approved non-Administration Category."); }
        return this._authorize("category").then(function (user) { actor = user; return self.repository.getByKey(key); }).then(function (duplicate) { if (duplicate) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Category already exists."); } return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CATEGORY_CREATE", businessKey: key, successMessage: "Category was created." }, function () { return self.repository.create({ FunctionCode: input.FunctionCode, CategoryCode: code, DisplayLabel: VMS.Utilities.collapseWhitespace(input.DisplayLabel), CompetencyName: competency, CategoryKey: key, IsActive: true }, H.actorContext(actor)); }); });
    };
    CategoryService.prototype.Update = function (id, expectedEtag, input, actionRequestId) {
        var self = this;
        var actor;
        var record;
        var code;
        var competency;
        var functionCode;
        var newKey;
        var referenced;
        return this._authorize("category").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) {
            record = value;
            code = VMS.Utilities.trim(input.CategoryCode || (record && record.CategoryCode)).toUpperCase();
            competency = VMS.Utilities.collapseWhitespace(input.CompetencyName || (record && record.CompetencyName));
            functionCode = input.FunctionCode || (record && record.FunctionCode);
            if (!record || $.inArray(functionCode, BUSINESS_FUNCTIONS) < 0 || !/^[A-Z0-9_]+$/.test(code) || !competency || !VMS.Utilities.trim(input.DisplayLabel)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Enter a valid approved non-Administration Category."); }
            newKey = functionCode + "|" + code + "|" + VMS.Utilities.normalizeKey(competency);
            return $.when(H.queryAll(self.repositories.users, { filters: [{ field: "AssignedCategories", op: "lookupAny", value: [id] }] }), H.queryAll(self.repositories.vendors, { filters: [{ field: "Categories", op: "lookupAny", value: [id] }] }), H.queryAll(self.repositories.invoices, { filters: [{ field: "Category.id", op: "eq", value: id }] }), self.repository.getByKey(newKey));
        }).then(function (users, vendors, invoices, duplicate) {
            referenced = users.length > 0 || vendors.length > 0 || invoices.length > 0;
            if (duplicate && duplicate.ID !== record.ID) { return H.reject(VMS.Constants.ERRORS.DUPLICATE_KEY, "Category identity already exists."); }
            if (referenced && (functionCode !== record.FunctionCode || code !== record.CategoryCode || competency !== record.CompetencyName)) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Function, Category Code, and Competency are immutable after first reference."); }
            return self._run(actor, { actionRequestId: actionRequestId, actionCode: "ADMIN_CATEGORY_UPDATE", entityItemId: id, businessKey: record.CategoryKey, successMessage: "Category was updated." }, function () { return self.repository.update(id, { FunctionCode: referenced ? record.FunctionCode : functionCode, CategoryCode: referenced ? record.CategoryCode : code, DisplayLabel: VMS.Utilities.collapseWhitespace(input.DisplayLabel), CompetencyName: referenced ? record.CompetencyName : competency, CategoryKey: referenced ? record.CategoryKey : newKey }, expectedEtag || record._etag, H.actorContext(actor)); });
        });
    };
    CategoryService.prototype.SetActive = function (id, expectedEtag, active, actionRequestId) {
        var self = this;
        var actor;
        var record;
        return this._authorize("category").then(function (user) { actor = user; return self.repository.getById(id); }).then(function (value) { record = value; if (!record) { return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "Category is unavailable."); } if (!active) { return $.when(H.queryAll(self.repositories.users, { filters: [{ field: "AssignedCategories", op: "lookupAny", value: [id] }, { field: "IsActive", op: "eq", value: true }] }), H.queryAll(self.repositories.invoices, { filters: [{ field: "Category.id", op: "eq", value: id }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }] })).then(function (users, invoices) { if (users.length || invoices.length) { return H.reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "Category cannot be deactivated while active users or operational Invoices reference it."); } }); } }).then(function () { return self._run(actor, { actionRequestId: actionRequestId, actionCode: active ? "ADMIN_CATEGORY_REACTIVATE" : "ADMIN_CATEGORY_DEACTIVATE", entityItemId: id, businessKey: record.CategoryKey, successMessage: "Category activation was updated." }, function () { return self.repository.update(id, { IsActive: active === true }, expectedEtag || record._etag, H.actorContext(actor)); }); });
    };

    VMS.ConfigurationService = ConfigurationService;
    VMS.CountryService = CountryService;
    VMS.CityService = CityService;
    VMS.CurrencyService = CurrencyService;
    VMS.CategoryService = CategoryService;
}(window, window.jQuery));
