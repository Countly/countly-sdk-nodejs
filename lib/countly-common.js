/**
 *  Get current timestamp
 *  @returns {number} unix timestamp in seconds
 */
function getTimestamp() {
    return Math.floor(new Date().getTime() / 1000);
}

/**
     *  Retrieve only specific properties from object
     *  @param {Object} orig - object from which to get properties
     *  @param {Array} props - list of properties to get
     *  @returns {Object} Object with requested properties
     */
function getProperties(orig, props) {
    var ob = {};
    var prop;
    for (var i = 0; i < props.length; i++) {
        prop = props[i];
        if (typeof orig[prop] !== "undefined") {
            ob[prop] = orig[prop];
        }
    }
    return ob;
}
/**
     *  Removing trailing slashes
     *  @memberof Countly._internals
     *  @param {String} str - string from which to remove traling slash
     *  @returns {String} modified string
     */
function stripTrailingSlash(str) {
    if (str.substr(str.length - 1) === "/") {
        return str.substr(0, str.length - 1);
    }
    return str;
}

/**
     *  Generate random UUID value
     *  @returns {String} random UUID value
     */
function generateUUID() {
    var d = new Date().getTime();
    var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
}
module.exports = {getTimestamp, getProperties, stripTrailingSlash, generateUUID};