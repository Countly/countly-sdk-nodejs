/**
     * Truncates an object's key/value pairs to a certain length
     * @param {Object} obj - original object to be truncated
     * @param {Number} keyLimit - limit for key length
     * @param {Number} valueLimit - limit for value length
     * @param {Number} segmentLimit - limit for segments pairs
     * @param {string} errorLog - prefix for error log
     * @param {boolean} debugCondition - a boolean to indicate if debugging is enabled or not
     * @returns {Object} - the new truncated object
     */
function truncateObject(obj, keyLimit, valueLimit, segmentLimit, errorLog, debugCondition) {
    var ob = {};
    if (obj) {
        if (Object.keys(obj).length > segmentLimit) {
            var resizedObj = {};
            var i = 0;
            for (var e in obj) {
                while (i < segmentLimit) {
                    resizedObj[e] = obj[e];
                    i++;
                }
            }
            obj = resizedObj;
        }
        for (var key in obj) {
            var newKey = truncateSingleValue(key, keyLimit, errorLog, debugCondition);
            var newValue = truncateSingleValue(obj[key], valueLimit, errorLog, debugCondition);
            ob[newKey] = newValue;
        }
    }
    return ob;
}

/**
     * Truncates a single value to a certain length
     * @param {string|number} str - original value to be truncated
     * @param {Number} limit - limit length
     * @param {string} errorLog - prefix for error log
     * @param {boolean} debugCondition - a boolean to indicate if debugging is enabled or not
     * @returns {string|number} - the new truncated value
     */
function truncateSingleValue(str, limit, errorLog, debugCondition) {
    var newStr = str;
    if (typeof str === 'number') {
        str = str.toString();
    }
    if (typeof str === 'string') {
        if (str.length > limit) {
            newStr = str.substring(0, limit);
            if (debugCondition && typeof console !== "undefined") {
                // eslint-disable-next-line no-console
                console.log(errorLog + ", Key: [" + str + "] is longer than accepted length. It will be truncated.");
            }
        }
    }
    return newStr;
}

module.exports = {truncateObject, truncateSingleValue};