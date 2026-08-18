(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function providerError(code, safeMessage, current) {
        return {
            code: code,
            safeMessage: safeMessage,
            current: current || null
        };
    }

    function DummyDataProvider(config) {
        this.config = config;
        this.state = null;
    }

    DummyDataProvider.prototype._deferred = function (work) {
        var deferred = $.Deferred();
        window.setTimeout(function () {
            try {
                deferred.resolve(work());
            } catch (error) {
                deferred.reject(error);
            }
        }, 0);
        return deferred.promise();
    };

    DummyDataProvider.prototype._validateState = function (state) {
        var names = VMS.Constants.DATASETS;
        var keys = [];
        var property;
        var index;
        for (property in state) {
            if (Object.prototype.hasOwnProperty.call(state, property)) {
                keys.push(property);
            }
        }
        if (keys.length !== names.length) {
            throw providerError("CONFIGURATION_INVALID", "Dummy data must contain exactly thirteen canonical datasets.");
        }
        for (index = 0; index < names.length; index += 1) {
            if (!$.isArray(state[names[index]])) {
                throw providerError("CONFIGURATION_INVALID", "A canonical Dummy dataset is unavailable.");
            }
        }
    };

    DummyDataProvider.prototype._normalizeMetadata = function (state) {
        var systemPerson = { id: 0, title: "VMS Dummy System", email: "system@dummy.vms.test" };
        var listIndex;
        var rowIndex;
        var rows;
        var row;
        for (listIndex = 0; listIndex < VMS.Constants.DATASETS.length; listIndex += 1) {
            rows = state[VMS.Constants.DATASETS[listIndex]];
            for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
                row = rows[rowIndex];
                row.ID = Number(row.ID);
                row._etag = row._etag || '"1"';
                row.Created = row.Created || this.config.DUMMY_CLOCK_UTC;
                row.Modified = row.Modified || row.Created;
                row.CreatedBy = row.CreatedBy || systemPerson;
                row.ModifiedBy = row.ModifiedBy || row.CreatedBy;
            }
        }
    };

    DummyDataProvider.prototype.init = function () {
        var self = this;
        var deferred = $.Deferred();
        var stored = window.sessionStorage.getItem(this.config.DUMMY_STATE_KEY);
        if (stored) {
            try {
                this.state = JSON.parse(stored);
                this._validateState(this.state);
                this._normalizeMetadata(this.state);
                deferred.resolve(this);
                return deferred.promise();
            } catch (ignore) {
                window.sessionStorage.removeItem(this.config.DUMMY_STATE_KEY);
            }
        }
        $.ajax({
            url: this.config.DUMMY_SEED_URL,
            dataType: "json",
            cache: false
        }).done(function (data) {
            try {
                self._validateState(data);
                self._normalizeMetadata(data);
                self.state = data;
                self._persist();
                deferred.resolve(self);
            } catch (error) {
                deferred.reject(error);
            }
        }).fail(function () {
            deferred.reject(providerError("SERVICE_UNAVAILABLE", "The Dummy data seed could not be loaded."));
        });
        return deferred.promise();
    };

    DummyDataProvider.prototype._persist = function () {
        window.sessionStorage.setItem(this.config.DUMMY_STATE_KEY, JSON.stringify(this.state));
    };

    DummyDataProvider.prototype._rows = function (listName) {
        if (!this.state || !$.isArray(this.state[listName])) {
            throw providerError("UNSUPPORTED_OPERATION", "The requested dataset is not available.");
        }
        return this.state[listName];
    };

    DummyDataProvider.prototype._project = function (row, select) {
        var output;
        var index;
        if (!select || !select.length) {
            return VMS.Utilities.clone(row);
        }
        output = {};
        for (index = 0; index < select.length; index += 1) {
            if (Object.prototype.hasOwnProperty.call(row, select[index])) {
                output[select[index]] = VMS.Utilities.clone(row[select[index]]);
            }
        }
        if (!Object.prototype.hasOwnProperty.call(output, "ID")) {
            output.ID = row.ID;
        }
        if (!Object.prototype.hasOwnProperty.call(output, "_etag")) {
            output._etag = row._etag;
        }
        return output;
    };

    DummyDataProvider.prototype.getById = function (listName, id, select) {
        var self = this;
        return this._deferred(function () {
            var rows = self._rows(listName);
            var index;
            for (index = 0; index < rows.length; index += 1) {
                if (Number(rows[index].ID) === Number(id)) {
                    return self._project(rows[index], select);
                }
            }
            return null;
        });
    };

    DummyDataProvider.prototype.getByKey = function (listName, field, key, select) {
        var self = this;
        return this._deferred(function () {
            var rows = self._rows(listName);
            var normalized = VMS.Utilities.normalizeKey(key);
            var index;
            for (index = 0; index < rows.length; index += 1) {
                if (VMS.Utilities.normalizeKey(rows[index][field]) === normalized) {
                    return self._project(rows[index], select);
                }
            }
            return null;
        });
    };

    DummyDataProvider.prototype._readField = function (row, field) {
        var parts = field.split(".");
        var value = row;
        var index;
        for (index = 0; index < parts.length; index += 1) {
            if (value === null || value === undefined) {
                return null;
            }
            value = value[parts[index]];
        }
        return value;
    };

    DummyDataProvider.prototype._matchesFilter = function (row, filter) {
        var actual = this._readField(row, filter.field);
        var expected = filter.value;
        var index;
        var ids;
        if (filter.op === "eq") {
            return String(actual).toLowerCase() === String(expected).toLowerCase();
        }
        if (filter.op === "neq") {
            return String(actual).toLowerCase() !== String(expected).toLowerCase();
        }
        if (filter.op === "in") {
            for (index = 0; index < expected.length; index += 1) {
                if (String(actual).toLowerCase() === String(expected[index]).toLowerCase()) {
                    return true;
                }
            }
            return false;
        }
        if (filter.op === "contains") {
            return String(actual || "").toLowerCase().indexOf(String(expected || "").toLowerCase()) >= 0;
        }
        if (filter.op === "gte") {
            return actual !== null && actual >= expected;
        }
        if (filter.op === "lte") {
            return actual !== null && actual <= expected;
        }
        if (filter.op === "lookupId") {
            return VMS.Utilities.lookupId(actual) === Number(expected);
        }
        if (filter.op === "lookupAny") {
            ids = VMS.Utilities.lookupIds(actual || []);
            for (index = 0; index < expected.length; index += 1) {
                if ($.inArray(Number(expected[index]), ids) >= 0) {
                    return true;
                }
            }
            return false;
        }
        return false;
    };

    DummyDataProvider.prototype.query = function (listName, querySpec) {
        var self = this;
        return this._deferred(function () {
            var spec = querySpec || {};
            var rows = self._rows(listName).slice(0);
            var filters = spec.filters || [];
            var search = VMS.Utilities.trim(spec.search && spec.search.value);
            var fields = spec.search && spec.search.fields ? spec.search.fields : [];
            var sort = spec.sort || [];
            var start = Number(spec.continuationToken || 0);
            var pageSize = Number(spec.pageSize || VMS.Config.TABLE_DEFAULT_PAGE_SIZE);
            var total;
            var items;
            var index;

            if (spec.authorizationScope && typeof spec.authorizationScope.predicate === "function") {
                rows = $.grep(rows, spec.authorizationScope.predicate);
            }
            if (filters.length) {
                rows = $.grep(rows, function (row) {
                    var filterIndex;
                    for (filterIndex = 0; filterIndex < filters.length; filterIndex += 1) {
                        if (!self._matchesFilter(row, filters[filterIndex])) {
                            return false;
                        }
                    }
                    return true;
                });
            }
            if (search && fields.length) {
                rows = $.grep(rows, function (row) {
                    var fieldIndex;
                    var value;
                    for (fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
                        value = self._readField(row, fields[fieldIndex]);
                        if (String(value || "").toLowerCase().indexOf(search.toLowerCase()) >= 0) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            rows.sort(function (left, right) {
                var sortIndex;
                var leftValue;
                var rightValue;
                var direction;
                for (sortIndex = 0; sortIndex < sort.length; sortIndex += 1) {
                    leftValue = self._readField(left, sort[sortIndex].field);
                    rightValue = self._readField(right, sort[sortIndex].field);
                    direction = String(sort[sortIndex].direction || "ASC").toUpperCase() === "DESC" ? -1 : 1;
                    if (leftValue < rightValue) {
                        return -1 * direction;
                    }
                    if (leftValue > rightValue) {
                        return direction;
                    }
                }
                return Number(left.ID) - Number(right.ID);
            });
            total = rows.length;
            items = rows.slice(start, start + pageSize);
            for (index = 0; index < items.length; index += 1) {
                items[index] = self._project(items[index], spec.select);
            }
            return {
                items: items,
                totalCount: total,
                continuationToken: start + pageSize < total ? String(start + pageSize) : null
            };
        });
    };

    DummyDataProvider.prototype.count = function (listName, querySpec) {
        var spec = $.extend(true, {}, querySpec || {});
        spec.pageSize = 1;
        spec.continuationToken = "0";
        return this.query(listName, spec).then(function (result) {
            return result.totalCount;
        });
    };

    DummyDataProvider.prototype.create = function (listName, model, actionContext) {
        var self = this;
        return this._deferred(function () {
            var rows = self._rows(listName);
            var nextId = 1;
            var index;
            var now = VMS.ClockService ? VMS.ClockService.utcNow() : new Date().toISOString();
            var actor = actionContext && actionContext.actorPerson ? actionContext.actorPerson : { id: 0, title: "VMS Dummy System", email: "system@dummy.vms.test" };
            var row = VMS.Utilities.clone(model || {});
            for (index = 0; index < rows.length; index += 1) {
                nextId = Math.max(nextId, Number(rows[index].ID) + 1);
            }
            row.ID = nextId;
            row._etag = '"1"';
            row.Created = now;
            row.Modified = now;
            row.CreatedBy = actor;
            row.ModifiedBy = actor;
            rows.push(row);
            self._persist();
            return VMS.Utilities.clone(row);
        });
    };

    DummyDataProvider.prototype.update = function (listName, id, patch, etag, actionContext) {
        var self = this;
        return this._deferred(function () {
            var rows = self._rows(listName);
            var index;
            var field;
            var version;
            var actor = actionContext && actionContext.actorPerson ? actionContext.actorPerson : null;
            for (index = 0; index < rows.length; index += 1) {
                if (Number(rows[index].ID) === Number(id)) {
                    if (etag && rows[index]._etag !== etag) {
                        throw providerError("STALE_RECORD", "This record changed after it was loaded.", VMS.Utilities.clone(rows[index]));
                    }
                    for (field in patch) {
                        if (Object.prototype.hasOwnProperty.call(patch, field) && field !== "ID" && field !== "_etag" && field !== "Created" && field !== "CreatedBy") {
                            rows[index][field] = VMS.Utilities.clone(patch[field]);
                        }
                    }
                    version = parseInt(String(rows[index]._etag).replace(/[^0-9]/g, ""), 10) || 1;
                    rows[index]._etag = '"' + String(version + 1) + '"';
                    rows[index].Modified = VMS.ClockService ? VMS.ClockService.utcNow() : new Date().toISOString();
                    if (actor) {
                        rows[index].ModifiedBy = actor;
                    }
                    self._persist();
                    return VMS.Utilities.clone(rows[index]);
                }
            }
            throw providerError("NOT_FOUND_OR_UNAUTHORIZED", "The requested record is unavailable.");
        });
    };

    DummyDataProvider.prototype.getAttachments = function (listName, id) {
        return this.getById(listName, id).then(function (row) {
            return row && $.isArray(row.Attachments) ? VMS.Utilities.clone(row.Attachments) : [];
        });
    };

    DummyDataProvider.prototype.addAttachments = function (listName, id, files, actionContext) {
        var self = this;
        return this.getById(listName, id).then(function (row) {
            var existing = row.Attachments || [];
            return self.update(listName, id, { Attachments: existing.concat(VMS.Utilities.clone(files || [])) }, row._etag, actionContext);
        });
    };

    DummyDataProvider.prototype.replaceAttachments = function (listName, id, files, etag, actionContext) {
        return this.update(listName, id, { Attachments: VMS.Utilities.clone(files || []) }, etag, actionContext);
    };

    DummyDataProvider.prototype.reset = function () {
        window.sessionStorage.removeItem(this.config.DUMMY_STATE_KEY);
        window.sessionStorage.removeItem(this.config.DUMMY_CLOCK_KEY);
        window.sessionStorage.removeItem(this.config.DUMMY_NOTIFICATION_KEY);
        window.sessionStorage.removeItem(this.config.DUMMY_NOTIFICATION_FAILURE_KEY);
        this.state = null;
        return this.init();
    };

    VMS.DummyDataProvider = DummyDataProvider;
}(window, window.jQuery));
