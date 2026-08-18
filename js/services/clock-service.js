(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function dummyTime() {
        var stored = window.sessionStorage.getItem(VMS.Config.DUMMY_CLOCK_KEY);
        return stored || VMS.Config.DUMMY_CLOCK_UTC;
    }

    VMS.ClockService = {
        utcNow: function () {
            if (VMS.Config.USE_DUMMY_DATA === true) {
                return new Date(dummyTime()).toISOString();
            }
            return new Date().toISOString();
        },
        riyadhDate: function () {
            return new Date(new Date(this.utcNow()).getTime() + (3 * 60 * 60 * 1000));
        },
        riyadhYear: function () {
            return this.riyadhDate().getUTCFullYear();
        },
        formatRiyadh: function (value, dateOnly) {
            var date = new Date(value);
            var local = new Date(date.getTime() + (3 * 60 * 60 * 1000));
            var pad = function (number) { return number < 10 ? "0" + number : String(number); };
            var result = local.getUTCFullYear() + "-" + pad(local.getUTCMonth() + 1) + "-" + pad(local.getUTCDate());
            if (dateOnly) {
                return result;
            }
            return result + " " + pad(local.getUTCHours()) + ":" + pad(local.getUTCMinutes());
        },
        setDummyTime: function (isoValue) {
            if (VMS.Config.USE_DUMMY_DATA !== true || isNaN(new Date(isoValue).getTime())) {
                return false;
            }
            window.sessionStorage.setItem(VMS.Config.DUMMY_CLOCK_KEY, new Date(isoValue).toISOString());
            return true;
        },
        resetDummyTime: function () {
            if (VMS.Config.USE_DUMMY_DATA === true) {
                window.sessionStorage.removeItem(VMS.Config.DUMMY_CLOCK_KEY);
            }
        }
    };
}(window));

