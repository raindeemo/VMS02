(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    VMS.Application = {
        start: function () {
            var routeCode = $("body").attr("data-vms-route");
            var routeContext = { tab: VMS.Utilities.getQueryParameter("tab") };
            var provider = VMS.ProviderFactory.create();
            $("#vms-app").html('<div class="vms-loading" role="status">Initializing VMS...</div>');
            provider.init().then(function () {
                var repositories = VMS.RepositoryRegistry.create(provider);
                var accessService = new VMS.AccessService(repositories, VMS.Config);
                var auditService = new VMS.AuditService(repositories, accessService);
                var destinationResolverService = new VMS.DestinationResolverService(accessService, VMS.Config);
                var notificationService = new VMS.NotificationService(repositories, accessService, VMS.Config, destinationResolverService);
                var mutationRunner = new VMS.MutationRunner(auditService, notificationService);
                var poLineService = new VMS.POLineService(repositories, accessService, mutationRunner);
                var configurationService = new VMS.ConfigurationService(repositories, accessService, mutationRunner);
                var directPaymentBatchService = new VMS.DirectPaymentBatchService(repositories, accessService, mutationRunner, poLineService);
                accessService.ConfigureMutationRunner(mutationRunner);
                VMS.App = {
                    provider: provider,
                    repositories: repositories,
                    accessService: accessService,
                    auditService: auditService,
                    notificationService: notificationService,
                    mutationRunner: mutationRunner,
                    dummyDataService: new VMS.DummyDataService(provider, accessService, VMS.Config),
                    destinationResolverService: destinationResolverService,
                    vendorService: new VMS.VendorService(repositories, accessService, mutationRunner),
                    prpoService: new VMS.PRPOService(repositories, accessService, mutationRunner),
                    poLineService: poLineService,
                    invoiceService: new VMS.InvoiceService(repositories, accessService, mutationRunner, poLineService),
                    directPaymentBatchService: directPaymentBatchService,
                    scheduledOperationsService: new VMS.ScheduledOperationsService(repositories, mutationRunner, notificationService, directPaymentBatchService, VMS.Config),
                    configurationService: configurationService,
                    countryService: new VMS.CountryService(repositories, accessService, mutationRunner),
                    cityService: new VMS.CityService(repositories, accessService, mutationRunner),
                    currencyService: new VMS.CurrencyService(repositories, accessService, mutationRunner),
                    categoryService: new VMS.CategoryService(repositories, accessService, mutationRunner),
                    feedbackService: new VMS.FeedbackService(repositories, accessService, mutationRunner, configurationService),
                    overviewService: new VMS.OverviewService(repositories, accessService, destinationResolverService),
                    pendingApprovalService: new VMS.PendingApprovalService(repositories, accessService),
                    reportService: new VMS.ReportService(repositories, accessService)
                };
                VMS.App.fileHandlingService = VMS.FileHandlingService;
                return $.when(accessService.AuthorizeRoute(routeCode, routeContext), accessService.GetAuthorizedRoutes(), accessService.GetDummyUsers());
            }).then(function (user, authorizedRoutes, dummyUsers) {
                var controller = VMS.PageControllers[routeCode];
                var title = controller ? controller.title : "VMS";
                VMS.Shell.render(user, routeCode, title, authorizedRoutes, dummyUsers);
                if (!controller) { throw { code: VMS.Constants.ERRORS.INVALID_LINK, safeMessage: "The requested VMS route is unavailable." }; }
                controller.run(user);
            }, function (error) {
                $("#vms-app").html('<main class="vms-content"><section class="vms-panel" role="alert"><h1 class="vms-page-title">Access unavailable</h1><p>' + VMS.Utilities.escapeHtml(error && error.safeMessage ? error.safeMessage : "VMS could not be initialized.") + '</p></section></main>');
            });
        }
    };
}(window, window.jQuery));
