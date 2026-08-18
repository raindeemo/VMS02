(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};

    function clone(value) {
        if (value === undefined) {
            return undefined;
        }
        return JSON.parse(JSON.stringify(value));
    }

    function trim(value) {
        return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
    }

    function collapseWhitespace(value) {
        return trim(value).replace(/\s+/g, " ");
    }

    function normalizeKey(value) {
        return collapseWhitespace(value).toLowerCase();
    }

    function lookupId(value) {
        if (value === null || value === undefined) {
            return null;
        }
        return value.id !== undefined ? Number(value.id) : Number(value);
    }

    function lookupIds(values) {
        var output = [];
        var index;
        for (index = 0; index < (values || []).length; index += 1) {
            output.push(lookupId(values[index]));
        }
        return output;
    }

    function unique(values) {
        var seen = {};
        var result = [];
        var index;
        var key;
        for (index = 0; index < (values || []).length; index += 1) {
            key = String(values[index]).toLowerCase();
            if (!seen[key]) {
                seen[key] = true;
                result.push(values[index]);
            }
        }
        return result;
    }

    function guid() {
        var template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
        return template.replace(/[xy]/g, function (character) {
            var random = Math.floor(Math.random() * 16);
            var value = character === "x" ? random : (random & 3) | 8;
            return value.toString(16);
        });
    }

    function deterministicGuid(value) {
        var text = String(value || "");
        var seeds = [2166136261, 2246822519, 3266489917, 668265263];
        var output = "";
        var seedIndex;
        var index;
        var hash;
        var part;
        for (seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
            hash = seeds[seedIndex] >>> 0;
            for (index = 0; index < text.length; index += 1) {
                hash ^= text.charCodeAt(index);
                hash = Math.imul ? Math.imul(hash, 16777619) >>> 0 : ((hash * 16777619) >>> 0);
            }
            part = ("00000000" + hash.toString(16)).slice(-8);
            output += part;
        }
        output = output.substring(0, 12) + "4" + output.substring(13, 16) + "8" + output.substring(17);
        return output.substring(0, 8) + "-" + output.substring(8, 12) + "-" + output.substring(12, 16) + "-" + output.substring(16, 20) + "-" + output.substring(20, 32);
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getQueryParameter(name) {
        var query = window.location.search.replace(/^\?/, "").split("&");
        var index;
        var pair;
        for (index = 0; index < query.length; index += 1) {
            pair = query[index].split("=");
            if (decodeURIComponent(pair[0] || "") === name) {
                return decodeURIComponent((pair[1] || "").replace(/\+/g, " "));
            }
        }
        return null;
    }

    function roundHalfAwayFromZero(value, decimals) {
        var factor = Math.pow(10, decimals);
        var scaled = Number(value) * factor;
        if (scaled >= 0) {
            return Math.floor(scaled + 0.5 + 0.0000000001) / factor;
        }
        return Math.ceil(scaled - 0.5 - 0.0000000001) / factor;
    }

    VMS.Utilities = {
        clone: clone,
        trim: trim,
        collapseWhitespace: collapseWhitespace,
        normalizeKey: normalizeKey,
        lookupId: lookupId,
        lookupIds: lookupIds,
        unique: unique,
        guid: guid,
        deterministicGuid: deterministicGuid,
        escapeHtml: escapeHtml,
        getQueryParameter: getQueryParameter,
        roundHalfAwayFromZero: roundHalfAwayFromZero
    };
}(window));
