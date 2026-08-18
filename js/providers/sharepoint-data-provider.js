(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var VALID_FIELD = /^[A-Za-z][A-Za-z0-9_]*(\.(id|code|label|email|title))?$/;
    var OPERATORS = ["eq", "neq", "in", "contains", "gte", "lte", "lookupId", "lookupAny"];

    function reject(code, message, details) {
        return $.Deferred().reject({
            code: code,
            safeMessage: message,
            details: details || null
        }).promise();
    }

    function person(value) {
        if (!value) {
            return null;
        }
        return {
            id: Number(value.id !== undefined ? value.id : value.Id),
            title: value.title !== undefined ? value.title : (value.Title || ""),
            email: value.email !== undefined ? value.email : (value.EMail || value.Email || "")
        };
    }

    function lookup(value, schema) {
        if (!value) {
            return null;
        }
        return {
            id: Number(value.id !== undefined ? value.id : value.Id),
            code: value.code !== undefined ? value.code : (schema && schema.codeField ? value[schema.codeField] : ""),
            label: value.label !== undefined ? value.label : (value.title !== undefined ? value.title : (value.Title || "")),
            title: value.title !== undefined ? value.title : (value.Title || value.label || "")
        };
    }

    function SharePointDataProvider(config) {
        this.config = config;
        this.integration = null;
        this.transport = null;
        this.digest = null;
    }

    SharePointDataProvider.prototype.configure = function (integration) {
        this.integration = integration || null;
        this.transport = integration && integration.transport ? integration.transport : null;
        return this;
    };

    SharePointDataProvider.prototype._unavailable = function () {
        return reject(VMS.Constants.ERRORS.SERVICE_UNAVAILABLE, "The SharePoint production integration is not configured.");
    };

    SharePointDataProvider.prototype._mappedList = function (listName) {
        var mapped;
        if ($.inArray(listName, VMS.Constants.DATASETS) < 0 || !this.integration || !this.integration.listMap) {
            return null;
        }
        mapped = this.integration.listMap[listName];
        return mapped ? mapped : null;
    };

    SharePointDataProvider.prototype._schema = function (listName) {
        return this.integration && this.integration.fieldSchemas && this.integration.fieldSchemas[listName] ? this.integration.fieldSchemas[listName] : {};
    };

    SharePointDataProvider.prototype._field = function (listName, canonicalName) {
        var schema = this._schema(listName);
        var parts = String(canonicalName).split(".");
        var definition = schema[parts[0]];
        var base = definition && definition.internalName ? definition.internalName : parts[0];
        return parts.length > 1 ? base + "." + parts[1] : base;
    };

    SharePointDataProvider.prototype._validateField = function (listName, field) {
        var base = String(field || "").split(".")[0];
        var schema = this._schema(listName);
        if (!VALID_FIELD.test(String(field || ""))) {
            return false;
        }
        if (this.integration.strictFieldSchemas === true && !schema[base] && $.inArray(base, ["ID", "Created", "Modified", "CreatedBy", "ModifiedBy", "_etag"]) < 0) {
            return false;
        }
        return true;
    };

    SharePointDataProvider.prototype._typedQuery = function (listName, querySpec) {
        var self = this;
        var spec = querySpec || {};
        var output = {
            filters: [],
            search: null,
            sort: [],
            pageSize: Number(spec.pageSize || this.config.TABLE_DEFAULT_PAGE_SIZE),
            continuationToken: spec.continuationToken || null,
            select: [],
            expand: [],
            authorizationScope: null
        };
        if (!isFinite(output.pageSize) || output.pageSize < 1 || output.pageSize > 10000 || Math.floor(output.pageSize) !== output.pageSize) {
            throw { code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The requested SharePoint page size is invalid." };
        }
        $.each(spec.filters || [], function (_, filter) {
            if (!filter || !self._validateField(listName, filter.field) || $.inArray(filter.op, OPERATORS) < 0) {
                throw { code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The requested SharePoint filter is invalid." };
            }
            output.filters.push({ field: self._field(listName, filter.field), op: filter.op, value: VMS.Utilities.clone(filter.value) });
        });
        if (spec.search && spec.search.value) {
            output.search = { value: String(spec.search.value), fields: [] };
            $.each(spec.search.fields || [], function (_, field) {
                if (!self._validateField(listName, field)) {
                    throw { code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The requested SharePoint search field is invalid." };
                }
                output.search.fields.push(self._field(listName, field));
            });
        }
        $.each(spec.sort || [], function (_, item) {
            if (!self._validateField(listName, item.field)) {
                throw { code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The requested SharePoint sort is invalid." };
            }
            output.sort.push({ field: self._field(listName, item.field), direction: String(item.direction || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC" });
        });
        $.each(spec.select || [], function (_, field) {
            if (!self._validateField(listName, field)) {
                throw { code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The requested SharePoint projection is invalid." };
            }
            output.select.push(self._field(listName, field));
        });
        $.each(spec.expand || [], function (_, field) {
            if (!self._validateField(listName, field)) {
                throw { code: VMS.Constants.ERRORS.VALIDATION_FAILED, safeMessage: "The requested SharePoint expansion is invalid." };
            }
            output.expand.push(self._field(listName, field));
        });
        if (spec.authorizationScope) {
            if (!spec.authorizationScope.code || !spec.authorizationScope.criteria) {
                throw { code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "An authoritative SharePoint query scope is required." };
            }
            output.authorizationScope = {
                code: spec.authorizationScope.code,
                actorKey: spec.authorizationScope.actorKey,
                criteria: VMS.Utilities.clone(spec.authorizationScope.criteria)
            };
        }
        return output;
    };

    SharePointDataProvider.prototype._canonical = function (listName, raw) {
        var schema = this._schema(listName);
        var output = {};
        var canonicalName;
        var definition;
        var rawValue;
        var field;
        var index;
        if (!raw) {
            return null;
        }
        for (canonicalName in schema) {
            if (Object.prototype.hasOwnProperty.call(schema, canonicalName)) {
                definition = schema[canonicalName] || {};
                rawValue = raw[definition.internalName || canonicalName];
                if (definition.type === "person") {
                    output[canonicalName] = person(rawValue);
                } else if (definition.type === "lookup") {
                    output[canonicalName] = lookup(rawValue, definition);
                } else if (definition.type === "multiLookup") {
                    output[canonicalName] = [];
                    for (index = 0; index < (rawValue || []).length; index += 1) {
                        output[canonicalName].push(lookup(rawValue[index], definition));
                    }
                } else {
                    output[canonicalName] = VMS.Utilities.clone(rawValue);
                }
            }
        }
        if (!Object.keys(schema).length) {
            for (field in raw) {
                if (Object.prototype.hasOwnProperty.call(raw, field) && field !== "__metadata") {
                    output[field] = VMS.Utilities.clone(raw[field]);
                }
            }
        }
        output.ID = Number(raw.ID !== undefined ? raw.ID : output.ID);
        output._etag = raw._etag || (raw.__metadata && raw.__metadata.etag) || output._etag || "";
        output.Created = raw.Created || output.Created || null;
        output.Modified = raw.Modified || output.Modified || null;
        output.CreatedBy = person(raw.CreatedBy || raw.Author || output.CreatedBy);
        output.ModifiedBy = person(raw.ModifiedBy || raw.Editor || output.ModifiedBy);
        return output;
    };

    SharePointDataProvider.prototype._writeModel = function (listName, model) {
        var schema = this._schema(listName);
        var output = {};
        var canonicalName;
        var definition;
        var value;
        var field;
        if (!Object.keys(schema).length) {
            for (field in model) {
                if (Object.prototype.hasOwnProperty.call(model, field) && $.inArray(field, ["ID", "_etag", "Created", "Modified", "CreatedBy", "ModifiedBy"]) < 0) {
                    output[field] = VMS.Utilities.clone(model[field]);
                }
            }
            return output;
        }
        for (canonicalName in model) {
            if (Object.prototype.hasOwnProperty.call(model, canonicalName) && schema[canonicalName]) {
                definition = schema[canonicalName];
                value = model[canonicalName];
                if (definition.type === "lookup" || definition.type === "person") {
                    output[definition.idField || ((definition.internalName || canonicalName) + "Id")] = value ? Number(value.id) : null;
                } else if (definition.type === "multiLookup") {
                    output[definition.idField || ((definition.internalName || canonicalName) + "Id")] = { results: $.map(value || [], function (item) { return Number(item.id); }) };
                } else {
                    output[definition.internalName || canonicalName] = VMS.Utilities.clone(value);
                }
            }
        }
        return output;
    };

    SharePointDataProvider.prototype._mapError = function (error, mutationSubmitted) {
        var status = Number(error && (error.status || error.statusCode));
        if (error && error.code && VMS.Constants.ERRORS[error.code]) {
            return { code: error.code, safeMessage: error.safeMessage || "The SharePoint operation could not be completed.", current: error.current || null };
        }
        if (status === 401 || status === 403) {
            return { code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "You are not authorized to access the requested VMS data." };
        }
        if (status === 404) {
            return { code: VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, safeMessage: "The requested record is unavailable." };
        }
        if (status === 409) {
            return { code: VMS.Constants.ERRORS.DUPLICATE_KEY, safeMessage: "The requested value conflicts with an existing VMS record." };
        }
        if (status === 412) {
            return { code: VMS.Constants.ERRORS.STALE_RECORD, safeMessage: "This record changed after it was loaded." };
        }
        if ((status === 429 || status === 503) && mutationSubmitted === true) {
            return { code: VMS.Constants.ERRORS.ACTION_OUTCOME_UNCERTAIN, safeMessage: "The action outcome could not be confirmed. VMS will not submit it again until persisted state is revalidated." };
        }
        return { code: VMS.Constants.ERRORS.SERVICE_UNAVAILABLE, safeMessage: "The SharePoint service is temporarily unavailable." };
    };

    SharePointDataProvider.prototype._call = function (method, request, mutationSubmitted) {
        var self = this;
        var deferred = $.Deferred();
        if (!this.transport || typeof this.transport[method] !== "function") {
            return this._unavailable();
        }
        try {
            $.when(this.transport[method](request)).then(function (result) {
                deferred.resolve(result);
            }, function (error) {
                deferred.reject(self._mapError(error, mutationSubmitted === true || (error && error.submitted === true)));
            });
        } catch (error) {
            deferred.reject(this._mapError(error, mutationSubmitted === true));
        }
        return deferred.promise();
    };

    SharePointDataProvider.prototype._getDigest = function () {
        var self = this;
        var now = new Date().getTime();
        if (this.digest && this.digest.value && this.digest.expiresAt > now + 30000) {
            return $.Deferred().resolve(this.digest.value).promise();
        }
        if (!this.transport || typeof this.transport.getRequestDigest !== "function") {
            return this._unavailable();
        }
        return this._call("getRequestDigest", { siteUrl: this.integration.siteUrl }, false).then(function (result) {
            if (!result || !result.value) {
                return reject(VMS.Constants.ERRORS.SERVICE_UNAVAILABLE, "A SharePoint Request Digest could not be acquired.");
            }
            self.digest = { value: result.value, expiresAt: now + (Number(result.timeoutSeconds || 1500) * 1000) };
            return self.digest.value;
        });
    };

    SharePointDataProvider.prototype.init = function () {
        var self = this;
        var index;
        if (!this.integration || !this.integration.siteUrl || !this.integration.listMap || !this.transport) {
            return this._unavailable();
        }
        if (typeof window.$SP !== "function") {
            return this._unavailable();
        }
        for (index = 0; index < VMS.Constants.DATASETS.length; index += 1) {
            if (!this.integration.listMap[VMS.Constants.DATASETS[index]]) {
                return reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "All thirteen canonical SharePoint lists must be mapped before production activation.");
            }
        }
        if (typeof this.transport.initialize !== "function") {
            return $.Deferred().resolve(this).promise();
        }
        return this._call("initialize", { siteUrl: this.integration.siteUrl, listMap: VMS.Utilities.clone(this.integration.listMap), library: "SharePointPLUS-4.0" }, false).then(function () { return self; });
    };

    SharePointDataProvider.prototype.resolveCurrentUser = function () {
        if (!this.transport || typeof this.transport.resolveCurrentUser !== "function") {
            return this._unavailable();
        }
        return this._call("resolveCurrentUser", { siteUrl: this.integration.siteUrl }, false).then(function (raw) {
            var current = person(raw);
            if (!current || !current.email) {
                return reject(VMS.Constants.ERRORS.ACCESS_DENIED, "Your authenticated SharePoint identity could not be resolved.");
            }
            return current;
        });
    };

    SharePointDataProvider.prototype.getById = function (listName, id, select) {
        var self = this;
        var mapped = this._mappedList(listName);
        if (!mapped || !isFinite(Number(id)) || Number(id) <= 0) {
            return reject(VMS.Constants.ERRORS.VALIDATION_FAILED, "The requested SharePoint record identity is invalid.");
        }
        return this._call("getById", { siteUrl: this.integration.siteUrl, list: mapped, id: Number(id), query: this._typedQuery(listName, { select: select || [] }) }, false).then(function (raw) { return self._canonical(listName, raw); });
    };

    SharePointDataProvider.prototype.getByKey = function (listName, field, key, select) {
        var query = { filters: [{ field: field, op: "eq", value: key }], select: select || [], pageSize: 2 };
        return this.query(listName, query).then(function (result) {
            if (result.items.length > 1) {
                return reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "A SharePoint business key is not unique.");
            }
            return result.items.length ? result.items[0] : null;
        });
    };

    SharePointDataProvider.prototype.query = function (listName, querySpec) {
        var self = this;
        var mapped = this._mappedList(listName);
        var query;
        if (!mapped) {
            return this._unavailable();
        }
        try {
            query = this._typedQuery(listName, querySpec || {});
        } catch (error) {
            return reject(error.code || VMS.Constants.ERRORS.VALIDATION_FAILED, error.safeMessage || "The SharePoint query is invalid.");
        }
        return this._call("query", { siteUrl: this.integration.siteUrl, list: mapped, query: query }, false).then(function (result) {
            var items = [];
            $.each(result && result.items ? result.items : [], function (_, raw) { items.push(self._canonical(listName, raw)); });
            return { items: items, totalCount: Number(result && result.totalCount !== undefined ? result.totalCount : items.length), continuationToken: result ? (result.continuationToken || null) : null };
        });
    };

    SharePointDataProvider.prototype.count = function (listName, querySpec) {
        var mapped = this._mappedList(listName);
        var query;
        if (!mapped) {
            return this._unavailable();
        }
        try {
            query = this._typedQuery(listName, querySpec || {});
        } catch (error) {
            return reject(error.code || VMS.Constants.ERRORS.VALIDATION_FAILED, error.safeMessage || "The SharePoint count query is invalid.");
        }
        return this._call("count", { siteUrl: this.integration.siteUrl, list: mapped, query: query }, false).then(function (value) { return Number(value && value.count !== undefined ? value.count : value); });
    };

    SharePointDataProvider.prototype.create = function (listName, model, actionContext) {
        var self = this;
        var mapped = this._mappedList(listName);
        if (!mapped) {
            return this._unavailable();
        }
        return this._getDigest().then(function (digest) {
            return self._call("create", { siteUrl: self.integration.siteUrl, list: mapped, model: self._writeModel(listName, model || {}), digest: digest, actionContext: actionContext || null }, true);
        }).then(function (raw) { return self._canonical(listName, raw); });
    };

    SharePointDataProvider.prototype.update = function (listName, id, patch, etag, actionContext) {
        var self = this;
        var mapped = this._mappedList(listName);
        if (!mapped || !etag || etag === "*") {
            return reject(VMS.Constants.ERRORS.STALE_RECORD, "An expected record version is required for this update.");
        }
        return this._getDigest().then(function (digest) {
            return self._call("update", { siteUrl: self.integration.siteUrl, list: mapped, id: Number(id), patch: self._writeModel(listName, patch || {}), etag: etag, digest: digest, actionContext: actionContext || null }, true);
        }).then(function (raw) { return self._canonical(listName, raw); });
    };

    SharePointDataProvider.prototype.addAttachments = function (listName, id, files, actionContext) {
        var self = this;
        var mapped = this._mappedList(listName);
        if (!mapped) {
            return this._unavailable();
        }
        return this._getDigest().then(function (digest) {
            return self._call("addAttachments", { siteUrl: self.integration.siteUrl, list: mapped, id: Number(id), files: files || [], digest: digest, actionContext: actionContext || null }, true);
        }).then(function (raw) { return self._canonical(listName, raw); });
    };

    SharePointDataProvider.prototype.getAttachments = function (listName, id) {
        var mapped = this._mappedList(listName);
        if (!mapped) {
            return this._unavailable();
        }
        return this._call("getAttachments", { siteUrl: this.integration.siteUrl, list: mapped, id: Number(id) }, false).then(function (items) {
            return $.map(items || [], function (item) {
                return {
                    name: item.name || item.FileName || "",
                    sizeBytes: Number(item.sizeBytes || item.Length || 0),
                    serverRelativeUrl: item.serverRelativeUrl || item.ServerRelativeUrl || "",
                    mimeType: item.mimeType || ""
                };
            });
        });
    };

    SharePointDataProvider.prototype.replaceAttachments = function (listName, id, files, etag, actionContext) {
        var self = this;
        var mapped = this._mappedList(listName);
        if (!mapped || !etag || etag === "*") {
            return reject(VMS.Constants.ERRORS.STALE_RECORD, "An expected record version is required for this attachment correction.");
        }
        return this._getDigest().then(function (digest) {
            return self._call("replaceAttachments", { siteUrl: self.integration.siteUrl, list: mapped, id: Number(id), files: files || [], etag: etag, digest: digest, actionContext: actionContext || null }, true);
        }).then(function (raw) { return self._canonical(listName, raw); });
    };

    VMS.SharePointDataProvider = SharePointDataProvider;
}(window, window.jQuery));
