(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function envelope(ok, code, message, data, options) {
        var value = options || {};
        return {
            ok: ok,
            code: code,
            message: message || "",
            data: data === undefined ? null : data,
            fieldErrors: value.fieldErrors || [],
            stale: value.stale === true,
            actionRequestId: value.actionRequestId || null,
            destination: value.destination || null,
            warnings: value.warnings || []
        };
    }

    VMS.Response = {
        success: function (code, message, data, options) {
            return envelope(true, code || "SUCCESS", message, data, options);
        },
        failure: function (code, message, options) {
            return envelope(false, code, message, null, options);
        },
        fromProviderError: function (error) {
            var code = error && error.code ? error.code : VMS.Constants.ERRORS.SERVICE_UNAVAILABLE;
            var message = error && error.safeMessage ? error.safeMessage : "The requested service is temporarily unavailable.";
            return envelope(false, code, message, null, {
                stale: code === VMS.Constants.ERRORS.STALE_RECORD,
                fieldErrors: error && error.fieldErrors ? error.fieldErrors : []
            });
        }
    };
}(window));

