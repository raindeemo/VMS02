(function (window, $) {
    "use strict";

    var VMS = window.VMS;
    var C = VMS.ControllerHelpers;
    var U = VMS.Utilities;

    VMS.PageControllers.FEEDBACK_ASSIGNMENTS = {
        title: "Feedback Assignments",
        run: function () {
            var table;
            C.content('<p class="vms-context">Only your own active Function-specific Vendor Feedback assignments are shown.</p><section class="vms-panel"><div id="feedback-table"></div></section>');
            table = new VMS.TableComponent("#feedback-table", {
                id: "feedback", searchPlaceholder: "Search Vendor", searchFields: ["VendorNameSnapshot", "VendorCodeSnapshot"], sort: [{ field: "AssignmentYear", direction: "DESC" }, { field: "AssignmentDate", direction: "DESC" }],
                query: function (spec) { return VMS.App.feedbackService.QueryOwnAssignments(spec); },
                columns: [
                    { label: "Vendor", render: function (row) { return '<strong>' + U.escapeHtml(row.VendorNameSnapshot) + "</strong>"; } },
                    { label: "Function", render: function (row) { return U.escapeHtml(VMS.UI.titleize(row.FunctionCode)); } },
                    { label: "Year", render: function (row) { return U.escapeHtml(row.AssignmentYear); } },
                    { label: "Survey Version", render: function (row) { return U.escapeHtml(row.SurveyVersionCode); } },
                    { label: "Status", render: function (row) { return VMS.UI.status(row.AssignmentStatusCode); } },
                    { label: "Active", render: function (row) { return C.activeLabel(row.IsActive); } }
                ],
                actions: function (row) { return C.linkButton(row.AssignmentStatusCode === "OPEN" ? "Open Feedback" : "View Feedback", VMS.Config.ROUTES.FEEDBACK_FORM + "?id=" + row.ID + "&key=FDB-" + row.ID, row.AssignmentStatusCode === "OPEN" ? "btn-primary" : "btn-secondary"); },
                onAction: function () {}
            });
            table.render();
        }
    };

    VMS.PageControllers.FEEDBACK_FORM = {
        title: "Vendor Feedback",
        run: function () {
            var query = C.query();
            C.loading("Loading your private Feedback assignment...");
            VMS.App.feedbackService.GetOwnAssignment(query.id, query.key).then(function (assignment) {
                var snapshot = JSON.parse(assignment.QuestionSetSnapshotJSON);
                var submitted = assignment.AnswerPayload ? JSON.parse(assignment.AnswerPayload) : null;
                var prior = {};
                var form = "";
                $.each((submitted && (submitted.scoredAnswers || submitted.answers)) || [], function (_, answer) { prior[answer.questionCode] = answer; });
                if (submitted && submitted.openText) { prior[submitted.openText.questionCode] = submitted.openText; }
                $.each(snapshot.questions, function (index, question) {
                    var code = question.questionCode || question.code;
                    var text = question.questionText || question.text;
                    var type = question.questionTypeCode || question.type;
                    var scales = question.scaleOptions || question.scale || [];
                    form += '<fieldset class="vms-panel"><legend class="vms-subheading">' + (index + 1) + ". " + U.escapeHtml(text) + "</legend>";
                    if (type === "SCORE") {
                        $.each(scales, function (_, scale) {
                            var scaleCode = scale.itemCode || scale.code;
                            var label = scale.displayLabel || scale.label;
                            var checked = prior[code] && prior[code].scaleCode === scaleCode;
                            form += '<div class="form-check"><input class="form-check-input" type="radio" name="q-' + U.escapeHtml(code) + '" id="q-' + U.escapeHtml(code + "-" + scaleCode) + '" value="' + U.escapeHtml(scaleCode) + '"' + (checked ? " checked" : "") + (assignment.AssignmentStatusCode === "SUBMITTED" ? " disabled" : "") + '><label class="form-check-label" for="q-' + U.escapeHtml(code + "-" + scaleCode) + '">' + U.escapeHtml(label) + "</label></div>";
                        });
                    } else {
                        form += '<textarea class="form-control" name="q-' + U.escapeHtml(code) + '" rows="4"' + (assignment.AssignmentStatusCode === "SUBMITTED" ? " disabled" : "") + '>' + U.escapeHtml(prior[code] ? prior[code].textValue || prior[code].text : "") + "</textarea>";
                    }
                    form += "</fieldset>";
                });
                C.content('<div class="vms-toolbar"><div><h2 class="vms-section-heading">' + U.escapeHtml(assignment.VendorNameSnapshot) + '</h2><p class="vms-context">Private Feedback · ' + U.escapeHtml(VMS.UI.titleize(assignment.FunctionCode)) + " · " + assignment.AssignmentYear + '</p></div><a class="btn btn-secondary" href="' + VMS.Config.ROUTES.FEEDBACK_ASSIGNMENTS + '">Back to Assignments</a></div><div class="vms-info-panel">Only you can read this response. Individual answers are not available to administrators, reports, or other users.</div><form id="feedback-form">' + form + (assignment.AssignmentStatusCode === "OPEN" ? '<div class="text-right"><button type="submit" class="btn btn-primary">Submit Feedback</button></div>' : '<div class="vms-info-panel">This Feedback was submitted on ' + VMS.UI.date(assignment.CompletedDate) + " and is read-only.</div>") + "</form>");
                $("#feedback-form").on("submit", function (event) {
                    var answers = [];
                    event.preventDefault();
                    $.each(snapshot.questions, function (_, question) { var code = question.questionCode || question.code; var type = question.questionTypeCode || question.type; if (type === "SCORE") { answers.push({ questionCode: code, scaleCode: $('input[name="q-' + code + '"]:checked').val() }); } else { answers.push({ questionCode: code, textValue: $('[name="q-' + code + '"]').val() }); } });
                    C.confirmationThen({ title: "Submit Feedback", message: "Submit this private Feedback response? Submitted Feedback cannot be reopened or edited.", actionLabel: "Submit Feedback" }, function () { return VMS.App.feedbackService.SubmitOwn(assignment.ID, "FDB-" + assignment.ID, assignment._etag, answers, U.guid()); }, function () { window.location.reload(); });
                });
            }, C.fail);
        }
    };
}(window, window.jQuery));
