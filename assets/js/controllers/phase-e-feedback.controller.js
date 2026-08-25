(function (VMS, $, window) {
    'use strict';

    var service = VMS.Services.FeedbackService;
    function safe(value) { return VMS.Utilities.safeText(value); }
    function label(code, group) { return VMS.Services.DisplayLabelService.Resolve(code, group); }
    function assignmentUrl(row) { return VMS.Routes.url('FEEDBACK_ASSIGNMENTS', row.ID, 'FDB-' + row.ID); }
    function failure(result) { $('#vms-page').html('<div class="alert alert-danger" role="alert">' + safe(result && result.message || 'Feedback could not be loaded.') + '</div>'); return result; }
    function payloadMap(row) { var parsed, map = {}; try { parsed = JSON.parse(row.AnswerPayload || '{}'); } catch (ignore) { parsed = {}; } $.each(parsed.questions || [], function (_, item) { map[item.questionCode] = item.questionTypeCode === 'SCORE' ? { itemCode: item.scaleCode } : { textValue: item.textValue || '' }; }); return map; }

    function RenderAssignments() {
        var activeStatus = '', table;
        return service.GetOwnAssignmentCounts().then(function (countResult) {
            if (!countResult.ok) { return failure(countResult); }
            var counts = countResult.data;
            $('#vms-page').html('<div class="vms-register-heading"><div class="vms-register-intro"><h2>My Feedback Assignments</h2><p>Feedback assigned to your signed-in identity.</p></div></div><section class="vms-panel vms-register-panel"><div class="vms-view-tabs" role="tablist"><button type="button" class="vms-view-tab active" role="tab" aria-selected="true" data-feedback-status="">All <span class="vms-view-tab-count">' + safe(counts.All) + '</span></button><button type="button" class="vms-view-tab" role="tab" aria-selected="false" data-feedback-status="OPEN">Open <span class="vms-view-tab-count">' + safe(counts.Open) + '</span></button><button type="button" class="vms-view-tab" role="tab" aria-selected="false" data-feedback-status="SUBMITTED">Submitted <span class="vms-view-tab-count">' + safe(counts.Submitted) + '</span></button></div><div data-feedback-table></div></section>');
            table = VMS.Components.VmsTable.create({
                search: { label: 'Search assigned survey', placeholder: 'Task, vendor or survey version' },
                pageSize: 10,
                dataSource: function (query) { return service.QueryAssignmentMetadata({ search: query.search, status: activeStatus, page: query.page, pageSize: query.pageSize, sort: query.sort }); },
                columns: [
                    { field: 'FunctionCode', label: 'Task', formatter: function (value, row) { return 'Vendor Feedback · ' + label(value, 'FUNCTION') + ' · ' + row.AssignmentYear; } },
                    { field: 'SurveyVersionCode', label: 'Survey Version', formatter: function (value) { return label(value, 'SURVEY_VERSION'); } },
                    { field: 'VendorNameSnapshot', label: 'Vendor', sortable: true },
                    { field: 'AssignmentStatusCode', label: 'Status', statusBadge: true, formatter: function (value) { return label(value, 'FEEDBACK_ASSIGNMENT_STATUS'); } },
                    { label: 'Action', align: 'right', actionRenderer: function (row) { if (row.Actionable) { return [{ label: 'Open Feedback', style: 'primary', href: assignmentUrl(row) }]; } if (row.AssignmentStatusCode === 'SUBMITTED') { return [{ label: 'View', href: assignmentUrl(row) }]; } return []; } }
                ]
            }).mount('[data-feedback-table]');
            $('#vms-page').off('.phaseEFeedback').on('click.phaseEFeedback', '[data-feedback-status]', function () {
                activeStatus = $(this).attr('data-feedback-status');
                $('#vms-page [data-feedback-status]').removeClass('active').attr('aria-selected', 'false'); $(this).addClass('active').attr('aria-selected', 'true');
                table.query.page = 1; table.refresh();
            });
            return table.refresh().then(function () { return VMS.Utilities.success({ table: table, refresh: function () { return table.refresh(); } }); });
        });
    }

    function questionMarkup(question, answer, readOnly) {
        var html = '<fieldset class="vms-feedback-question" data-vms-validation-field="' + safe(question.questionCode) + '"' + (readOnly ? ' disabled' : '') + '><legend><span class="vms-question-order">' + safe(question.displayOrder) + '</span>' + safe(question.questionText) + (question.questionTypeCode === 'SCORE' ? ' <span class="text-danger" aria-label="required">*</span>' : ' <span class="vms-optional">Optional</span>') + '</legend>';
        if (question.questionTypeCode === 'SCORE') {
            html += '<div class="vms-feedback-scale">';
            $.each(question.scaleItems || [], function (_, item) { var id = 'feedback-' + question.questionCode + '-' + item.itemCode, checked = answer && answer.itemCode === item.itemCode; html += '<label class="vms-feedback-choice" for="' + safe(id) + '"><input type="radio" id="' + safe(id) + '" name="' + safe(question.questionCode) + '" value="' + safe(item.itemCode) + '"' + (checked ? ' checked' : '') + '><span>' + safe(item.displayLabel) + '</span><small>' + safe(item.numericValue) + '</small></label>'; });
            html += '</div>';
        } else { html += '<textarea class="form-control" name="' + safe(question.questionCode) + '" rows="4" maxlength="2000" placeholder="Add comments (optional)">' + safe(answer && answer.textValue || '') + '</textarea>'; }
        return html + '<div data-vms-question-error></div></fieldset>';
    }

    function RenderForm(id, key) {
        return VMS.Services.DestinationResolverService.ResolveHostedDestination('FEEDBACK_ASSIGNMENTS', { id: id, key: key, interfaceCode: 'FEEDBACK_FORM' }).then(function (destination) {
            if (!destination.ok) { return failure(destination); }
            return service.GetOwnAssignment(destination.data.id, destination.data.key).then(function (result) {
            if (!result.ok) { return failure(result); }
            var row = result.data, contract = row.QuestionSetSnapshot, answers = payloadMap(row), readOnly = row.AssignmentStatusCode === 'SUBMITTED', dirty = false, requestId = VMS.Utilities.guid(), html = '';
            $.each(contract.questions.slice(0).sort(function (a, b) { return Number(a.displayOrder) - Number(b.displayOrder); }), function (_, question) { html += questionMarkup(question, answers[question.questionCode], readOnly); });
            $('#vms-page').html(VMS.Components.VmsBackLink('FEEDBACK_ASSIGNMENTS', 'Back to My Feedback Assignments') + '<section class="vms-profile-header vms-feedback-header"><div><span class="vms-profile-kicker">FEEDBACK · ' + safe(label(row.AssignmentStatusCode, 'FEEDBACK_ASSIGNMENT_STATUS').toUpperCase()) + '</span><h2>Survey – ' + safe(row.VendorNameSnapshot) + '</h2><p><strong>Assigned to:</strong> ' + safe(VMS.Services.AccessService.GetCurrentUser().UserName) + ' · ' + safe(label(row.FunctionCode, 'FUNCTION')) + ' · ' + safe(row.AssignmentYear) + '</p><p><strong>Survey Version:</strong> ' + safe(contract.surveyVersionSnapshot.surveyName || row.SurveyVersionCode) + ' (' + safe(row.SurveyVersionCode) + ')</p></div><div>' + VMS.Components.VmsStatusBadge(row.AssignmentStatusCode, label(row.AssignmentStatusCode, 'FEEDBACK_ASSIGNMENT_STATUS')) + '</div></section><section class="vms-panel vms-feedback-form-panel"><form id="vms-feedback-form" novalidate><div data-vms-validation></div>' + html + '<div class="vms-form-actions"><button type="button" class="btn btn-outline-secondary" data-feedback-cancel>' + (readOnly ? 'Back' : 'Cancel') + '</button>' + (readOnly ? '' : '<button type="submit" class="btn btn-vms-primary" data-feedback-submit>Submit Feedback</button>') + '</div></form></section>');
            function leave() { window.location.href = VMS.Routes.url('FEEDBACK_ASSIGNMENTS'); }
            function confirmLeave() { if (!dirty || readOnly) { leave(); return; } VMS.Components.VmsConfirmation.open({ title: 'Discard changes?', message: 'Your unsaved Feedback responses will be discarded.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }).then(function (confirmed) { if (confirmed) { leave(); } }); }
            function collect() { var responses = []; $.each(contract.questions, function (_, question) { if (question.questionTypeCode === 'SCORE') { responses.push({ questionCode: question.questionCode, itemCode: $('#vms-feedback-form [name="' + question.questionCode + '"]:checked').val() || '' }); } else { responses.push({ questionCode: question.questionCode, textValue: $('#vms-feedback-form [name="' + question.questionCode + '"]').val() || '' }); } }); return responses; }
            function showValidation(submitResult) { $('#vms-feedback-form [data-vms-question-error]').empty(); $('#vms-feedback-form [data-vms-validation]').html(VMS.Components.VmsValidationSummary(submitResult.fieldErrors || [{ message: submitResult.message }])); $.each(submitResult.fieldErrors || [], function (_, error) { $('#vms-feedback-form [data-vms-validation-field="' + error.field + '"] [data-vms-question-error]').html('<div class="invalid-feedback d-block">' + safe(error.message) + '</div>'); }); }
            $('#vms-page').off('.phaseEForm').on('change.phaseEForm input.phaseEForm', '#vms-feedback-form :input', function () { dirty = true; }).on('click.phaseEForm', '[data-feedback-cancel]', confirmLeave).on('submit.phaseEForm', '#vms-feedback-form', function (event) {
                event.preventDefault(); if (readOnly) { return; }
                var button = $('[data-feedback-submit]').prop('disabled', true).text('Submitting…'); $('#vms-feedback-form [data-vms-validation]').empty();
                service.SubmitOwn(row.ID, key, collect(), row._etag, requestId).then(function (submitted) {
                    if (!submitted.ok) { button.prop('disabled', false).text('Submit Feedback'); if (submitted.code === 'VALIDATION_FAILED') { showValidation(submitted); } else { $('#vms-feedback-form [data-vms-validation]').html('<div class="alert alert-danger" role="alert">' + safe(submitted.message) + '</div>'); } return; }
                    dirty = false; VMS.Components.VmsToast.show({ type: 'success', message: 'Feedback submitted successfully.' }); $.each(submitted.warnings || [], function (_, warning) { VMS.Components.VmsToast.show({ type: 'warning', message: warning.message }); }); window.location.href = VMS.Routes.url('FEEDBACK_ASSIGNMENTS');
                });
            });
            $(window).off('beforeunload.phaseEForm').on('beforeunload.phaseEForm', function (event) { if (dirty && !readOnly) { event.preventDefault(); event.returnValue = ''; return ''; } });
            return VMS.Utilities.success(row);
            });
        });
    }

    VMS.FeedbackPages = { RenderAssignments: RenderAssignments, RenderForm: RenderForm };
}(window.VMS, window.jQuery, window));
