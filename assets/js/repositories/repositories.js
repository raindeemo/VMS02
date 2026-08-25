(function (VMS) {
    'use strict';
    var definitions = {
        ConfigurationRepository: ['ML_configuration', 'ConfigKey'], CountryRepository: ['Country', 'CountryCode'], CityRepository: ['City', 'CountryCityKey'],
        CurrencyRepository: ['Currency', 'CurrencyCode'], CategoryRepository: ['Category', 'CategoryKey'], UserRepository: ['userDB', 'UserKey'],
        VendorRepository: ['ML_vendor', 'VendorCodeNormalizedKey'], PRPORepository: ['PR_PO', 'PRNumber'], POLineRepository: ['PO_Lines', 'POLineKey'],
        InvoiceRepository: ['Invoice', 'InvoiceIdentifier'], WorkflowHistoryRepository: ['Workflow_History', 'ActionRequestId'],
        SurveyQuestionRepository: ['SurveyQuestions', 'QuestionVersionKey'], FeedbackAssignmentRepository: ['Feedback_Assignment', 'FeedbackAssignmentKey']
    };
    VMS.Repositories.initialize = function () {
        if (VMS.Repositories.PRPORepository) { return; }
        Object.keys(definitions).forEach(function (name) { VMS.Repositories[name] = new VMS.Repositories.BaseRepository(definitions[name][0], definitions[name][1]); });
        VMS.Repositories.PRPORepository.updateWithLinesAtomic = function (headerId, headerPatch, headerEtag, linePatches) { return this.provider().updatePRPOAndLinesAtomic(headerId, headerPatch, headerEtag, linePatches); };
    };
}(window.VMS));
