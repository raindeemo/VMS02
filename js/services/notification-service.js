(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var H = VMS.DomainHelpers;

    function NotificationService(repositories, accessService, config, destinationResolverService) {
        this.repositories = repositories;
        this.accessService = accessService;
        this.config = config;
        this.destinationResolverService = destinationResolverService;
    }

    NotificationService.prototype._store = function (message) {
        var items = [];
        var raw = window.sessionStorage.getItem(this.config.DUMMY_NOTIFICATION_KEY);
        var index;
        if (raw) { items = JSON.parse(raw); }
        for (index = 0; index < items.length; index += 1) {
            if (items[index].eventCode === message.eventCode && items[index].actionRequestId === message.actionRequestId && items[index].recipientKey === message.recipientKey && items[index].outcome === "SUCCESS") { return items[index]; }
        }
        items.push(message);
        window.sessionStorage.setItem(this.config.DUMMY_NOTIFICATION_KEY, JSON.stringify(items));
        return message;
    };

    NotificationService.prototype._dedupe = function (emails) {
        var output = [];
        var seen = {};
        $.each(emails || [], function (_, email) {
            var key = VMS.Utilities.normalizeKey(email);
            if (key && VMS.ValidationService.email(key) && !seen[key]) { seen[key] = true; output.push(key); }
        });
        return output;
    };

    NotificationService.prototype._personEmail = function (value) {
        return value && typeof value === "object" ? value.email : value;
    };

    NotificationService.prototype._activeUsers = function () {
        return H.queryAll(this.repositories.users, { filters: [{ field: "IsActive", op: "eq", value: true }], select: ["ID", "UserName", "Email", "RoleCode", "FunctionCode", "AssignedCategories", "IsDirectPaymentAuthorized", "IsActive"] });
    };

    NotificationService.prototype._vmTeamEmail = function () {
        return this.repositories.configuration.getByKey("SYSTEM_SETTING-VM_TEAM_GROUP_EMAIL").then(function (setting) {
            var email = setting && setting.IsActive === true ? VMS.Utilities.trim(setting.TextValue) : "";
            return VMS.ValidationService.email(email) ? email : "";
        }, function () { return ""; });
    };

    NotificationService.prototype._pools = function (categoryId) {
        return this._activeUsers().then(function (users) {
            return {
                managers: $.map($.grep(users, function (user) { return user.FunctionCode === "VENDOR_MANAGEMENT" && user.RoleCode === "MANAGER"; }), function (user) { return user.Email; }),
                processors: $.map($.grep(users, function (user) { return user.FunctionCode === "VENDOR_MANAGEMENT" && $.inArray(user.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0 && $.inArray(Number(categoryId), VMS.Utilities.lookupIds(user.AssignedCategories || [])) >= 0; }), function (user) { return user.Email; }),
                directPaymentProcessors: $.map($.grep(users, function (user) { return user.FunctionCode === "VENDOR_MANAGEMENT" && $.inArray(user.RoleCode, ["EMPLOYEE", "CO_OP"]) >= 0 && user.IsDirectPaymentAuthorized === true; }), function (user) { return user.Email; })
            };
        });
    };

    NotificationService.prototype._identifier = function (record) {
        return record && (record.AggregationBatchKey || record.InvoiceIdentifier || record.PRNumber || record.POLineKey || record.VendorCode || record.VendorName) || "";
    };

    NotificationService.prototype._notificationLink = function (eventCode, record) {
        var entityType;
        if (!this.destinationResolverService || $.inArray(eventCode, ["VENDOR_CREATED", "VENDOR_APPROVED", "VENDOR_REJECTED"]) >= 0) { return null; }
        if (eventCode.indexOf("VENDOR_") === 0) { entityType = VMS.Constants.ENTITY_TYPES.VENDOR; }
        else if (eventCode.indexOf("PR_") === 0) { entityType = VMS.Constants.ENTITY_TYPES.PR_PO; }
        else if (eventCode.indexOf("PO_") === 0) { entityType = VMS.Constants.ENTITY_TYPES.PO_LINE; }
        else if (eventCode.indexOf("INVOICE_") === 0 || eventCode.indexOf("DP_REVIEW_") === 0) { entityType = VMS.Constants.ENTITY_TYPES.INVOICE; }
        else if (eventCode.indexOf("DP_BATCH_") === 0) { entityType = VMS.Constants.ENTITY_TYPES.DIRECT_PAYMENT_BATCH; }
        else if (eventCode.indexOf("FEEDBACK_") === 0) { entityType = VMS.Constants.ENTITY_TYPES.FEEDBACK_ASSIGNMENT; }
        else if (eventCode === "ACCESS_GRANTED") { entityType = VMS.Constants.ENTITY_TYPES.USER; }
        if (entityType !== VMS.Constants.ENTITY_TYPES.USER && (!record || Number(record.ID) <= 0)) { return null; }
        return entityType ? this.destinationResolverService.ResolveNotificationDestination(entityType, record || {}) : null;
    };

    NotificationService.prototype._message = function (eventCode, title, record, to, cc, facts, reason) {
        var identifier = this._identifier(record);
        var lines = [];
        var link = this._notificationLink(eventCode, record);
        $.each(facts || [], function (_, fact) { if (fact && fact.value !== null && fact.value !== undefined && fact.value !== "") { lines.push(fact.label + ": " + fact.value); } });
        if (reason) { lines.push("Reason: " + reason); }
        return { eventCode: eventCode, to: to || [], cc: cc || [], content: { subject: "[VMS] " + title + (identifier ? " — " + identifier : ""), body: lines.join("\n"), link: link } };
    };

    NotificationService.prototype._renderHtml = function (subject, body, link) {
        var lines = String(body || "").split("\n");
        var html = '<div style="font-family:Arial,sans-serif;color:#1f2937"><h1 style="font-size:20px">VMS</h1><h2 style="font-size:17px">' + VMS.Utilities.escapeHtml(subject) + '</h2><dl>';
        $.each(lines, function (_, line) {
            var separator = line.indexOf(":");
            if (separator > 0) { html += '<dt style="font-weight:bold">' + VMS.Utilities.escapeHtml(line.substring(0, separator)) + '</dt><dd style="margin:0 0 10px">' + VMS.Utilities.escapeHtml(line.substring(separator + 1).replace(/^\s+/, "")) + "</dd>"; }
            else if (line) { html += '<dd style="margin:0 0 10px">' + VMS.Utilities.escapeHtml(line) + "</dd>"; }
        });
        html += "</dl>";
        if (link && link.url) { html += '<p><a href="' + VMS.Utilities.escapeHtml(link.url) + '">Open the authorized VMS destination</a></p>'; }
        return html + '<p style="font-size:12px;color:#6b7280">This message was generated by the Vendor Management System.</p></div>';
    };

    NotificationService.prototype._buildBatchMessages = function (eventCode, context, pools) {
        var self = this;
        var members = context.members || [];
        var leader = context.record || members[0] || {};
        var fullRecipients = eventCode === "DP_BATCH_SUBMITTED" || eventCode === "DP_BATCH_SETTLED" ? pools.managers : pools.directPaymentProcessors;
        var titleMap = { DP_BATCH_RELEASED: "Direct Payment Batch Released", DP_BATCH_SUBMITTED: "Direct Payment Batch Submitted for Approval", DP_BATCH_UPDATE_REQUIRED: "Direct Payment Batch Update Required", DP_BATCH_APPROVED: "Direct Payment Batch Approved", DP_BATCH_SETTLED: "Direct Payment Batch Settled" };
        var messages = [this._message(eventCode, titleMap[eventCode], leader, fullRecipients, [], [{ label: "Batch", value: leader.AggregationBatchKey }, { label: "Period", value: leader.AggregationPeriod }, { label: "Vendor", value: leader.VendorNameSnapshot }, { label: "Invoice count", value: members.length }, { label: "PO Line", value: leader.POLineKeySnapshot }, { label: "Currency", value: leader.CurrencyCodeSnapshot }, { label: "Status", value: leader.StageCode }], eventCode === "DP_BATCH_UPDATE_REQUIRED" ? leader.RejectionComment : "")];
        var fullMap = {};
        var associated = {};
        $.each(this._dedupe(fullRecipients), function (_, email) { fullMap[email] = true; });
        if (eventCode === "DP_BATCH_RELEASED") { return messages; }
        $.each(members, function (_, member) {
            $.each([self._personEmail(member.CreatedBy), member.FocalPointEmail], function (index, email) {
                var key = VMS.Utilities.normalizeKey(email);
                if (!key || fullMap[key] || !VMS.ValidationService.email(key)) { return; }
                if (!associated[key]) { associated[key] = []; }
                if ($.inArray(member.InvoiceIdentifier, associated[key]) < 0) { associated[key].push(member.InvoiceIdentifier); }
            });
        });
        $.each(associated, function (email, identifiers) {
            messages.push(self._message(eventCode + "_MEMBER", titleMap[eventCode], { InvoiceIdentifier: identifiers.join(", ") }, [email], [], [{ label: "Associated Invoice", value: identifiers.join(", ") }, { label: "Status", value: leader.StageCode }], eventCode === "DP_BATCH_UPDATE_REQUIRED" ? leader.RejectionComment : ""));
        });
        return messages;
    };

    NotificationService.prototype.ResolveEvent = function (eventCode, context) {
        var self = this;
        var record = context && (context.record || context.entity) ? (context.record || context.entity) : context;
        var categoryId = VMS.Utilities.lookupId(record && record.Category);
        return $.when(this._pools(categoryId), this._vmTeamEmail()).then(function (pools, teamEmail) {
            var creator = self._personEmail(record && record.CreatedBy);
            var requestedBy = self._personEmail(record && record.RequestedBy);
            var focal = record && record.FocalPointEmail;
            var to = [];
            var cc = [];
            var title = eventCode;
            var facts = [];
            var reason = "";
            if (eventCode === "FEEDBACK_ASSIGNMENTS_GENERATED") {
                var byEmail = {};
                var messages = [];
                $.each(context.assignments || [], function (_, assignment) {
                    var email = VMS.Utilities.normalizeKey(assignment.AssignedUserEmail);
                    if (!email || !VMS.ValidationService.email(email)) { return; }
                    if (!byEmail[email]) { byEmail[email] = []; }
                    byEmail[email].push(assignment);
                });
                $.each(byEmail, function (email, assignments) {
                    var assignmentFacts = [];
                    $.each(assignments, function (_, assignment) { assignmentFacts.push({ label: "Assignment", value: assignment.VendorNameSnapshot + " · " + assignment.AssignmentYear + " · OPEN · FDB-" + assignment.ID }); });
                    messages.push(self._message(eventCode, "Feedback Assignment Available", {}, [email], [], assignmentFacts, ""));
                });
                return messages;
            }
            if (eventCode.indexOf("DP_BATCH_") === 0) { return self._buildBatchMessages(eventCode, context || {}, pools); }
            if (eventCode === "VENDOR_CREATED") { to = String(record.Email || "").split(";"); cc = [creator, requestedBy]; title = "Vendor Registration Received"; facts = [{ label: "Vendor", value: record.VendorName }, { label: "Registration date", value: record.RegistrationDate }]; }
            else if (eventCode === "VENDOR_EVALUATION_PASSED") { to = [teamEmail]; cc = [creator, requestedBy]; title = "Vendor Evaluation Passed"; facts = [{ label: "Vendor", value: record.VendorName }, { label: "Status", value: "Ready for Interview" }]; }
            else if (eventCode === "VENDOR_APPROVED") { to = String(record.Email || "").split(";"); cc = [creator, requestedBy]; title = "Vendor Approved"; facts = [{ label: "Vendor", value: record.VendorName }, { label: "Vendor Code", value: record.VendorCode }]; }
            else if (eventCode === "VENDOR_REJECTED") { to = String(record.Email || "").split(";"); cc = [creator, requestedBy]; title = "Vendor Registration Rejected"; facts = [{ label: "Vendor", value: record.VendorName }, { label: "Status", value: "Rejected" }]; reason = record.RejectionReason; }
            else if (eventCode === "VENDOR_EXPIRED") { to = [teamEmail]; cc = [creator, requestedBy]; title = "Vendor Onboarding Expired"; facts = [{ label: "Vendor", value: record.VendorName }, { label: "Expiry due date", value: record.ExpiryDueDate }]; }
            else if (eventCode === "VENDOR_ONBOARDING_REMINDER") { to = [teamEmail]; cc = [creator, requestedBy]; title = "Vendor Onboarding Reminder"; facts = [{ label: "Vendor", value: record.VendorName }, { label: "Registration date", value: record.RegistrationDate }, { label: "Expiry due date", value: record.ExpiryDueDate }]; }
            else if (eventCode === "PR_CREATED" || eventCode === "PR_RESUBMITTED") { to = pools.managers; cc = [creator]; title = eventCode === "PR_CREATED" ? "PR/PO Created" : "PR/PO Resubmitted"; facts = [{ label: "PR Number", value: record.PRNumber }, { label: "Vendor", value: record.VendorNameSnapshot }, { label: "Amount", value: record.PRAmount + " " + (record.Currency && record.Currency.title || "") }]; }
            else if (eventCode === "PR_APPROVED") { to = [teamEmail]; cc = [creator]; title = "PR/PO Approved"; facts = [{ label: "PR Number", value: record.PRNumber }, { label: "Vendor", value: record.VendorNameSnapshot }, { label: "Status", value: "Pending GPS" }]; }
            else if (eventCode === "PR_UPDATE_REQUIRED") { to = [teamEmail]; cc = [creator]; title = "PR/PO Update Required"; facts = [{ label: "PR Number", value: record.PRNumber }, { label: "Vendor", value: record.VendorNameSnapshot }]; reason = record.RejectionReason; }
            else if (eventCode === "PR_REJECTED") { to = [creator]; title = "PR/PO Rejected"; facts = [{ label: "PR Number", value: record.PRNumber }, { label: "Vendor", value: record.VendorNameSnapshot }]; reason = record.RejectionReason; }
            else if (eventCode === "PO_INITIAL_LINE_CREATED" || eventCode === "PO_LINE_ACTIVATED") { to = [context.header && self._personEmail(context.header.CreatedBy) || creator]; cc = [teamEmail]; title = eventCode === "PO_INITIAL_LINE_CREATED" ? "PO and Initial Line Created" : "Additional PO Line Activated"; facts = [{ label: "PO Number", value: record.PONumber }, { label: "PO Line", value: record.POLineNumber }, { label: "Line amount", value: record.POLineAmount }]; }
            else if (eventCode === "PO_LINE_THRESHOLD_REMINDER") { to = [teamEmail]; cc = [context.header && self._personEmail(context.header.CreatedBy)]; title = "PO Line Threshold"; facts = [{ label: "PO Line", value: record.POLineKey }, { label: "Line amount", value: record.POLineAmount }, { label: "Remaining balance", value: record.RemainingBalance }, { label: "Threshold amount", value: record.ThresholdAmount }]; }
            else if (eventCode === "INVOICE_CREATED") { to = (record.DirectPayment ? pools.directPaymentProcessors : pools.processors).concat([creator, focal]); cc = pools.managers; title = record.DirectPayment ? "Direct Payment Invoice Created" : "Standard Invoice Created"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Vendor", value: record.VendorNameSnapshot }, { label: "Category", value: record.Category && record.Category.title }, { label: "Source", value: record.InvoiceSourceFunctionCode }]; }
            else if (eventCode === "INVOICE_SUBMITTED") { to = pools.managers; cc = [creator, focal]; title = "Invoice Submitted for Approval"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Vendor", value: record.VendorNameSnapshot }, { label: "Supplier Invoice", value: record.InvoiceNumber }, { label: "PO Line", value: record.POLineKeySnapshot }, { label: "Currency", value: record.CurrencyCodeSnapshot }, { label: "Final amount", value: record.FinalInvoiceAmount }]; }
            else if (eventCode === "INVOICE_UPDATE_REQUIRED") { to = pools.processors; cc = [creator, focal]; title = "Invoice Update Required"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Status", value: "Update Required" }]; reason = record.RejectionComment; }
            else if (eventCode === "INVOICE_REJECTED") { to = [creator, focal]; title = "Invoice Rejected"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Status", value: "Rejected" }, { label: "Rejection reason", value: context.reasonLabel || record.RejectionReasonCode }]; reason = record.RejectionComment; }
            else if (eventCode === "INVOICE_APPROVED") { to = pools.processors; cc = [creator, focal]; title = "Invoice Approved"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "PO Line", value: record.POLineKeySnapshot }, { label: "Currency", value: record.CurrencyCodeSnapshot }, { label: "Final amount", value: record.FinalInvoiceAmount }]; }
            else if (eventCode === "INVOICE_SETTLED") { to = [creator, focal]; cc = pools.managers; title = "Invoice Settled"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Vendor", value: record.VendorNameSnapshot }, { label: "Settlement date", value: record.SettlementDate }]; }
            else if (eventCode === "DP_REVIEW_DONE") { to = pools.directPaymentProcessors; cc = [creator, focal]; title = "Direct Payment Review Completed"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Aggregation period", value: record.AggregationPeriod }, { label: "Status", value: "Payment Aggregation" }]; }
            else if (eventCode === "DP_REVIEW_REJECTED") { to = [creator, focal]; title = "Direct Payment Invoice Rejected"; facts = [{ label: "Invoice", value: record.InvoiceIdentifier }, { label: "Rejection reason", value: context.reasonLabel || record.RejectionReasonCode }]; reason = record.RejectionComment; }
            else if (eventCode === "FEEDBACK_SUBMITTED") { to = [record.AssignedUserEmail]; title = "Feedback Submitted"; facts = [{ label: "Vendor", value: record.VendorNameSnapshot }, { label: "Assignment year", value: record.AssignmentYear }, { label: "Completed date", value: record.CompletedDate }]; }
            else if (eventCode === "ACCESS_GRANTED") { to = [record.Email]; title = "VMS Access Granted"; facts = [{ label: "User", value: record.UserName }, { label: "Function", value: record.FunctionCode }, { label: "Role", value: record.RoleCode }]; }
            else { return []; }
            return [self._message(eventCode, title, record, to, cc, facts, reason)];
        });
    };

    NotificationService.prototype.SendAfterCommit = function (eventCode, recipients, content, actionRequestId) {
        var deferred = $.Deferred();
        var to = this._dedupe($.isArray(recipients) ? recipients : (recipients && recipients.to ? recipients.to : []));
        var cc = this._dedupe(recipients && !$.isArray(recipients) && recipients.cc ? recipients.cc : []);
        var toMap = {};
        var message;
        $.each(to, function (_, address) { toMap[address] = true; });
        cc = $.grep(cc, function (address) { return !toMap[address]; });
        message = { eventCode: eventCode, to: to, cc: cc, recipients: to.concat(cc), recipientKey: to.concat(["CC"], cc).join(";"), subject: String(content.subject || "VMS notification"), body: VMS.Utilities.escapeHtml(content.body || ""), html: this._renderHtml(content.subject || "VMS notification", content.body || "", content.link), link: content.link || null, actionRequestId: actionRequestId, sentAt: VMS.ClockService.utcNow(), outcome: "SUCCESS" };
        if (this.config.USE_DUMMY_DATA === true) {
            if (window.sessionStorage.getItem(this.config.DUMMY_NOTIFICATION_FAILURE_KEY) === "true") { deferred.reject({ code: "EMAIL_DELIVERY_FAILED", safeMessage: "The action succeeded, but its email notification could not be delivered." }); }
            else if (!message.recipients.length) { deferred.reject({ code: "EMAIL_DELIVERY_FAILED", safeMessage: "No valid notification recipient is available." }); }
            else { deferred.resolve(this._store(message)); }
            return deferred.promise();
        }
        deferred.reject({ code: VMS.Constants.ERRORS.SERVICE_UNAVAILABLE, safeMessage: "Production email delivery is not configured." });
        return deferred.promise();
    };

    NotificationService.prototype.SendEventAfterCommit = function (eventCode, context, actionRequestId) {
        var self = this;
        return this.ResolveEvent(eventCode, context || {}).then(function (messages) {
            var chain = $.Deferred().resolve().promise();
            var delivered = [];
            if (!messages.length) { return H.reject(VMS.Constants.ERRORS.CONFIGURATION_INVALID, "The requested notification event is not defined."); }
            $.each(messages, function (_, message) {
                chain = chain.then(function () { return self.SendAfterCommit(message.eventCode, { to: message.to, cc: message.cc }, message.content, actionRequestId).then(function (result) { delivered.push(result); }); });
            });
            return chain.then(function () { return delivered; });
        });
    };

    NotificationService.prototype.GetDummyLog = function () {
        var raw = window.sessionStorage.getItem(this.config.DUMMY_NOTIFICATION_KEY);
        return raw ? JSON.parse(raw) : [];
    };

    VMS.NotificationService = NotificationService;
}(window, window.jQuery));
