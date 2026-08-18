(function (window, document) {
    "use strict";

    var files = [
        "js/config/app-config.js",
        "js/core/constants.js",
        "js/core/response.js",
        "js/core/utilities.js",
        "js/providers/dummy-data-provider.js",
        "js/providers/sharepoint-data-provider.js",
        "js/providers/provider-factory.js",
        "js/repositories/repository-registry.js",
        "js/services/clock-service.js",
        "js/services/validation-service.js",
        "js/services/financial-calculation-service.js",
        "js/services/domain-helpers.js",
        "js/services/access-service.js",
        "js/services/audit-service.js",
        "js/services/notification-service.js",
        "js/services/mutation-runner.js",
        "js/services/destination-resolver-service.js",
        "js/services/file-handling-service.js",
        "js/services/dummy-data-service.js",
        "js/services/vendor-service.js",
        "js/services/prpo-service.js",
        "js/services/po-line-service.js",
        "js/services/invoice-service.js",
        "js/services/direct-payment-batch-service.js",
        "js/services/scheduled-operations-service.js",
        "js/services/administration-services.js",
        "js/services/feedback-service.js",
        "js/services/overview-service.js",
        "js/services/pending-approval-service.js",
        "js/services/report-service.js",
        "js/ui/components.js",
        "js/ui/shell.js",
        "js/controllers/common.js",
        "js/controllers/overview-vendor-controllers.js",
        "js/controllers/prpo-controllers.js",
        "js/controllers/invoice-controllers.js",
        "js/controllers/direct-payment-controllers.js",
        "js/controllers/feedback-controllers.js",
        "js/controllers/report-controller.js",
        "js/controllers/pending-approval-controller.js",
        "js/controllers/administration-controller.js",
        "js/app/application-context.js"
    ];
    var index = 0;

    function next() {
        var script;
        if (index >= files.length) {
            window.VMS.Application.start();
            return;
        }
        script = document.createElement("script");
        script.src = files[index];
        script.onload = function () { index += 1; next(); };
        script.onerror = function () { document.getElementById("vms-app").innerHTML = '<main class="vms-content"><section class="vms-panel" role="alert"><h1>Initialization failed</h1><p>A required local VMS module could not be loaded.</p></section></main>'; };
        document.body.appendChild(script);
    }

    next();
}(window, document));
