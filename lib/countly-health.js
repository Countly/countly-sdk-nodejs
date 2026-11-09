/**
 * SDK health check counters: what the health check reports about the SDK's own work. These are the error and
 * warning log counts, the last queued request the server refused, the backoff counts, how often the methods of
 * the session, event, view and crash features were called (method usage) and how often each known problem
 * occurred (log codes). Nothing here logs at warning or error level, because such a log is counted here again.
 * @module lib/countly-health
 */

/**
 * Highest value a method usage or log code count reaches until it is reported
 */
var COUNT_CAP = 65535;

/**
 * Feature areas of the method usage. Each follows the consent of the same name.
 */
var AREAS = ["sessions", "events", "views", "crashes"];

/**
 * Tells whether a value is a plain object (not null, not an array)
 * @param {*} value - value to check
 * @returns {Boolean} true for a plain object
 */
function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * Tells whether a value can be used as a stored count
 * @param {*} value - value to check
 * @returns {Boolean} true for a finite number of at least 0
 */
function isCount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Adds an amount to one count of a map, up to the cap
 * @param {Object} map - counts by name
 * @param {String} name - name of the count
 * @param {Number} amount - amount to add
 */
function addCount(map, name, amount) {
    map[name] = Math.min((map[name] || 0) + amount, COUNT_CAP);
}

/**
 * Takes reported amounts away from the counts of a map. A count that reaches 0 is removed.
 * @param {Object} map - counts by name
 * @param {Object} sent - the reported counts by name
 */
function subtractCounts(map, sent) {
    Object.keys(sent).forEach((name) => {
        var left = (map[name] || 0) - sent[name];
        if (left > 0) {
            map[name] = left;
        }
        else {
            delete map[name];
        }
    });
}

/**
 * Adds the usable counts of a stored map to a map. An entry of the wrong type is skipped.
 * @param {Object} map - counts by name
 * @param {*} stored - stored counts by name
 */
function addStoredCounts(map, stored) {
    if (!isPlainObject(stored)) {
        return;
    }
    Object.keys(stored).forEach((name) => {
        if (isCount(stored[name]) && stored[name] > 0) {
            addCount(map, name, Math.floor(stored[name]));
        }
    });
}

/**
 * Creates the health check counters of an SDK start
 * @param {Function} hasConsent - called with a feature area, returns true while the area may be counted
 * @returns {Object} the counters
 */
