(function (VMS, $, window) {
    'use strict';
    function safeFailure(code, message) { return VMS.Utilities.failure(code, message); }
    function status(error) { return Number(error && (error.status || error.statusCode || error.httpStatus) || 0); }
    function normalize(error, mutation) {
        var code = status(error), text = String(error && (error.message || error.statusText || error.error || '') || '').toLowerCase();
        if (code === 401) { return safeFailure('ACCESS_DENIED', 'SharePoint authentication is required.'); }
        if (code === 403) { return safeFailure('ACCESS_DENIED', 'The SharePoint operation is not permitted.'); }
        if (code === 404) { return safeFailure('NOT_FOUND', 'The SharePoint resource was not found.'); }
        if (code === 409 || text.indexOf('duplicate') >= 0 || text.indexOf('unique') >= 0) { return safeFailure('DUPLICATE_KEY', 'A record with the same unique value already exists.'); }
        if (code === 412) { return safeFailure('STALE_RECORD', 'The record changed. Refresh and try again.'); }
        if (mutation && (code === 0 || code === 429 || code === 503 || text.indexOf('timeout') >= 0)) { return safeFailure('ACTION_OUTCOME_UNCERTAIN', 'The submitted outcome is uncertain and will not be retried automatically.'); }
        if (code === 429 || code === 503 || code === 0) { return safeFailure('SERVICE_UNAVAILABLE', 'The SharePoint service is temporarily unavailable.'); }
        return safeFailure('SERVICE_UNAVAILABLE', 'The SharePoint operation could not be completed.');
    }
    function webUrl(options) { return (options && options.siteUrl) || (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) || null; }
    function digest(siteUrl) {
        var existing = $('#__REQUESTDIGEST').val();
        if (existing) { return VMS.Utilities.resolved(existing); }
        return $.ajax({ url: siteUrl + '/_api/contextinfo', method: 'POST', headers: { Accept: 'application/json;odata=verbose' } }).then(function (data) { return data.d.GetContextWebInformation.FormDigestValue; }, function (error) { return normalize(error, false); });
    }
    function opaqueEncode(value) { try { return window.btoa(unescape(encodeURIComponent(JSON.stringify(value)))); } catch (ignore) { return null; } }
    function opaqueDecode(value) { if (!value) { return null; } try { return JSON.parse(decodeURIComponent(escape(window.atob(value)))); } catch (ignore) { return null; } }
    VMS.SharePointIntegration = { normalizeError: normalize, webUrl: webUrl, digest: digest, opaqueEncode: opaqueEncode, opaqueDecode: opaqueDecode };
}(window.VMS, window.jQuery, window));
