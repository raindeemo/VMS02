(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function error(field, code, message) {
        return { field: field, code: code, message: message };
    }

    VMS.ValidationService = {
        required: function (value, field, label, errors) {
            if (VMS.Utilities.trim(value) === "") {
                errors.push(error(field, "REQUIRED", label + " is required."));
                return false;
            }
            return true;
        },
        email: function (value) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(VMS.Utilities.trim(value));
        },
        emailList: function (value, field, errors) {
            var parts = String(value || "").split(";");
            var output = [];
            var seen = {};
            var index;
            var item;
            if (!value || !parts.length) {
                errors.push(error(field, "REQUIRED", "At least one vendor email address is required."));
                return null;
            }
            for (index = 0; index < parts.length; index += 1) {
                item = VMS.Utilities.trim(parts[index]);
                if (!item || !this.email(item)) {
                    errors.push(error(field, "INVALID_EMAIL", "Enter valid email addresses separated by semicolons."));
                    return null;
                }
                if (!seen[item.toLowerCase()]) {
                    seen[item.toLowerCase()] = true;
                    output.push(item);
                }
            }
            return output.join(";");
        },
        phone: function (value, phoneCode, field, errors) {
            var digits = String(value || "").replace(/[^0-9+]/g, "");
            if (digits.charAt(0) !== "+") {
                digits = "+" + digits.replace(/\+/g, "");
            }
            if (!/^\+[0-9]{7,15}$/.test(digits) || digits.indexOf(phoneCode) !== 0) {
                errors.push(error(field, "INVALID_PHONE", "Enter a phone number beginning with the selected country code."));
                return null;
            }
            return digits;
        },
        httpsUrl: function (value) {
            return /^https:\/\/[^\s]+$/i.test(VMS.Utilities.trim(value));
        },
        positiveMoney: function (value, field, label, errors) {
            var number = Number(value);
            if (!isFinite(number) || number <= 0) {
                errors.push(error(field, "INVALID_AMOUNT", label + " must be greater than zero."));
                return null;
            }
            return VMS.Utilities.roundHalfAwayFromZero(number, 2);
        },
        wholeNumber: function (value, field, label, errors, allowZero) {
            var number = Number(value);
            if (!isFinite(number) || Math.floor(number) !== number || (allowZero ? number < 0 : number <= 0)) {
                errors.push(error(field, "INVALID_WHOLE_NUMBER", label + " must be a valid whole number."));
                return null;
            }
            return number;
        },
        attachments: function (files, allowed, required, field, errors) {
            var list = files || [];
            var index;
            var extension;
            var name;
            if (required && !list.length) {
                errors.push(error(field, "ATTACHMENT_REQUIRED", "At least one attachment is required."));
                return false;
            }
            for (index = 0; index < list.length; index += 1) {
                name = VMS.Utilities.trim(list[index].name);
                extension = name.indexOf(".") >= 0 ? name.split(".").pop().toLowerCase() : "";
                if (window.jQuery.inArray(extension, allowed) < 0 || Number(list[index].sizeBytes) > 10485760 || /[\\/:*?"<>|\x00-\x1f]/.test(name)) {
                    errors.push(error(field, "ATTACHMENT_INVALID", "Each attachment must use an approved file type, safe name, and be no larger than 10 MB."));
                    return false;
                }
            }
            return true;
        },
        error: error
    };
}(window));
