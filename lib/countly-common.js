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
     * @param {string} level - log level (error, warning, info, debug, verbose)
     * @param {string} message - any string message
     */
    log: function log(level, message, ...args) {
        if ((this.debug || this.debugBulk || this.debugBulkUser) && typeof console !== "undefined") {
            if (args[0] && typeof args[0] === "object") {
                args[0] = JSON.stringify(args[0]);
            }
            if (level === this.logLevelEnums.ERROR) {
                // eslint-disable-next-line no-console
                console.error(level + message, Array.prototype.slice.call(args).join("\n"));
            }
            else if (level === this.logLevelEnums.WARNING) {
                // eslint-disable-next-line no-console
                console.warn(level + message, Array.prototype.slice.call(args).join("\n"));
            }
            else if (level === this.logLevelEnums.VERBOSE) {
                // eslint-disable-next-line no-console
                console.log(level + message, Array.prototype.slice.call(args).join("\n"));
            }
            else if (level === this.logLevelEnums.INFO) {
                // eslint-disable-next-line no-console
                console.info(level + message, Array.prototype.slice.call(args).join("\n"));
            }
            else {
                //default log level is DEBUG
                level = this.logLevelEnums.DEBUG;
                // eslint-disable-next-line no-console
                console.debug(level + message, Array.prototype.slice.call(args).join("\n"));
            }
        }
    },
    /**
     * Check if the http response fits the bill of:
     * 1. The HTTP response code was successful (which is any 2xx code or code between 200 <= x < 300)
     * 2. The returned request is a JSON object
     * 3. That JSON object contains the field "result" (there can be other fields)
     * @param {Number} statusCode - http incoming statusCode
     * @param {String} str - response from server, ideally must be: {"result":"Success"} or should contain at least result field
     * @returns {Boolean} - returns true if response passes the tests 
     */
    isResponseValid: function isResponseValid(statusCode, str) {
        // status code and response format check
        if (!(statusCode >= 200 && statusCode < 300)) {
            return false;
        }

        //Try to parse JSON
        try {
            return JSON.parse(str).result ? true : false;
        }
        catch (e) {
            this.log("Http response is in the wrong format.", e);
            return false;
        }
    }
};


module.exports = cc;
