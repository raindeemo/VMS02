(function (VMS, $) {
    'use strict';
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function normalized(value) { return $.trim(String(value || '')).toLowerCase(); }
    function envelope(ok, code, message, data) {
        return { ok: ok, code: code, message: message || '', data: data === undefined ? null : data,
            fieldErrors: [], stale: code === 'STALE_RECORD', actionRequestId: null, destination: null, warnings: [] };
    }
    function success(data, message) { return envelope(true, 'SUCCESS', message || '', data); }
    function failure(code, message, errors) { var result = envelope(false, code, message, null); result.fieldErrors = errors || []; return result; }
    function resolved(value) { var d = $.Deferred(); d.resolve(value); return d.promise(); }
    function rejected(value) { var d = $.Deferred(); d.reject(value); return d.promise(); }
    function guid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
    function safeText(value) { return $('<div>').text(value === null || value === undefined ? '' : String(value)).html(); }
    function roundHalfAway(value, decimals) { var factor = Math.pow(10, decimals); var scaled = Number(value) * factor; return (scaled < 0 ? -Math.round(Math.abs(scaled)) : Math.round(scaled)) / factor; }
    function positiveId(value) { var id = parseInt(value, 10); return isFinite(id) && id > 0 ? id : null; }
    function lookupId(value) { return VMS.SharePointSchema ? VMS.SharePointSchema.lookupId(value) : Number(value); }
    function lookupIds(values) { return VMS.SharePointSchema ? VMS.SharePointSchema.lookupIds(values) : $.map(values || [], Number); }
    function lookupCode(value) { return VMS.SharePointSchema ? VMS.SharePointSchema.lookupCode(value) : null; }
    function lookupLabel(value) { return VMS.SharePointSchema ? VMS.SharePointSchema.lookupLabel(value) : null; }
    function personId(value) { return VMS.SharePointSchema ? VMS.SharePointSchema.personId(value) : null; }
    function personEmail(value) { return VMS.SharePointSchema ? VMS.SharePointSchema.personEmail(value) : normalized(value); }
    function humanizeCode(value) { return $.trim(String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ')).toLowerCase().replace(/(^|\s)\S/g, function (letter) { return letter.toUpperCase(); }); }
    function formatDateTime(value) {
        if (!value) { return ''; }
        var date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) { return String(value); }
        try { return new Intl.DateTimeFormat('en-GB', { timeZone: VMS.Constants.TIMEZONE, day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(date); }
        catch (ignore) { return date.toLocaleString('en-GB'); }
    }
    function formatRegisterDate(value) {
        if (!value) { return ''; }
        var date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) { return String(value); }
        try { return new Intl.DateTimeFormat('en-GB', { timeZone: VMS.Constants.TIMEZONE, day: '2-digit', month: 'short' }).format(date); }
        catch (ignore) { return String(('0' + date.getDate()).slice(-2)) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]; }
    }
    VMS.Utilities = { clone: clone, normalize: normalized, envelope: envelope, success: success, failure: failure,
        resolved: resolved, rejected: rejected, guid: guid, safeText: safeText, roundHalfAway: roundHalfAway, positiveId: positiveId,
        humanizeCode: humanizeCode, formatDateTime: formatDateTime, formatRegisterDate: formatRegisterDate,
        lookupId: lookupId, lookupIds: lookupIds, lookupCode: lookupCode, lookupLabel: lookupLabel, personId: personId, personEmail: personEmail };
}(window.VMS, window.jQuery));
