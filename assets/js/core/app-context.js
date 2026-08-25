(function (VMS) {
    'use strict';
    var provider;
    VMS.AppContext = {
        initialize: function () {
            provider = VMS.Constants.USE_DUMMY_DATA ? new VMS.Providers.DummyDataProvider() : new VMS.Providers.SharePointDataProvider();
            return provider.initialize().then(function (result) {
                if (result && result.ok && VMS.Repositories.initialize) { VMS.Repositories.initialize(); }
                return result;
            });
        },
        getProvider: function () { if (!provider) { throw new Error('VMS provider is not initialized.'); } return provider; }
    };
}(window.VMS));