function create(hasConsent) {
    var state = { el: 0, wl: 0, sc: -1, em: "", bom: 0, cbom: 0, fu: {}, lc: {} };
    var backoffRun = 0;
    var stopped = false;
    var changed = false;

    /**
     * Tells whether a feature area may be counted now
     * @param {String} area - feature area
     * @returns {Boolean} true when the area has consent, or consent is not required
     */
    function allowed(area) {
        return typeof hasConsent !== "function" || !!hasConsent(area);
    }

    /**
     * Adds 1 to the count of a log code
     * @param {String} code - log code
     */
    function addLogCode(code) {
        addCount(state.lc, code, 1);
        changed = true;
    }

    return {
        /**
         * Counts a warning log line
         */
        logWarning: function() {
            state.wl++;
            changed = true;
        },

        /**
         * Counts an error log line
         */
        logError: function() {
            state.el++;
            changed = true;
        },

        /**
         * Keeps the status code and the answer of the last queued request the server answered with a failure.
         * A request that got no answer has no status code and changes nothing.
         * @param {Number} statusCode - HTTP status code
         * @param {*} responseText - the answer body
         */
        logFailedNetworkRequest: function(statusCode, responseText) {
            if (!(statusCode > 0 && statusCode < 1000)) {
                return;
            }
            var text = typeof responseText === "string" ? responseText : String(responseText === null || typeof responseText === "undefined" ? "" : responseText);
            state.sc = statusCode;
            state.em = text.length > 1000 ? text.substring(0, 1000) : text;
            changed = true;
        },

        /**
         * Counts a backoff and extends the current run of backoffs in a row. The longest run is raised right away,
         * so no save has to end the run to keep it. Records log code w320, and w321 when the backoff continues a run.
         */
        logBackoffRequest: function() {
            var continuesRun = backoffRun > 0;
            state.bom++;
            backoffRun++;
            state.cbom = Math.max(state.cbom, backoffRun);
            changed = true;
            if (stopped) {
                return;
            }
            addLogCode("w320");
            if (continuesRun) {
                addLogCode("w321");
            }
        },

        /**
         * Ends the current run of backoffs, after a queued request was answered without a backoff
         */
        logConsecutiveBackoffRequest: function() {
            backoffRun = 0;
        },

        /**
         * Counts a call of a method of the session, event, view or crash feature. Nothing is counted while the
         * feature has no consent, or while an automatically detected crash is being reported.
         * @param {String} area - "sessions", "events", "views" or "crashes"
         * @param {String} method - method name, with ":a" for a call the SDK made by itself
         */
        recordUsage: function(area, method) {
            if (stopped || !area || !method || AREAS.indexOf(area) === -1 || !allowed(area)) {
                return;
            }
            var methods = state.fu[area] || (state.fu[area] = {});
            addCount(methods, method, 1);
            changed = true;
        },

        /**
         * Counts a known problem. A code that a method of a feature area records is counted only while that feature
         * has consent. Nothing is counted while an automatically detected crash is being reported.
         * @param {String} code - log code, a level letter and three digits
         * @param {String=} area - feature area of the method that records it
         */
        recordLogCode: function(code, area) {
            if (stopped || !code || (AREAS.indexOf(area) !== -1 && !allowed(area))) {
                return;
            }
            addLogCode(code);
        },

        /**
         * Stops counting method usage and log codes, while an automatically detected crash is being reported
         */
        stopRecording: function() {
            stopped = true;
        },

        /**
         * Counts method usage and log codes again
         */
        resumeRecording: function() {
            stopped = false;
        },

        /**
         * Adds the automatically detected crashes an earlier run reported to the method usage. They were reported
         * with the crash consent, so they are added whatever the consent state is now.
         * @param {Number} count - number of crashes
         */
        addAutomaticCrashes: function(count) {
            if (!isCount(count) || count < 1) {
                return;
            }
            var methods = state.fu.crashes || (state.fu.crashes = {});
            addCount(methods, "record:a", Math.floor(count));
            changed = true;
        },

        /**
         * Adds a stored state to the counters, so that what was counted before the state could be read is kept.
         * Counts are added, the last failed request is taken from the stored state, and an entry of the wrong type
         * is skipped.
         * @param {*} stored - the stored state, null or undefined when nothing is stored
         * @returns {Boolean} false when a stored state exists but is not an object, so it can not be used
         */
        addStored: function(stored) {
            if (stored === null || typeof stored === "undefined") {
                return true;
            }
            if (!isPlainObject(stored)) {
                return false;
            }
            var counted = state.el > 0 || state.wl > 0 || Object.keys(state.fu).length > 0 || Object.keys(state.lc).length > 0;
            if (isCount(stored.el)) {
                state.el += Math.floor(stored.el);
            }
            if (isCount(stored.wl)) {
                state.wl += Math.floor(stored.wl);
            }
            if (typeof stored.sc === "number" && Number.isFinite(stored.sc)) {
                state.sc = stored.sc;
            }
            if (typeof stored.em === "string") {
                state.em = stored.em;
            }
            if (isCount(stored.bom)) {
                state.bom += Math.floor(stored.bom);
            }
            if (isCount(stored.cbom)) {
                state.cbom = Math.max(state.cbom, Math.floor(stored.cbom));
            }
            if (isPlainObject(stored.fu)) {
                Object.keys(stored.fu).forEach((area) => {
                    if (AREAS.indexOf(area) === -1 || !isPlainObject(stored.fu[area])) {
                        return;
                    }
                    var methods = state.fu[area] || {};
                    addStoredCounts(methods, stored.fu[area]);
                    if (Object.keys(methods).length > 0) {
                        state.fu[area] = methods;
                    }
                });
            }
            addStoredCounts(state.lc, stored.lc);
            if (counted) {
                changed = true;
            }
            return true;
        },

        /**
         * The counters as the health check reports them, and as they are stored
         * @returns {Object} a copy of the counters
         */
        snapshot: function() {
            var fu = {};
            Object.keys(state.fu).forEach((area) => {
                fu[area] = { ...state.fu[area] };
            });
            return { el: state.el, wl: state.wl, sc: state.sc, em: state.em, bom: state.bom, cbom: state.cbom, fu: fu, lc: { ...state.lc } };
        },

        /**
         * Takes away what a health check the server accepted reported, so that what was counted while it was on
         * its way is reported next time. The last failed request and the longest run of backoffs are cleared only
         * while they still hold the reported values.
         * @param {Object} sent - the snapshot the delivered health check was built from
         */
        clearSentValues: function(sent) {
            state.el = Math.max(0, state.el - sent.el);
            state.wl = Math.max(0, state.wl - sent.wl);
            state.bom = Math.max(0, state.bom - sent.bom);
            if (state.cbom === sent.cbom) {
                state.cbom = 0;
            }
            if (state.sc === sent.sc && state.em === sent.em) {
                state.sc = -1;
                state.em = "";
            }
            Object.keys(sent.fu).forEach((area) => {
                if (!state.fu[area]) {
                    return;
                }
                subtractCounts(state.fu[area], sent.fu[area]);
                if (Object.keys(state.fu[area]).length === 0) {
                    delete state.fu[area];
                }
            });
            subtractCounts(state.lc, sent.lc);
            changed = true;
        },

        /**
         * Tells whether the counters changed since they were last stored
         * @returns {Boolean} true when they changed
         */
        hasChanges: function() {
            return changed;
        },

        /**
         * Notes that the current counters were handed to the storage
         */
        markStored: function() {
            changed = false;
        },
    };
}

module.exports = {
    COUNT_CAP,
    AREAS,
    create,
};
