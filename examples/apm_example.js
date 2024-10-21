//since we need to test crashing the app
/*global app*/
const COUNTLY_SERVER_KEY = "https://your.server.ly";
const COUNTLY_APP_KEY = "YOUR_APP_KEY";

if(COUNTLY_APP_KEY === "YOUR_APP_KEY" || COUNTLY_SERVER_KEY === "https://your.server.ly"){
    console.warn("Please do not use default set of app key and server url")
}

var Countly = require("../lib/countly.js");

Countly.init({
    app_key: COUNTLY_APP_KEY,
    url: COUNTLY_SERVER_KEY, //your server goes here
    debug: true
});

//report app start trace
Countly.report_app_start();

/**
 *  example express middleware
 *  @param {Object} req - request object
 *  @param {Object} res - response object
 *  @param {Function} next - next middleware call
 */
function expressMiddleware(req, res, next) {
    var trace = {
        type: "network",
        name: req.baseUrl + req.path,
        stz: Date.now(),
    };

    var processed = false;

    /**
     *  Prepare request data
     */
    function processRequest() {
        if (!processed) {
            processed = true;
            trace.etz = Date.now();
            trace.apm_metrics = {
                response_time: trace.etz - trace.stz,
                response_code: res.statusCode,
                response_payload_size: res.getHeader('Content-Length') || res._contentLength,
                request_payload_size: (req.socket && req.socket.bytesRead) ? req.socket.bytesRead : req.getHeader('Content-Length')
            };
            Countly.report_trace(trace);
        }
    }

    res.on('finish', processRequest);

    res.on('close', processRequest);

    next();
}

app.use(expressMiddleware);