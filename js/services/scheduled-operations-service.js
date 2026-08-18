(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function ScheduledOperationsService(repositories, mutationRunner, notificationService, directPaymentBatchService, config) {
        this.repositories = repositories;
        this.mutationRunner = mutationRunner;
        this.notificationService = notificationService;
        this.directPaymentBatchService = directPaymentBatchService;
        this.config = config;
    }

    ScheduledOperationsService.prototype._system = function (options) {
        var actor = options && options.systemActor;
        if (actor && options.authorized === true && actor.title && actor.email) {
            return actor;
        }
        if (this.config.USE_DUMMY_DATA === true) {
            return { id: 0, title: "VMS Dummy Scheduler", email: "scheduler@dummy.vms.test", userKey: "scheduler@dummy.vms.test" };
        }
        return null;
    };

    ScheduledOperationsService.prototype._start = function (operationCode, options) {
        var actor = this._system(options);
        if (!actor) {
            return H.reject(VMS.Constants.ERRORS.ACCESS_DENIED, "An authorized scheduler identity is required.");
        }
        return $.Deferred().resolve({ operationCode: operationCode, actor: actor, now: VMS.ClockService.utcNow(), processed: 0, succeeded: 0, failed: 0, failures: [] }).promise();
    };

    ScheduledOperationsService.prototype._safeFailure = function (result, item, error) {
        result.failed += 1;
        result.failures.push({ id: Number(item && item.ID || 0), businessKey: item && (item.VendorCode || item.POLineKey || item.AggregationBatchKey) || "", code: error && error.code ? error.code : VMS.Constants.ERRORS.SERVICE_UNAVAILABLE });
    };

    ScheduledOperationsService.prototype._process = function (items, result, worker) {
        var chain = $.Deferred().resolve().promise();
        $.each(items || [], function (_, item) {
            chain = chain.then(function () {
                result.processed += 1;
                return worker(item).then(function () {
                    result.succeeded += 1;
                }, function (error) {
                    result.failed += 1;
                    result.failures.push({ id: Number(item.ID || 0), businessKey: item.VendorCode || item.POLineKey || item.AggregationBatchKey || "", code: error && error.code ? error.code : VMS.Constants.ERRORS.SERVICE_UNAVAILABLE });
                });
            });
        });
        return chain.then(function () { return result; });
    };

    ScheduledOperationsService.prototype._vmTeamEmail = function () {
        return this.repositories.configuration.getByKey("SYSTEM_SETTING-VM_TEAM_GROUP_EMAIL").then(function (setting) {
            var email = setting && setting.IsActive === true ? VMS.Utilities.trim(setting.TextValue) : "";
            return VMS.ValidationService.email(email) ? email : "";
        }, function () { return ""; });
    };

    ScheduledOperationsService.prototype._vendorRecipients = function (vendor) {
        return this._vmTeamEmail().then(function (teamEmail) {
            return {
                to: teamEmail ? [teamEmail] : [],
                cc: [vendor.CreatedBy && vendor.CreatedBy.email, vendor.RequestedBy && vendor.RequestedBy.email]
            };
        });
    };

    ScheduledOperationsService.prototype.ProcessVendorOnboardingReminders = function (options) {
        var self = this;
        var result;
        return this._start("ProcessVendorOnboardingReminders", options).then(function (value) {
            result = value;
            return H.queryAll(self.repositories.vendors, { filters: [{ field: "IsActive", op: "eq", value: true }, { field: "StageCode", op: "in", value: ["DOCUMENT_EVALUATION", "INTERVIEW"] }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "ExpiryReminderDate", op: "lte", value: result.now }, { field: "ExpiryReminderSentDate", op: "eq", value: null }], sort: [{ field: "ExpiryReminderDate", direction: "ASC" }, { field: "ID", direction: "ASC" }] });
        }).then(function (items) {
            return self._process(items, result, function (item) {
                var current;
                return self.repositories.vendors.getById(item.ID).then(function (row) {
                    current = row;
                    if (!current || current.IsActive !== true || $.inArray(current.StageCode, ["DOCUMENT_EVALUATION", "INTERVIEW"]) < 0 || current.StatusCode !== "IN_PROGRESS" || current.ExpiryReminderSentDate || new Date(current.ExpiryReminderDate).getTime() > new Date(result.now).getTime()) {
                        return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Vendor reminder is no longer due.");
                    }
                    return current;
                }).then(function () {
                    var actionId = VMS.Utilities.deterministicGuid("VENDOR_ONBOARDING_REMINDER|" + current.ID + "|" + current.ExpiryReminderDate);
                    return self.notificationService.SendEventAfterCommit("VENDOR_ONBOARDING_REMINDER", { record: current }, actionId);
                }).then(function (messages) {
                    return self.repositories.vendors.update(current.ID, { ExpiryReminderSentDate: messages[0].sentAt }, current._etag, { actorPerson: result.actor });
                });
            });
        });
    };

    ScheduledOperationsService.prototype.ProcessVendorExpiries = function (options) {
        var self = this;
        var result;
        return this._start("ProcessVendorExpiries", options).then(function (value) {
            result = value;
            return H.queryAll(self.repositories.vendors, { filters: [{ field: "IsActive", op: "eq", value: true }, { field: "StageCode", op: "in", value: ["DOCUMENT_EVALUATION", "INTERVIEW"] }, { field: "StatusCode", op: "eq", value: "IN_PROGRESS" }, { field: "ExpiryDueDate", op: "lte", value: result.now }], sort: [{ field: "ExpiryDueDate", direction: "ASC" }, { field: "ID", direction: "ASC" }] });
        }).then(function (items) {
            return self._process(items, result, function (item) {
                var current;
                return self.repositories.vendors.getById(item.ID).then(function (row) {
                    current = row;
                    if (!current || current.IsActive !== true || $.inArray(current.StageCode, ["DOCUMENT_EVALUATION", "INTERVIEW"]) < 0 || current.StatusCode !== "IN_PROGRESS" || new Date(current.ExpiryDueDate).getTime() > new Date(result.now).getTime()) {
                        return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "Vendor expiry is no longer due.");
                    }
                    return current;
                }).then(function () {
                    return self.mutationRunner.Run({ actionRequestId: VMS.Utilities.deterministicGuid("EXPIRE_VENDOR|" + current.ID + "|" + current.ExpiryDueDate), actionCode: "EXPIRE_VENDOR", entityTypeCode: VMS.Constants.ENTITY_TYPES.VENDOR, entityItemId: current.ID, businessKey: current.VendorCode || "VND-" + current.ID, fromStageCode: current.StageCode, fromStatusCode: current.StatusCode, toStageCode: "EXPIRED", toStatusCode: "EXPIRED", systemActor: result.actor, successCode: "VENDOR_EXPIRED", successMessage: "Vendor onboarding expired." }, function () {
                        return self.repositories.vendors.update(current.ID, { StageCode: "EXPIRED", StatusCode: "EXPIRED", RecordDate: result.now }, current._etag, { actorPerson: result.actor });
                    }, function (updated) {
                        return { eventCode: "VENDOR_EXPIRED", context: { record: updated } };
                    });
                });
            });
        });
    };

    ScheduledOperationsService.prototype._thresholdRecipients = function (line) {
        var self = this;
        return $.when(this._vmTeamEmail(), this.repositories.prpo.getById(VMS.Utilities.lookupId(line.POHeader))).then(function (teamEmail, header) {
            return { to: teamEmail ? [teamEmail] : [], cc: [header && header.CreatedBy && header.CreatedBy.email] };
        });
    };

    ScheduledOperationsService.prototype.ProcessPOLineThresholdReminders = function (options) {
        var self = this;
        var result;
        var cutoff;
        return this._start("ProcessPOLineThresholdReminders", options).then(function (value) {
            result = value;
            cutoff = new Date(new Date(result.now).getTime() - 604800000).toISOString();
            return $.when(
                H.queryAll(self.repositories.poLines, { filters: [{ field: "LineRequestStageCode", op: "eq", value: "ACTIVE" }, { field: "LineRequestStatusCode", op: "eq", value: "APPROVED" }, { field: "POLineStatusCode", op: "eq", value: "THRESHOLD_REACHED" }, { field: "AlertActivation", op: "eq", value: true }, { field: "IsActive", op: "eq", value: true }, { field: "LastAlertDate", op: "eq", value: null }] }),
                H.queryAll(self.repositories.poLines, { filters: [{ field: "LineRequestStageCode", op: "eq", value: "ACTIVE" }, { field: "LineRequestStatusCode", op: "eq", value: "APPROVED" }, { field: "POLineStatusCode", op: "eq", value: "THRESHOLD_REACHED" }, { field: "AlertActivation", op: "eq", value: true }, { field: "IsActive", op: "eq", value: true }, { field: "LastAlertDate", op: "lte", value: cutoff }] })
            );
        }).then(function (initialItems, weeklyItems) {
            var byId = {};
            var items = [];
            $.each(initialItems.concat(weeklyItems), function (_, item) { if (!byId[item.ID]) { byId[item.ID] = true; items.push(item); } });
            items.sort(function (left, right) { return Number(left.ID) - Number(right.ID); });
            return self._process(items, result, function (item) {
                var current;
                var header;
                return self.repositories.poLines.getById(item.ID).then(function (row) {
                    var due;
                    current = row;
                    if (!current) {
                        return H.reject(VMS.Constants.ERRORS.NOT_FOUND_OR_UNAUTHORIZED, "PO Line is unavailable.");
                    }
                    due = !current.LastAlertDate || new Date(current.LastAlertDate).getTime() <= new Date(cutoff).getTime();
                    if (current.LineRequestStageCode !== "ACTIVE" || current.LineRequestStatusCode !== "APPROVED" || current.POLineStatusCode !== "THRESHOLD_REACHED" || Number(current.RemainingBalance) <= 0 || current.AlertActivation !== true || current.IsActive !== true || !due) {
                        return H.reject(VMS.Constants.ERRORS.INVALID_STAGE, "PO Line threshold reminder is no longer due.");
                    }
                    return self.repositories.prpo.getById(VMS.Utilities.lookupId(current.POHeader));
                }).then(function (value) {
                    header = value;
                    var dueKey = current.LastAlertDate || "INITIAL";
                    var actionId = VMS.Utilities.deterministicGuid("PO_LINE_THRESHOLD|" + current.ID + "|" + dueKey);
                    return self.notificationService.SendEventAfterCommit("PO_LINE_THRESHOLD_REMINDER", { record: current, header: header }, actionId);
                }).then(function (messages) {
                    return self.repositories.poLines.update(current.ID, { LastAlertDate: messages[0].sentAt }, current._etag, { actorPerson: result.actor });
                });
            });
        });
    };

    ScheduledOperationsService.prototype.RecoverDirectPaymentOperations = function (options) {
        var self = this;
        var result;
        var cutoff;
        return this._start("RecoverDirectPaymentOperations", options).then(function (value) {
            result = value;
            cutoff = result.now;
            return $.when(
                H.queryAll(self.repositories.invoices, { filters: [{ field: "DirectPayment", op: "eq", value: true }, { field: "BatchOperationStateCode", op: "eq", value: "RECOVERY_REQUIRED" }, { field: "IsActive", op: "eq", value: true }] }),
                H.queryAll(self.repositories.invoices, { filters: [{ field: "DirectPayment", op: "eq", value: true }, { field: "BatchOperationStateCode", op: "eq", value: "PREPARED" }, { field: "BatchLockExpiresAt", op: "lte", value: cutoff }, { field: "IsActive", op: "eq", value: true }] })
            );
        }).then(function (recoveryRows, expiredRows) {
            var byBatch = {};
            var leaders = [];
            $.each(recoveryRows.concat(expiredRows), function (_, row) {
                if (!byBatch[row.AggregationBatchKey]) {
                    byBatch[row.AggregationBatchKey] = true;
                    leaders.push(row);
                }
            });
            leaders.sort(function (left, right) { return Number(left.ID) - Number(right.ID); });
            return self._process(leaders, result, function (leader) {
                if (leader.BatchOperationStateCode === "PREPARED") {
                    return self.repositories.invoices.update(leader.ID, { BatchOperationStateCode: "RECOVERY_REQUIRED", BatchLockToken: "", BatchLockExpiresAt: null }, leader._etag, { actorPerson: result.actor }).then(function () {
                        return self.directPaymentBatchService.RecoverOperation(leader.AggregationBatchKey, { isScheduler: true, actorPerson: result.actor });
                    });
                }
                return self.directPaymentBatchService.RecoverOperation(leader.AggregationBatchKey, { isScheduler: true, actorPerson: result.actor });
            });
        });
    };

    VMS.ScheduledOperationsService = ScheduledOperationsService;
}(window, window.jQuery));
