/**
     * 
     *log level Enums:
     *Error - this is a issues that needs attention right now.
     *Warning - this is something that is potentially a issue. Maybe a deprecated usage of something, maybe consent is enabled but consent is not given.
     *Info - All publicly exposed functions should log a call at this level to indicate that they were called. These calls should include the function name.
     *Debug - this should contain logs from the internal workings of the SDK and it's important calls. This should include things like the SDK configuration options, success or fail of the current network request, "request queue is full" and the oldest request get's dropped, etc.
     *Verbose - this should give a even deeper look into the SDK's inner working and should contain things that are more noisy and happen often.
     */
var logLevelEnums = {
    ERROR: '[ERROR] ',
    WARNING: '[WARNING] ',
    INFO: '[INFO] ',
    DEBUG: '[DEBUG] ',
    VERBOSE: '[VERBOSE] ',
};
/**
     *  Log data if debug mode is enabled
     * @param {string} level - log level (error, warning, info, debug, verbose)
     * @param {string} message - any string message
     * @param {boolean} debug - debugging is on if true
     */
function log(level, message, debug, ...args) {
    if (debug && typeof console !== "undefined") {
        if (args[0] && typeof args[0] === "object") {
            args[0] = JSON.stringify(args[0]);
        }
        var color = '';
        //change color
        if (level === logLevelEnums.ERROR) {
            //red color
            color = '\x1b[31m%s\x1b[0m';
        }
        else if (level === logLevelEnums.WARNING) {
            //yellow
            color = '\x1b[33m%s\x1b[0m';
        }
        else if (level === logLevelEnums.DEBUG) {
            //cyan
            color = '\x1b[36m%s\x1b[0m';
        }
        else if (level === logLevelEnums.VERBOSE) {
            //blue
            color = '\x1b[34m%s\x1b[0m';
        }
        else {
            //default log level is info
            level = logLevelEnums.INFO;
        }

        // eslint-disable-next-line no-console
        console.log(color, level + message, Array.prototype.slice.call(args).join("\n"));
    }
}

module.exports = log;