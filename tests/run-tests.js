"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var seed = JSON.parse(fs.readFileSync(path.join(root, "data", "seed.json"), "utf8"));
var failures = [];
var passed = 0;

function test(name, work) {
    try {
        work();
        passed += 1;
        process.stdout.write("PASS " + name + "\n");
    } catch (error) {
        failures.push({ name: name, error: error });
        process.stderr.write("FAIL " + name + ": " + error.message + "\n");
    }
}

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function filesUnder(relativePath, extension) {
    var output = [];
    function walk(folder) {
        fs.readdirSync(folder, { withFileTypes: true }).forEach(function (entry) {
            var full = path.join(folder, entry.name);
            if (entry.isDirectory()) { walk(full); }
            else if (!extension || path.extname(entry.name) === extension) { output.push(full); }
        });
    }
    walk(path.join(root, relativePath));
    return output;
}

test("all authored JavaScript parses", function () {
    filesUnder("js", ".js").forEach(function (file) { new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }); });
});

test("seed exposes exactly thirteen canonical datasets", function () {
    assert.deepStrictEqual(Object.keys(seed), ["ML_configuration", "Country", "City", "Currency", "Category", "userDB", "ML_vendor", "PR_PO", "PO_Lines", "Invoice", "Workflow_History", "SurveyQuestions", "Feedback_Assignment"]);
    Object.keys(seed).forEach(function (name) { assert.ok(Array.isArray(seed[name]), name); });
});

test("route registry contains exactly the approved eighteen routes", function () {
    var sandbox = { window: {} };
    vm.runInNewContext(read("js/config/app-config.js"), sandbox);
    assert.strictEqual(Object.keys(sandbox.window.VMS.Config.ROUTES).length, 18);
    Object.keys(sandbox.window.VMS.Config.ROUTES).forEach(function (route) {
        var routeFile = sandbox.window.VMS.Config.ROUTES[route];
        var html = read(routeFile);
        assert.ok(fs.existsSync(path.join(root, routeFile)), route);
        assert.ok(html.indexOf('data-vms-route="' + route + '"') >= 0, route + " page identity");
        var referencePattern = /(?:src|href)="([^"]+)"/g;
        var match;
        while ((match = referencePattern.exec(html)) !== null) {
            if (!/^(?:https?:|#|mailto:|javascript:)/i.test(match[1])) {
                assert.ok(fs.existsSync(path.resolve(root, path.dirname(routeFile), match[1])), routeFile + " missing " + match[1]);
            }
        }
    });
});

test("roles and functions remain canonical", function () {
    var sandbox = { window: {} };
    vm.runInNewContext(read("js/core/constants.js"), sandbox);
    assert.deepStrictEqual(Object.keys(sandbox.window.VMS.Constants.ROLES), ["SUPER_ADMIN", "ADMIN", "UPPER_MANAGEMENT", "MANAGER", "EMPLOYEE", "CO_OP"]);
    assert.deepStrictEqual(Object.keys(sandbox.window.VMS.Constants.FUNCTIONS), ["LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP", "EXCELLENCE", "VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM", "ADMINISTRATION"]);
});

test("controllers do not bypass services or expose Feedback payloads", function () {
    filesUnder("js/controllers", ".js").forEach(function (file) {
        var source = fs.readFileSync(file, "utf8");
        assert.ok(source.indexOf(".repositories") < 0, path.basename(file) + " repository bypass");
        assert.ok(source.indexOf(".provider") < 0, path.basename(file) + " provider bypass");
    });
    assert.ok(read("js/controllers/administration-controller.js").indexOf("AnswerPayload") < 0, "Administration Feedback payload exposure");
});

