(function (window, $) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function DummyDataService(provider, accessService, config) {
        this.provider = provider;
        this.accessService = accessService;
        this.config = config;
    }

    DummyDataService.prototype.Reset = function () {
        var self = this;
        if (this.config.USE_DUMMY_DATA !== true || !this.provider || typeof this.provider.reset !== "function") {
            return $.Deferred().reject({ code: VMS.Constants.ERRORS.ACCESS_DENIED, safeMessage: "Dummy Data reset is unavailable." }).promise();
        }
        return this.accessService.ResolveCurrentUser().then(function () {
            return self.provider.reset();
        });
    };

    VMS.DummyDataService = DummyDataService;
}(window, window.jQuery));
