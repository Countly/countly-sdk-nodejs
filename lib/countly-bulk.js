/**
 * CountlyBulk module providing object to manage the internal queue and send bulk requests to Countly server.
 * @name CountlyBulk
 * @module lib/countly-bulk
 * @example
 * var CountlyBulk = require("countly-sdk-nodejs").Bulk;
 *
 * var server = new CountlyBulk({
 *   app_key: "{YOUR-APP-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true
 * });
 *
 * //start processing queued requests or next ones that will be added
 * server.start()
 *
 * //adding raw request
 * server.add_request({begin_session:1, metrics:{_os:"Linux"}, device_id:"users_device_id", events:[{key:"Test", count:1}]});
 */

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var cluster = require("cluster");
var cc = require("./countly-common");
var BulkUser = require("./countly-bulk-user");

/**
 * @lends module:lib/countly-bulk
 * Initialize CountlyBulk server object
 * @param {Object} conf - CountlyBulk server object with configuration options
 * @param {string} conf.app_key - app key for your app created in Countly
 * @param {string} conf.url - your Countly server url, you can use your own server URL or IP here
 * @param {boolean} [conf.debug=false] - output debug info into console
 * @param {number} [conf.interval=5000] - set an interval how often to check if there is any data to report and report it in milliseconds
 * @param {number} [conf.bulk_size=50] - maximum amount or requests per one bulk request
 * @param {number} [conf.fail_timeout=60] - set time in seconds to wait after failed connection to server in seconds
 * @param {number} [conf.session_update=60] - how often in seconds should session be extended
 * @param {number} [conf.max_events=100] - maximum amount of events to send in one batch
 * @param {boolean} [conf.persist_queue=false] - persistently store queue until processed, default is false if you want to keep queue in memory and process all in one process run
 * @param {boolean} [conf.force_post=false] - force using post method for all requests
 * @param {string} [conf.storage_path="../bulk_data/"] - where SDK would store data, including id, queues, etc
 * @param {string} [conf.http_options=] - function to get http options by reference and overwrite them, before running each request
 * @param {number} [conf.max_key_length=128] - maximum size of all string keys
 * @param {number} [conf.max_value_size=256] - maximum size of all values in our key-value pairs (Except "picture" field, that has a limit of 4096 chars)
 * @param {number} [conf.max_segmentation_values=30] - max amount of custom (dev provided) segmentation in one event
 * @param {number} [conf.max_breadcrumb_count=100] - maximum amount of breadcrumbs that can be recorded before the oldest one is deleted
 * @param {number} [conf.max_stack_trace_lines_per_thread=30] - maximum amount of stack trace lines would be recorded per thread
 * @param {number} [conf.max_stack_trace_line_length=200] - maximum amount of characters are allowed per stack trace line. This limits also the crash message length
 * @example
 * var server = new CountlyBulk({
 *   app_key: "{YOUR-API-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true
 * });
 */
