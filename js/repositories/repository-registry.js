(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function Repository(provider, listName, keyField, attachmentsAllowed) {
        this.provider = provider;
        this.listName = listName;
        this.keyField = keyField;
        this.attachmentsAllowed = attachmentsAllowed === true;
    }

    Repository.prototype.getById = function (id, selectSpec) {
        return this.provider.getById(this.listName, id, selectSpec);
    };

    Repository.prototype.getByKey = function (key, selectSpec) {
        return this.provider.getByKey(this.listName, this.keyField, key, selectSpec);
    };

    Repository.prototype.query = function (querySpec) {
        return this.provider.query(this.listName, querySpec);
    };

    Repository.prototype.count = function (querySpec) {
        return this.provider.count(this.listName, querySpec);
    };

    Repository.prototype.create = function (model, actionContext) {
        return this.provider.create(this.listName, model, actionContext);
    };

    Repository.prototype.update = function (id, patch, etag, actionContext) {
        return this.provider.update(this.listName, id, patch, etag, actionContext);
    };

    Repository.prototype.addAttachments = function (id, files, actionContext) {
        if (!this.attachmentsAllowed) {
            return window.jQuery.Deferred().reject({
                code: VMS.Constants.ERRORS.UNSUPPORTED_OPERATION,
                safeMessage: "Attachments are not available for this record type."
            }).promise();
        }
        return this.provider.addAttachments(this.listName, id, files, actionContext);
    };

    Repository.prototype.getAttachments = function (id) {
        if (!this.attachmentsAllowed) {
            return window.jQuery.Deferred().resolve([]).promise();
        }
        return this.provider.getAttachments(this.listName, id);
    };

    Repository.prototype.replaceAttachments = function (id, files, etag, actionContext) {
        if (!this.attachmentsAllowed) {
            return window.jQuery.Deferred().reject({
                code: VMS.Constants.ERRORS.UNSUPPORTED_OPERATION,
                safeMessage: "Attachments are not available for this record type."
            }).promise();
        }
        return this.provider.replaceAttachments(this.listName, id, files, etag, actionContext);
    };

    VMS.RepositoryRegistry = {
        create: function (provider) {
            return {
                configuration: new Repository(provider, "ML_configuration", "ConfigKey", false),
                countries: new Repository(provider, "Country", "CountryCode", false),
                cities: new Repository(provider, "City", "CountryCityKey", false),
                currencies: new Repository(provider, "Currency", "CurrencyCode", false),
                categories: new Repository(provider, "Category", "CategoryKey", false),
                users: new Repository(provider, "userDB", "UserKey", false),
                vendors: new Repository(provider, "ML_vendor", "VendorCodeNormalizedKey", true),
                prpo: new Repository(provider, "PR_PO", "PRNumber", false),
                poLines: new Repository(provider, "PO_Lines", "POLineKey", false),
                invoices: new Repository(provider, "Invoice", "InvoiceIdentifier", true),
                history: new Repository(provider, "Workflow_History", "ActionRequestId", false),
                surveyQuestions: new Repository(provider, "SurveyQuestions", "QuestionVersionKey", false),
                feedbackAssignments: new Repository(provider, "Feedback_Assignment", "FeedbackAssignmentKey", false)
            };
        }
    };
}(window));
