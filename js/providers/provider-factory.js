(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    VMS.ProviderFactory = {
        create: function () {
            var provider;
            if (VMS.Config.USE_DUMMY_DATA === true) {
                return new VMS.DummyDataProvider(VMS.Config);
            }
            provider = new VMS.SharePointDataProvider(VMS.Config);
            provider.configure(window.VMSSharePointIntegration || null);
            return provider;
        }
    };
}(window));
