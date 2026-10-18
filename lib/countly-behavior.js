/**
 * SDK behavior settings: checks the settings the server sends (from SDK Manager) or the developer provides,
 * and decides the value of each setting the SDK uses.
 * @module lib/countly-behavior
 */

/**
 * Settings the Node.js SDK follows, with the kind of value each one takes:
 * "switch" true or false; "count" a whole number of at least 1; "zeroOrMore" a whole number of at least 0;
 * "fraction" a number above 0 and at most 1
 */
var SUPPORTED = {
    tracking: "switch",
    networking: "switch",
    st: "switch",
    vt: "switch",
    cet: "switch",
    crt: "switch",
    lt: "switch",
    cr: "switch",
    bom: "switch",
    rqs: "count",
    eqs: "count",
    sui: "count",
    lkl: "count",
    lvs: "count",
    lsv: "count",
    lbc: "count",
    ltlpt: "count",
    ltl: "count",
    scui: "count",
    bom_at: "count",
    bom_ra: "count",
    bom_d: "count",
    dort: "zeroOrMore",
    bom_rqp: "fraction",
};

/**
 * Values used when neither the server nor the developer gives one
 */
var DEFAULTS = {
    tracking: true,
    networking: true,
    st: true,
    vt: true,
    cet: true,
    crt: true,
    lt: true,
    cr: false,
    bom: true,
    scui: 4,
    dort: 0,
    bom_at: 10,
    bom_rqp: 0.5,
    bom_ra: 24,
    bom_d: 60,
};

/**
 * Longest settings refresh interval in hours. A Node.js timer cannot wait longer than about 24.8 days, and a
 * longer value would make it fire at once, over and over.
 */
var MAX_REFRESH_HOURS = 596;

/**
 * Tells whether a value is a plain object (not null, not an array)
 * @param {*} value - value to check
 * @returns {Boolean} true for a plain object
 */
function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * Tells whether a value fits the kind a setting takes
 * @param {String} kind - "switch", "count", "zeroOrMore" or "fraction"
 * @param {*} value - value from the server or the developer
 * @returns {Boolean} true if the value can be used
 */
function isValidValue(kind, value) {
    if (kind === "switch") {
        return typeof value === "boolean";
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return false;
    }
    if (kind === "count") {
        return Math.floor(value) === value && value >= 1;
    }
    if (kind === "zeroOrMore") {
        return Math.floor(value) === value && value >= 0;
    }
    return value > 0 && value <= 1;
}

/**
 * Keeps only the supported settings with a usable value. Other keys (for example the dashboard's
 * "bom_preset", or settings for other platforms) are left out, and an unusable value is left out with a
 * warning, so the developer value or the default stays in use for it.
 * @param {Object} config - the "c" object of a settings answer
 * @param {Function} warn - called with a message for each left out value
 * @returns {Object} the usable settings
 */
function normalize(config, warn) {
    var result = {};
    Object.keys(config).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(SUPPORTED, key)) {
            return;
        }
        if (isValidValue(SUPPORTED[key], config[key])) {
            result[key] = key === "scui" ? Math.min(config[key], MAX_REFRESH_HOURS) : config[key];
        }
        else if (typeof warn === "function") {
            warn(`The behavior setting [${key}] has an unusable value [${JSON.stringify(config[key])}], it is ignored.`);
        }
    });
    return result;
}

/**
 * Reads the server's answer to a settings request. The answer must be a JSON object with a "c" object;
 * other top-level keys (v, t, lg, ct and future ones) are ignored, so both the v1 and the v2 format work.
 * @param {String} responseText - the answer body
 * @param {Function} warn - called with a message for each problem
 * @returns {Object|null} the usable settings, or null when the answer cannot be used
 */
function parseAnswer(responseText, warn) {
    var answer;
    try {
        answer = JSON.parse(responseText);
    }
    catch (ex) {
        return null;
    }
    if (!isPlainObject(answer) || !isPlainObject(answer.c)) {
        return null;
    }
    return normalize(answer.c, warn);
}

/**
 * Reads the settings a developer provides with the "behavior_settings" init option, in the same format the
 * server sends: an object with a "c" object
 * @param {*} provided - the init option value
 * @param {Function} warn - called with a message for each problem
 * @returns {Object|null} the usable settings, or null when none are provided or the format is wrong
 */
function parseProvided(provided, warn) {
    if (typeof provided === "undefined" || provided === null) {
        return null;
    }
    if (!isPlainObject(provided) || !isPlainObject(provided.c)) {
        if (typeof warn === "function") {
            warn("behavior_settings must be an object with a \"c\" object, as SDK Manager exports it. It is ignored.");
        }
        return null;
    }
    return normalize(provided.c, warn);
}

/**
 * Reads settings stored by an earlier run
 * @param {*} stored - the stored value
 * @returns {Object|null} the usable settings, or null when nothing usable is stored
 */
function parseStored(stored) {
    if (!isPlainObject(stored)) {
        return null;
    }
    return normalize(stored);
}

/**
 * Decides the value of a setting: the server's (or the stored or provided) value when there is one, else
 * the developer's value, else the default
 * @param {Object} settings - settings in use
 * @param {String} key - setting key
 * @param {*=} developerValue - value set with an init option, undefined when none
 * @returns {*} the value to use
 */
function valueOf(settings, key, developerValue) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) {
        return settings[key];
    }
    if (typeof developerValue !== "undefined") {
        return developerValue;
    }
    return DEFAULTS[key];
}

/**
 * Decides whether sending must pause after a successful request, following the backoff settings: the
 * request took at least bom_at seconds, the queue is at most bom_rqp of its size, and the request was
 * recorded at most bom_ra hours ago
 * @param {Object} input - measurements and settings
 * @param {Number} input.durationSeconds - how long the request took
 * @param {Number} input.queueLength - requests left in the queue
 * @param {Number} input.queueSize - maximum queue size
 * @param {Number} input.ageHours - hours since the request was recorded
 * @param {Number} input.bom_at - response time threshold in seconds
 * @param {Number} input.bom_rqp - queue fill threshold as a fraction of the queue size
 * @param {Number} input.bom_ra - request age threshold in hours
 * @returns {Boolean} true when sending must pause
 */
function shouldBackOff(input) {
    return input.durationSeconds >= input.bom_at
        && input.queueLength <= input.queueSize * input.bom_rqp
        && input.ageHours <= input.bom_ra;
}

module.exports = {
    SUPPORTED,
    DEFAULTS,
    MAX_REFRESH_HOURS,
    normalize,
    parseAnswer,
    parseProvided,
    parseStored,
    valueOf,
    shouldBackOff,
};