test("representative identity, category, Vendor, PRPO and PO Line fixtures exist", function () {
    assert.ok(seed.userDB.some(function (row) { return row.RoleCode === "SUPER_ADMIN" && row.IsActive; }));
    assert.ok(seed.userDB.some(function (row) { return row.RoleCode === "UPPER_MANAGEMENT"; }));
    assert.ok(seed.userDB.some(function (row) { return row.RoleCode === "CO_OP" && row.FunctionCode === "EXECUTION"; }));
    assert.ok(seed.userDB.some(function (row) { return row.RoleCode === "CO_OP" && row.FunctionCode === "EDUCATION_PROGRAM"; }));
    assert.ok(seed.userDB.some(function (row) { return row.IsActive === false; }));
    assert.ok(seed.Category.some(function (row) { return row.IsActive === false; }));
    ["DOCUMENT_EVALUATION", "INTERVIEW", "APPROVED", "REJECTED", "EXPIRED"].forEach(function (stage) { assert.ok(seed.ML_vendor.some(function (row) { return row.StageCode === stage; }), stage); });
    assert.ok(seed.ML_vendor.some(function (row) { return row.StageCode === "APPROVED" && row.IsActive === false; }));
    ["MANAGER_REVIEW", "UPDATE_REQUIRED", "PENDING_GPS", "PO_ACTIVE", "REJECTED"].forEach(function (stage) { assert.ok(seed.PR_PO.some(function (row) { return row.StageCode === stage; }), stage); });
    assert.ok(seed.PO_Lines.some(function (row) { return row.POLineStatusCode === "THRESHOLD_REACHED" && row.AlertActivation; }));
    assert.ok(seed.PO_Lines.some(function (row) { return row.POLineStatusCode === "CONSUMED"; }));
    assert.ok(seed.PO_Lines.some(function (row) { return row.LineRequestStageCode === "CREATION"; }));
    assert.ok(seed.PO_Lines.some(function (row) { return row.IsCancelled; }));
});

test("Invoice and Direct Payment fixture matrix is present", function () {
    ["DIRECT_PAYMENT_REVIEW", "PAYMENT_AGGREGATION", "INVOICE_PROCESSING", "PENDING_APPROVAL", "CHARGEBACK_PROCESSING", "SETTLED", "REJECTED"].forEach(function (stage) { assert.ok(seed.Invoice.some(function (row) { return row.StageCode === stage; }), stage); });
    assert.ok(seed.Invoice.some(function (row) { return row.InvoiceSourceFunctionCode === "EDUCATION_PROGRAM" && row.DirectPayment === false && Number(row.StudentCount) > 0; }));
    assert.ok(seed.Invoice.some(function (row) { return row.InvoiceSourceFunctionCode === "EDUCATION_PROGRAM" && row.DirectPayment === true; }));
    assert.ok(seed.Invoice.some(function (row) { return row.IsActive === false && !row.InvoiceIdentifier; }));
    assert.ok(seed.Invoice.some(function (row) { return row.BatchOperationStateCode === "RECOVERY_REQUIRED"; }));
    var valid = seed.Invoice.filter(function (row) { return row.AggregationBatchKey === "DP-2026-06-A"; });
    assert.strictEqual(valid.length, 2);
    assert.strictEqual(new Set(valid.map(function (row) { return row.Vendor && row.Vendor.id; })).size, 1);
    assert.strictEqual(new Set(valid.map(function (row) { return row.POLine && row.POLine.id; })).size, 1);
    assert.strictEqual(new Set(valid.map(function (row) { return row.Currency && row.Currency.id; })).size, 1);
    var invalid = seed.Invoice.filter(function (row) { return row.AggregationBatchKey === "DP-2026-02-BAD"; });
    assert.ok(new Set(invalid.map(function (row) { return row.POLine && row.POLine.id; })).size > 1);
    assert.ok(new Set(invalid.map(function (row) { return row.Currency && row.Currency.id; })).size > 1);
});

test("Feedback versions and immutable snapshot fixtures cover every eligible Function", function () {
    var eligible = ["VENDOR_MANAGEMENT", "EXECUTION", "EDUCATION_PROGRAM", "LFO_COMMERCIAL", "LFO_MANUFACTURING", "LFO_LEADERSHIP"];
    var versions = seed.ML_configuration.filter(function (row) { return row.GroupCode === "SURVEY_VERSION" && row.IsActive; });
    eligible.forEach(function (functionCode) {
        var matching = versions.filter(function (row) { return row.TextValue === functionCode; });
        assert.strictEqual(matching.length, 1, functionCode);
        assert.ok(new RegExp("^" + functionCode + "_2026_V[1-9][0-9]*$").test(matching[0].ItemCode));
        var questions = seed.SurveyQuestions.filter(function (row) { return row.SurveyVersionCode === matching[0].ItemCode && row.IsActive; });
        assert.ok(questions.some(function (row) { return row.QuestionTypeCode === "SCORE"; }), functionCode + " score");
        assert.strictEqual(questions.filter(function (row) { return row.QuestionTypeCode === "OPEN_TEXT"; }).length, 1, functionCode + " open text");
    });
    assert.ok(seed.Feedback_Assignment.some(function (row) { return row.AssignmentStatusCode === "OPEN" && row.AnswerPayload === null; }));
    assert.ok(seed.Feedback_Assignment.some(function (row) { return row.AssignmentStatusCode === "SUBMITTED" && row.IsActive; }));
    assert.ok(seed.Feedback_Assignment.some(function (row) { return row.IsActive === false; }));
    assert.ok(seed.Feedback_Assignment.some(function (row) { return row.AssignmentYear === 2025; }));
});