function CountlyBulk(conf) {
    var SDK_VERSION = "22.06.0";
    var SDK_NAME = "javascript_native_nodejs_bulk";

    var empty_queue_callback = null;

    var initiated = false;
    var lastMsTs = 0;
    var apiPath = "/i/bulk";
    var failTimeout = 0;
    var empty_count = 0;
    var readyToProcess = true;
    var maxKeyLength = 128;
    var maxValueSize = 256;
    var maxSegmentationValues = 30;
    var maxBreadcrumbCount = 100;
    var maxStackTraceLinesPerThread = 30;
    var maxStackTraceLineLength = 200;
    var __data = {};

    cc.debugBulk = conf.debug || false;
    if (!conf.app_key) {
        cc.log(cc.logLevelEnums.ERROR, "CountlyBulk, 'app_key' is missing.");
        return;
    }

    if (!conf.url) {
        cc.log(cc.logLevelEnums.ERROR, "CountlyBulk, 'url' is missing.");
        return;
    }

    conf.url = cc.stripTrailingSlash(conf.url);

    conf.debug = conf.debug || false;
    conf.interval = conf.interval || 5000;
    conf.bulk_size = conf.bulk_size || 50;
    conf.fail_timeout = conf.fail_timeout || 60;
    conf.session_update = conf.session_update || 60;
    conf.max_events = conf.max_events || 100;
    conf.force_post = conf.force_post || false;
    conf.persist_queue = conf.persist_queue || false;
    conf.storage_path = conf.storage_path || "../bulk_data/";
    conf.http_options = conf.http_options || null;
    conf.maxKeyLength = conf.max_key_length || maxKeyLength;
    conf.maxValueSize = conf.max_value_size || maxValueSize;
    conf.maxSegmentationValues = conf.max_segmentation_values || maxSegmentationValues;
    conf.maxBreadcrumbCount = conf.max_breadcrumb_count || maxBreadcrumbCount;
    conf.maxStackTraceLinesPerThread = conf.max_stack_trace_lines_per_thread || maxStackTraceLinesPerThread;
    conf.maxStackTraceLineLength = conf.max_stack_trace_line_length || maxStackTraceLineLength;

    var mainDir = path.resolve(__dirname, conf.storage_path);
    if (conf.persist_queue) {
        try {
            if (!fs.existsSync(mainDir)) {
                fs.mkdirSync(mainDir);
            }
        }
        catch (ex) {
            // problem creating directory
            // eslint-disable-next-line no-console
            cc.log(cc.logLevelEnums.ERROR, "CountlyBulk, Failed white creating the '/data' directory. Error: ", ex.stack);
        }
    }

    this.conf = conf;
    /**
    * Add raw request with provided query string parameters
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * server.add_request({app_key:"somekey", devide_id:"someid", events:"[{'key':'val','count':1}]", begin_session:1});
    * @param {Object} query - object with key/values which will be used as query string parameters
    * @returns {module:lib/countly-bulk} instance
    * */
    this.add_request = function(query) {
        query = cc.truncateObject(query, self.maxKeyLength, self.maxValueSize, self.maxSegmentationValues, "add_request", self.debug);
        if (cluster.isMaster) {
            if (!query.device_id) {
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulk add_request, 'device_id' is missing.");
                return;
            }

            if (!query.app_key) {
                query.app_key = conf.app_key;
            }
            if (query.timestamp) {
                if ((`${query.timestamp}`).length !== 13 && (`${query.timestamp}`).length !== 10) {
                    cc.log(cc.logLevelEnums.WARNING, "CountlyBulk add_request, incorrect timestamp format, must be in milliseconds or seconds.");
                }
            }
            query.sdk_name = SDK_NAME;
            query.sdk_version = SDK_VERSION;
            query.timestamp = query.timestamp || getMsTimestamp();
            var date = new Date((`${query.timestamp}`).length === 13 ? query.timestamp : parseInt(query.timestamp) * 1000);
            query.hour = query.hour || date.getHours();
            query.dow = query.dow || date.getDay();

            requestQueue.push(query);
            cc.log(cc.logLevelEnums.INFO, "CountlyBulk add_request, Adding request to the queue.");
            storeSet("cly_req_queue", requestQueue);
        }
        else {
            cc.log(cc.logLevelEnums.INFO, "CountlyBulk add_request, Sending message to the parent process. Adding the raw request to the queue.");
            process.send({ cly_bulk: { cly_queue: query } });
        }
        return this;
    };

    /**
    * Add multiple raw requests each with provided query string parameters
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * server.add_bulk_request([{app_key:"somekey", devide_id:"someid", begin_session:1}, {app_key:"somekey", devide_id:"someid", events:"[{'key':'val','count':1}]"}]);
    * @param {Array} requests - array with multiple request objects that can be provided with {@link CountlyBulk.add_request}
    * @returns {module:lib/countly-bulk} instance
    * */
    this.add_bulk_request = function(requests) {
        if (cluster.isMaster) {
            var query;
            for (var i in requests) {
                query = requests[i];
                if (!query.device_id) {
                    cc.log(cc.logLevelEnums.ERROR, "CountlyBulk add_bulk_request, 'device_id' is missing.");
                    return;
                }

                if (!query.app_key) {
                    query.app_key = conf.app_key;
                }

                if ((`${query.timestamp}`).length !== 13 && (`${query.timestamp}`).length !== 10) {
                    cc.log(cc.logLevelEnums.ERROR, "CountlyBulk add_bulk_request, incorrect timestamp format.");
                }

                query.sdk_name = SDK_NAME;
                query.sdk_version = SDK_VERSION;
                query.timestamp = query.timestamp || getMsTimestamp();
                var date = new Date((`${query.timestamp}`).length === 13 ? query.timestamp : parseInt(query.timestamp) * 1000);
                query.hour = query.hour || date.getHours();
                query.dow = query.dow || date.getDay();
                cc.log(cc.logLevelEnums.INFO, "CountlyBulk add_bulk_request, adding the request into queue.");
                requestQueue.push(query);
            }
            storeSet("cly_req_queue", requestQueue);
        }
        else {
            cc.log(cc.logLevelEnums.INFO, "CountlyBulk add_bulk_request, Sending message to the parent process. Adding the raw request to the queue.");
            process.send({ cly_bulk: { cly_bulk_queue: requests } });
        }
        return this;
    };

    /**
    * Add raw event data for specific user (events are bulked by users)
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * server.add_event("my_device_id", {'key':'val','count':1});
    * @param {String} device_id - user or device identification
    * @param {Object} event - event object
    * @param {string} event.key - name or id of the event
    * @param {number} [event.count=1] - how many times did event occur
    * @param {number=} event.sum - sum to report with event (if any)
    * @param {number=} event.dur - duration to report with event (if any)
    * @param {Object=} event.segmentation - object with segments key /values
    * @param {number=} event.timestamp - timestamp when event occurred
    * @returns {module:lib/countly-bulk} instance
    * */
    this.add_event = function(device_id, event) {
        if (!device_id) {
            cc.log(cc.logLevelEnums.ERROR, "CountlyBulk add_event, 'device_id' is missing.");
            return;
        }

        if (!event.key) {
            cc.log(cc.logLevelEnums.ERROR, "CountlyBulk add_event, Event must have 'key' property.");
            return;
        }
        if (cluster.isMaster) {
            if (!event.count) {
                event.count = 1;
            }
            event.key = cc.truncateSingleValue(event.key, self.maxKeyLength, "add_event", self.debug);
            event.segmentation = cc.truncateObject(event.segmentation, self.maxKeyLength, self.maxValueSize, self.maxSegmentationValues, "add_event", self.debug);
            var props = ["key", "count", "sum", "dur", "segmentation", "timestamp"];
            var e = cc.getProperties(event, props);
            e.timestamp = e.timestamp || getMsTimestamp();
            var date = new Date((`${e.timestamp}`).length === 13 ? e.timestamp : parseInt(e.timestamp) * 1000);
            e.hour = date.getHours();
            e.dow = date.getDay();
            cc.log(cc.logLevelEnums.INFO, `CountlyBulk add_event, Adding event: [${event.key}].`);
            if (!eventQueue[device_id]) {
                eventQueue[device_id] = [];
            }
            eventQueue[device_id].push(e);
            storeSet("cly_bulk_event", eventQueue);
        }
        else {
            cc.log(cc.logLevelEnums.INFO, `CountlyBulk add_event, Sending message to the parent process. Adding event: [${event.key}].`);
            process.send({ cly_bulk: { device_id: device_id, event: event } });
        }
        return this;
    };

    /**
    * Start processing requests
    * @param {function} callback - to call when queue is empty and you can stop server
    * @returns {module:lib/countly-bulk} instance
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * server.start();
    * */
    this.start = function(callback) {
        if (cluster.isMaster) {
            if (!initiated) {
                cc.log(cc.logLevelEnums.INFO, "CountlyBulk start, starting to process the requests.");
                empty_queue_callback = callback;
                initiated = true;
                heartBeat();
            }
        }
        return this;
    };

    /**
    * Stop processing requests
    * @returns {module:lib/countly-bulk} instance
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * server.stop();
    * */
    this.stop = function() {
        cc.log(cc.logLevelEnums.INFO, "CountlyBulk stop, stopping to process the requests.");
        initiated = false;
        return this;
    };

    /**
    * Manually check queue size
    * @returns {number} amount of items in queue
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * server.add_request({device_id:"id", app_key:"key", begin_session:1});
    * server.queue_size(); //should return 1
    * */
    this.queue_size = function() {
        var eventCount = 0;
        for (var i in eventQueue) {
            eventCount += eventQueue[i].length;
        }
        return Math.ceil(eventCount / conf.max_events) + Math.ceil(requestQueue.length / conf.bulk_size) + bulkQueue.length;
    };

    /**
    * Create specific user to easier send information about specific user
    * @param {Object} userConf - CountlyBulkUser configuration options
    * @param {string} userConf.device_id - identification of the user
    * @param {string=} userConf.country_code - country code for your user
    * @param {string=} userConf.city - name of the city of your user
    * @param {string=} userConf.ip_address - ip address of your user
    * @returns {module:lib/countly-bulk-user} instance
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * var user = server.add_user({device_id:"my_device_id"});
    * */
    this.add_user = function(userConf) {
        userConf = cc.truncateObject(userConf, self.maxKeyLength, self.maxValueSize, self.maxSegmentationValues, "add_user", self.debug);
        userConf.server = this;
        return new BulkUser(userConf);
    };

    /**
     *  Insert request to queue
     *  @param {Object} bulkRequest - bulk request object
     */
    function toBulkRequestQueue(bulkRequest) {
        bulkQueue.push(bulkRequest);
        storeSet("cly_bulk_queue", bulkQueue);
    }
    var self = this;

    /**
    *  Makin request making and data processing loop
    */
    function heartBeat() {
        var isEmpty = true;
        // process event queue
        var eventChanges = false;
        for (var device_id in eventQueue) {
            if (eventQueue[device_id].length > 0) {
                eventChanges = true;
                if (eventQueue[device_id].length <= conf.max_events) {
                    self.add_request({ device_id: device_id, events: eventQueue[device_id] });
                    eventQueue[device_id] = [];
                }
                else {
                    var events = eventQueue[device_id].splice(0, conf.max_events);
                    self.add_request({ device_id: device_id, events: events });
                }
            }
        }
        if (eventChanges) {
            isEmpty = false;
            storeSet("cly_bulk_event", eventQueue);
        }

        // process request queue into bulk requests
        if (requestQueue.length > 0) {
            isEmpty = false;
            if (requestQueue.length <= conf.bulk_size) {
                toBulkRequestQueue({ app_key: conf.app_key, requests: JSON.stringify(requestQueue) });
                requestQueue = [];
            }
            else {
                var requests = requestQueue.splice(0, conf.bulk_size);
                toBulkRequestQueue({ app_key: conf.app_key, requests: JSON.stringify(requests) });
            }
            storeSet("cly_req_queue", requestQueue);
        }

        // process bulk request queue
        if (bulkQueue.length > 0 && readyToProcess && cc.getTimestamp() > failTimeout) {
            isEmpty = false;
            readyToProcess = false;
            var params = bulkQueue.shift();
            cc.log(cc.logLevelEnums.DEBUG, "CountlyBulk heartBeat, Processing the request:", params);
            makeRequest(params, (err, res) => {
                cc.log(cc.logLevelEnums.DEBUG, "CountlyBulk heartBeat, Request finished with response: ", res);
                if (err) {
                    bulkQueue.unshift(res);
                    failTimeout = cc.getTimestamp() + conf.fail_timeout;
                }
                storeSet("cly_bulk_queue", bulkQueue);
                readyToProcess = true;
            }, "heartBeat", false);
        }

        if (isEmpty) {
            empty_count++;
            if (empty_count === 3) {
                empty_count = 0;
                if (empty_queue_callback) {
                    empty_queue_callback();
                }
            }
        }

        if (initiated) {
            setTimeout(heartBeat, conf.interval);
        }
    }

    /**
     *  Get unique timestamp in miliseconds
     *  @returns {number} miliseconds timestamp
     */
    function getMsTimestamp() {
        var ts = new Date().getTime();
        if (lastMsTs >= ts) {
            lastMsTs++;
        }
        else {
            lastMsTs = ts;
        }
        return lastMsTs;
    }

    /**
     *  Parsing host and port information from url
     *  @param {String} url - url to which request will be made
     *  @returns {Object} Server options
     */
    function parseUrl(url) {
        var serverOptions = {
            host: "localhost",
            port: 80,
        };
        if (url.indexOf("https") === 0) {
            serverOptions.port = 443;
        }
        var host = url.split("://").pop();
        serverOptions.host = host;
        var lastPos = host.indexOf(":");
        if (lastPos > -1) {
            serverOptions.host = host.slice(0, lastPos);
            serverOptions.port = Number(host.slice(lastPos + 1, host.length));
        }
        return serverOptions;
    }

    /**
     *  Convert JSON object to query params
     *  @param {Object} params - object with url params
     *  @returns {String} query string
     */
    function prepareParams(params) {
        var str = [];
        for (var i in params) {
            str.push(`${i}=${encodeURIComponent(params[i])}`);
        }
        return str.join("&");
    }

    /**
    *  Making HTTP request
    *  @param {Object} params - key value object with URL params
    *  @param {Function} callback - callback when request finished or failed
    *  @param {string} info - function name or any other information for the logs
    *  @param {Boolean} isBroad - if true a broader (more generous) response check would be implemented
    */
    function makeRequest(params, callback, info, isBroad) {
        try {
            info = info || "general";
            isBroad = isBroad || false;
            cc.log(cc.logLevelEnums.DEBUG, `CountlyBulk makeRequest, Sending ${info} HTTP request`);
            var serverOptions = parseUrl(conf.url);
            var data = prepareParams(params);
            var method = "GET";
            var options = {
                host: serverOptions.host,
                port: serverOptions.port,
                path: `${apiPath}?${data}`,
                method: "GET",
            };

            if (data.length >= 2000) {
                method = "POST";
            }
            else if (conf.force_post) {
                method = "POST";
            }

            if (method === "POST") {
                options.method = "POST";
                options.path = apiPath;
                options.headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(data),
                };
            }
            if (typeof conf.http_options === "function") {
                conf.http_options(options);
            }
            var protocol = https;
            if (conf.url.indexOf("http:") === 0) {
                protocol = http;
            }
            var req = protocol.request(options, (res) => {
                var str = "";
                res.on("data", (chunk) => {
                    str += chunk;
                });

                res.on("end", () => {
                    // response validation function will be selected to also accept JSON arrays if isBroad is true
                    var isResponseValidated;
                    if (isBroad) {
                        // JSON array/object both can pass
                        isResponseValidated = cc.isResponseValidBroad(res.statusCode, str);
                    }
                    else {
                        // only JSON object with result can pass
                        isResponseValidated = cc.isResponseValid(res.statusCode, str);
                    }
                    if (isResponseValidated) {
                        callback(false, params);
                    }
                    else {
                        callback(true, params);
                    }
                });
            });
            if (method === "POST") {
                // write data to request body
                req.write(data);
            }

            req.on("error", (err) => {
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulk makeRequest, Connection failed. Error:", err);
                if (typeof callback === "function") {
                    callback(true, params);
                }
            });

            req.end();
        }
        catch (e) {
            // fallback
            cc.log(cc.logLevelEnums.ERROR, "CountlyBulk makeRequest, Failed HTTP request. Error: ", e);
            if (typeof callback === "function") {
                callback(true, params);
            }
        }
    }

    /**
     *  Handle messages from forked workers
     *  @param {Object} msg - message from worker
     */
    function handleWorkerMessage(msg) {
        if (msg.cly_bulk) {
            if (msg.cly_bulk.cly_queue) {
                self.add_request(msg.cly_bulk.cly_queue);
            }
            else if (msg.cly_bulk.cly_bulk_queue) {
                self.add_bulk_request(msg.cly_bulk.cly_bulk_queue);
            }
            else if (msg.cly_bulk.event && msg.cly_bulk.device_id) {
                self.add_event(msg.cly_bulk.device_id, msg.cly_bulk.event);
            }
        }
    }

    /**
     *  Read value from file
     *  @param {String} key - key for file
     *  @returns {varies} value in file
     */
    var readFile = function(key) {
        var data;
        if (conf.persist_queue) {
            var dir = path.resolve(__dirname, `${conf.storage_path}__${key}.json`);

            // try reading data file
            try {
                data = fs.readFileSync(dir);
            }
            catch (ex) {
                // there was no file, probably new init
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulk readFile, Nothing to read. Might be first init. Error: ", ex);
                data = null;
            }

            try {
                // trying to parse json string
                data = JSON.parse(data);
            }
            catch (ex) {
                // problem parsing, corrupted file?
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulk readFile, Problem while parsing. Error:", ex.stack);
                // backup corrupted file data
                fs.writeFile(path.resolve(__dirname, `${conf.storage_path}__${key}.${cc.getTimestamp()}${Math.random()}.json`), data, () => {});
                // start with new clean object
                data = null;
            }
        }
        return data;
    };

    var asyncWriteLock = false;
    var asyncWriteQueue = [];

    /**
     *  Write to file and process queue while in asyncWriteLock
     *  @param {String} key - key for value to store
     *  @param {varies} value - value to store
     *  @param {Function} callback - callback to call when done storing
     */
    var writeFile = function(key, value, callback) {
        var ob = {};
        ob[key] = value;
        var dir = path.resolve(__dirname, `${conf.storage_path}__${key}.json`);
        fs.writeFile(dir, JSON.stringify(ob), (err) => {
            if (err) {
                // eslint-disable-next-line no-console
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulk writeFile, Problem while writing. Error:", err);
            }
            if (typeof callback === "function") {
                callback(err);
            }
            if (asyncWriteQueue.length) {
                setTimeout(() => {
                    var arr = asyncWriteQueue.shift();
                    writeFile(arr[0], arr[1], arr[2]);
                }, 0);
            }
            else {
                asyncWriteLock = false;
            }
        });
    };

    /**
     *  Save value in storage
     *  @param {String} key - key for value to store
     *  @param {varies} value - value to store
     *  @param {Function} callback - callback to call when done storing
     */
    var storeSet = function(key, value, callback) {
        __data[key] = value;
        if (!asyncWriteLock) {
            asyncWriteLock = true;
            writeFile(key, value, callback);
        }
        else {
            asyncWriteQueue.push([key, value, callback]);
        }
    };

    /**
     *  Get value from storage
     *  @param {String} key - key of value to get
     *  @param {varies} def - default value to use if not set
     *  @returns {varies} value for the key
     */
    var storeGet = function(key, def) {
        if (typeof __data[key] === "undefined") {
            var ob = readFile(key);
            if (!ob) {
                __data[key] = def;
            }
            else {
                __data[key] = ob[key];
            }
        }
        return __data[key];
    };

    // listen to current workers
    if (cluster.workers) {
        for (var id in cluster.workers) {
            cluster.workers[id].on("message", handleWorkerMessage);
        }
    }

    // handle future workers
    cluster.on("fork", (worker) => {
        worker.on("message", handleWorkerMessage);
    });

    var requestQueue = storeGet("cly_req_queue", []);
    var eventQueue = storeGet("cly_bulk_event", {});
    var bulkQueue = storeGet("cly_bulk_queue", []);
}

module.exports = CountlyBulk;
