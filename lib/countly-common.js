/**
 * main common functionalities will go in here
 */
var cc = {

    //debug value from Countly
    debug: false,
    debugBulk: false,
    debugBulkUser: false,
    /**
     * 
     *log level Enums:
        *Error - this is a issues that needs attention right now.
        *Warning - this is something that is potentially a issue. Maybe a deprecated usage of something, maybe consent is enabled but consent is not given.
        *Info - All publicly exposed functions should log a call at this level to indicate that they were called. These calls should include the function name.
        *Debug - this should contain logs from the internal workings of the SDK and it's important calls. This should include things like the SDK configuration options, success or fail of the current network request, "request queue is full" and the oldest request get's dropped, etc.
        *Verbose - this should give a even deeper look into the SDK's inner working and should contain things that are more noisy and happen often.
        */
    logLevelEnums: {
        ERROR: '[ERROR] ',
        WARNING: '[WARNING] ',
        INFO: '[INFO] ',
        DEBUG: '[DEBUG] ',
        VERBOSE: '[VERBOSE] ',
    },

    /**
     *  Get current timestamp
     *  @returns {number} unix timestamp in seconds
     */
    getTimestamp: function getTimestamp() {
        return Math.floor(new Date().getTime() / 1000);
    },
    /**
         *  Retrieve only specific properties from object
         *  @param {Object} orig - object from which to get properties
         *  @param {Array} props - list of properties to get
         *  @returns {Object} Object with requested properties
         */
    getProperties: function getProperties(orig, props) {
        var ob = {};
        var prop;
        for (var i = 0; i < props.length; i++) {
            prop = props[i];
            if (typeof orig[prop] !== "undefined") {
                ob[prop] = orig[prop];
            }
        }
        return ob;
    },
    /**
         *  Removing trailing slashes
         *  @memberof Countly._internals
         *  @param {String} str - string from which to remove traling slash
         *  @returns {String} modified string
         */
    stripTrailingSlash: function stripTrailingSlash(str) {
        if (str.substring(str.length - 1) === "/") {
            return str.substring(0, str.length - 1);
        }
        return str;
    },
    /**
         *  Generate random UUID value
         *  @returns {String} random UUID value
         */
    generateUUID: function generateUUID() {
        var d = new Date().getTime();
        var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    },
    /**
     *  Log data if debug mode is enabled
     */
    log: function log() {
        if ((this.debug || this.debugBulk || this.debugBulkUser) && typeof console !== "undefined") {
            if (arguments[1] && typeof arguments[1] === "object") {
                arguments[1] = JSON.stringify(arguments[1]);
            }
            // eslint-disable-next-line no-console
            console.log(Array.prototype.slice.call(arguments).join("\n"));
        }
    }
};


module.exports = cc;