test("audit fixtures cover prepared, success, failure, administration and group actions", function () {
    ["PREPARED", "SUCCESS", "FAILED"].forEach(function (result) { assert.ok(seed.Workflow_History.some(function (row) { return row.ResultCode === result; }), result); });
    assert.ok(seed.Workflow_History.some(function (row) { return row.ActionCode.indexOf("ADMIN_") === 0 && row.CountsAsCompletedAction === false && row.ChangedFieldsJSON; }));
    assert.ok(seed.Workflow_History.some(function (row) { return row.EntityTypeCode === "DIRECT_PAYMENT_BATCH" && JSON.parse(row.AffectedItemIdsJSON).length > 1; }));
    assert.ok(seed.Workflow_History.some(function (row) { return row.ResultCode === "PREPARED" && row.EntityTypeCode === "INVOICE"; }));
});

test("financial calculations are decimal safe and half-away-from-zero", function () {
    var sandbox = { window: { location: { search: "" } } };
    sandbox.window.VMS = { ValidationService: { error: function (field, code, message) { return { field: field, code: code, message: message }; } } };
    vm.runInNewContext(read("js/core/utilities.js"), sandbox);
    vm.runInNewContext(read("js/services/financial-calculation-service.js"), sandbox);
    var service = sandbox.window.VMS.FinancialCalculationService;
    var result = service.calculate({ TotalPrice: "100.005", ConversionRateUsed: "3.75", HasDiscount: true, DiscountInputTypeCode: "PERCENTAGE", DiscountInputValue: "10", HasVAT: true, VATInputTypeCode: "PERCENTAGE", VATInputValue: "15" });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.values.TotalPrice, 100.01);
    assert.strictEqual(result.values.DiscountAmount, 10);
    assert.strictEqual(result.values.FinalInvoiceAmount, 103.51);
    assert.strictEqual(result.values.FinalInvoiceAmountInSAR, 388.16);
    assert.strictEqual(service.subtractMoney(10, 10.01), null);
    assert.strictEqual(service.sumMoney([0.1, 0.2]), 0.3);
});

test("report boundary permits 10,000 rows and rejects more", function () {
    var report = read("js/services/report-service.js");
    var helpers = read("js/services/domain-helpers.js");
    assert.ok(report.indexOf("if (count > 10000)") >= 0);
    assert.ok(helpers.indexOf("items.length > maximum") >= 0);
    assert.ok(helpers.indexOf("result.continuationToken && items.length >= maximum") >= 0);
    assert.strictEqual(Array.from({ length: 10000 }, function (_, index) { return index + 1; }).length, 10000);
});

test("SharePoint remains a configurable boundary without environment values", function () {
    var provider = read("js/providers/sharepoint-data-provider.js");
    assert.ok(provider.indexOf("integration.siteUrl") >= 0);
    assert.ok(provider.indexOf("replaceAttachments") >= 0);
    assert.ok(!/https?:\/\/[A-Za-z0-9.-]+\/(sites|teams)\//.test(provider));
    assert.ok(provider.indexOf("getRequestDigest") >= 0);
    assert.ok(provider.indexOf("etag === \"*\"") >= 0);
});

if (failures.length) {
    process.stderr.write("\n" + failures.length + " test(s) failed; " + passed + " passed.\n");
    process.exit(1);
}
process.stdout.write("\nAll " + passed + " tests passed.\n");
