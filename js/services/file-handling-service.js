(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    VMS.FileHandlingService = {
        fromInput: function (input) {
            var files = input && input.files ? input.files : [];
            var output = [];
            var index;
            for (index = 0; index < files.length; index += 1) {
                output.push({ name: files[index].name, sizeBytes: files[index].size, type: files[index].type, sourceFile: VMS.Config.USE_DUMMY_DATA === true ? null : files[index] });
            }
            return output;
        },
        attachmentField: function (name, label, required, accept) {
            return '<div class="form-group"><label class="vms-form-label" for="vms-field-' + VMS.Utilities.escapeHtml(name) + '">' + VMS.Utilities.escapeHtml(label) + (required ? ' <span class="vms-required" aria-hidden="true">*</span>' : '') + '</label><input class="form-control-file" id="vms-field-' + VMS.Utilities.escapeHtml(name) + '" name="' + VMS.Utilities.escapeHtml(name) + '" type="file" multiple accept="' + VMS.Utilities.escapeHtml(accept) + '"' + (required ? ' required aria-required="true"' : '') + '><small class="form-text text-muted">Each file must be no larger than 10 MB.</small></div>';
        }
    };
}(window));
