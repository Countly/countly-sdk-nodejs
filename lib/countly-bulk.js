/**
 * CountlyBulk odule providing object to manage the internal queue and send bulk requests to Countly server.
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
 
 var fs = require("fs"),
    os = require("os"),
    path = require("path"),
    http = require("http"),
    https = require("https"),
    cluster = require("cluster"),
    BulkUser = require("./countly-bulk-user");

/**
 * @lends module:lib/countly-bulk
 * Initialize CountlyBulk server object
 * @param {Object} conf - CountlyBulk server object with configuration options
 * @param {string} conf.app_key - app key for your app created in Countly
 * @param {string} conf.url - your Countly server url, you can use your own server URL or IP here
 * @param {boolean} [conf.debug=false] - output debug info into console
 * @param {number} [conf.interval=5000] - set an interval how often to check if there is any data to report and report it in miliseconds
 * @param {number} [conf.bulk_size=50] - maximum amount or requests per one bulk request
 * @param {number} [conf.fail_timeout=60] - set time in seconds to wait after failed connection to server in seconds
 * @param {number} [conf.session_update=60] - how often in seconds should session be extended
 * @param {number} [conf.max_events=10] - maximum amount of events to send in one batch
 * @param {boolean} [conf.persist_queue=false] - persistantly store queue until processed, default is false if you want to keep queue in memory and process all in one process run
 * @param {boolean} [conf.force_post=false] - force using post method for all requests
 * @param {string} [conf.storage_path="../bulk_data/"] - where SDK would store data, including id, queues, etc
 * @returns {module:lib/countly-bulk} instance
 * @example
 * var server = new CountlyBulk({
 *   app_key: "{YOUR-API-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true
 * });
 */
function CountlyBulk(conf){
    "use strict";
    
    var SDK_VERSION = "18.04";
    var SDK_NAME = "javascript_native_nodejs_bulk";
    
    var empty_queue_callback = null;
    
    var initiated = false,
        lastMsTs = 0,
        apiPath = "/i/bulk",
        failTimeout = 0,
        empty_count = 0,
        readyToProcess = true,
        __data = {};
    
    if(!conf.app_key){
        log("app_key is missing");
        return;
    }
    
    if(!conf.url){
        log("url is missing");
        return;
    }
    
    conf.url = stripTrailingSlash(conf.url);
    
    conf.debug = conf.debug || false;
    conf.interval = conf.interval || 5000;
    conf.bulk_size = conf.bulk_size || 50;
    conf.fail_timeout = conf.fail_timeout || 60;
    conf.session_update = conf.session_update || 60;
    conf.max_events = conf.max_events || 10;
    conf.force_post = conf.force_post || false;
    conf.persist_queue = conf.persist_queue || false;
    conf.storage_path = conf.storage_path || "../bulk_data/";
    
    var dir = path.resolve(__dirname, conf.storage_path);
    if(conf.persist_queue){
        try{
            if (!fs.existsSync(dir)){
                fs.mkdirSync(dir);
            }
        } catch(ex){
            //problem creating dir
            console.log(ex.stack);
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
    **/
    this.add_request = function(query){
        if(cluster.isMaster){
            if(!query.device_id){
                log("device_id is missing", query);
                return;
            }
            
            if(!query.app_key){
                query.app_key = conf.app_key;
            }
            
            if((query.timestamp + "").length !== 13 && (query.timestamp + "").length !== 10){
                log("incorrect timestamp format", query);
            }
            query.sdk_name = SDK_NAME;
            query.sdk_version = SDK_VERSION;
            query.timestamp = query.timestamp || getMsTimestamp();
            var date = new Date((query.timestamp + "").length === 13 ? query.timestamp : parseInt(query.timestamp)*1000);
            query.hour = query.hour || date.getHours();
            query.dow = query.dow || date.getDay();

            requestQueue.push(query);
            log("adding request", query);
            storeSet("cly_req_queue", requestQueue);
        }
        else{
            process.send({ cly_bulk: {cly_queue: query} });
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
    * @param {Array} bulk - array with multiple request objects that can be provided with {@link CountlyBulk.add_request}
    * @returns {module:lib/countly-bulk} instance
    **/
    this.add_bulk_request = function(requests){
        if(cluster.isMaster){
            var query;
            for(var i in requests){
                query = requests[i];
                if(!query.device_id){
                    log("device_id is missing", query);
                    return;
                }
                
                if(!query.app_key){
                    query.app_key = conf.app_key;
                }
                
                if((query.timestamp + "").length !== 13 && (query.timestamp + "").length !== 10){
                    log("incorrect timestamp format", query);
                }
                
                query.sdk_name = SDK_NAME;
                query.sdk_version = SDK_VERSION;
                query.timestamp = query.timestamp || getMsTimestamp();
                var date = new Date((query.timestamp + "").length === 13 ? query.timestamp : parseInt(query.timestamp)*1000);
                query.hour = query.hour || date.getHours();
                query.dow = query.dow || date.getDay();
                log("adding bulk request", query);
                requestQueue.push(query);
            }
            storeSet("cly_req_queue", requestQueue);
        }
        else{
            process.send({ cly_bulk: {cly_bulk_queue: requests} });
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
    **/
    this.add_event = function(device_id, event){
        if(!device_id){
            log("device_id is missing");
            return;
        }
        
        if(!event.key){
            log("Event must have key property");
            return;
        }
        if(cluster.isMaster){
            if(!event.count){
                event.count = 1;
            }
            
            var props = ["key", "count", "sum", "dur", "segmentation", "timestamp"];
            var e = getProperties(event, props);
            e.timestamp = e.timestamp || getMsTimestamp();
            var date = new Date((e.timestamp + "").length === 13 ? e.timestamp : parseInt(e.timestamp)*1000);
            e.hour = date.getHours();
            e.dow = date.getDay();
            log("Adding event: ", event);
            if(!eventQueue[device_id]){
                eventQueue[device_id] = [];
            }
            eventQueue[device_id].push(e);
            storeSet("cly_bulk_event", eventQueue);
        }
        else{
            process.send({ cly_bulk: {device_id:device_id, event: event} });
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
    **/
    this.start = function(callback){
        if (cluster.isMaster) {
            if(!initiated){
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
    **/
    this.stop = function(){
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
    **/
    this.queue_size = function(){
        var eventCount = 0;
        for(var i in eventQueue){
            eventCount += eventQueue[i].length;
        }
        return Math.ceil(eventCount/conf.max_events) + Math.ceil(requestQueue.length/conf.bulk_size) + bulkQueue.length;
    };
    
    /**
    * Create specific user to easier send information about specific user
    * @param {Object} conf - CountlyBulkUser configuration options
    * @param {string} conf.device_id - identification of the user
    * @param {string=} conf.country_code - country code for your user
    * @param {string=} conf.city - name of the city of your user
    * @param {string=} conf.ip_address - ip address of your user
    * @returns {module:lib/countly-bulk-user} instance
    * @example 
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    * var user = server.add_user({device_id:"my_device_id"});
    **/
    this.add_user = function(conf){
        conf.server = this;
        return new BulkUser(conf);
    };
    
    //insert request to queue
    function toBulkRequestQueue(bulkRequest){
        bulkQueue.push(bulkRequest);
        storeSet("cly_bulk_queue", bulkQueue);
    }
    var self = this;
    //heart beat
    function heartBeat(){
        var isEmpty = true;
        //process event queue
        var eventChanges = false;
        for(var device_id in eventQueue){
            if(eventQueue[device_id].length > 0){
                eventChanges = true;
                if(eventQueue[device_id].length <= conf.max_events){
                    self.add_request({device_id:device_id, events: eventQueue[device_id]});
                    eventQueue[device_id] = [];
                }
                else{
                    var events = eventQueue[device_id].splice(0, conf.max_events);
                    self.add_request({device_id:device_id, events: events});
                }
            }
        }
        if(eventChanges){
            isEmpty = false;
            storeSet("cly_bulk_event", eventQueue);
        }
        
        //process request queue into bulk requests
        if(requestQueue.length > 0){
            isEmpty = false;
            if(requestQueue.length <= conf.bulk_size){
                toBulkRequestQueue({app_key:conf.app_key, requests: JSON.stringify(requestQueue)});
                requestQueue = [];
            }
            else{
                var requests = requestQueue.splice(0, conf.bulk_size);
                toBulkRequestQueue({app_key:conf.app_key, requests: JSON.stringify(requests)});
            }
            storeSet("cly_req_queue", requestQueue);
        }
        
        //process bulk request queue
        if(bulkQueue.length > 0 && readyToProcess && getTimestamp() > failTimeout){
            isEmpty = false;
            readyToProcess = false;
            var params = bulkQueue.shift();
            log("Processing request", params);
            makeRequest(params, function(err, params){
                log("Request Finished", params, err);
                if(err){
                    bulkQueue.unshift(params);
                    failTimeout = getTimestamp() + conf.fail_timeout;
                }
                storeSet("cly_bulk_queue", bulkQueue);
                readyToProcess = true;
            });
        }
        
        if(isEmpty){
            empty_count++;
            if(empty_count === 3){
                empty_count = 0;
                if(empty_queue_callback){
                    empty_queue_callback();
                }
            }
        }
        
        if(initiated){
            setTimeout(heartBeat, conf.interval);
        }
    }
    
    //log stuff
    function log(){
        if(conf.debug && typeof console !== "undefined"){
            if(arguments[1] && typeof arguments[1] === "object"){
                arguments[1] = JSON.stringify(arguments[1]);
            }
            console.log( Array.prototype.slice.call(arguments).join("\n") );
        }
    }
    
    //get unique timestamp in miliseconds
    function getMsTimestamp(){
        var ts = new Date().getTime();
        if(lastMsTs >= ts){
            lastMsTs++;
        }
        else{
            lastMsTs = ts;
        }
        return lastMsTs;
    }
    
    //parsing host and port information from url
    function parseUrl(url) {
        var serverOptions = {
            host: "localhost",
            port: 80
        };
        if(url.indexOf("https") === 0){
            serverOptions.port = 443;
        }
        var host = url.split("://").pop();
        serverOptions.host = host;
        var lastPos = host.indexOf(":");
        if (lastPos > -1) {
            serverOptions.host = host.slice(0,lastPos);
            serverOptions.port = Number(host.slice(lastPos+1,host.length));
        }
        return serverOptions;
    }
    
    //convert JSON object to query params
    function prepareParams(params){
        var str = [];
        for(var i in params){
            str.push(i+"="+encodeURIComponent(params[i]));
        }
        return str.join("&");
    }
    
    //removing trailing slashes
    function stripTrailingSlash(str) {
        if(str.substr(str.length - 1) === "/") {
            return str.substr(0, str.length - 1);
        }
        return str;
    }
    
    //sending HTTP request
    function makeRequest(params, callback) {
        try {
            log("Sending HTTP request");
            var serverOptions = parseUrl(conf.url);
            var data = prepareParams(params);
            var method = "GET";
            var options = {
                host: serverOptions.host,
                port: serverOptions.port,
                path: apiPath+"?"+data,
                method: "GET"
            };
            
            if(data.length >= 2000){
                method = "POST";
            }
            else if(conf.force_post){
                method = "POST";
            }
            
            if(method === "POST"){
                options.method = "POST";
                options.path = apiPath;
                options.headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(data)
                };
            }
            var protocol = http;
            if(conf.url.indexOf("https") === 0){
                protocol = https;
            }
            var req = protocol.request(options, function(res) {
                var str = "";
                res.on("data", function (chunk) {
                    str += chunk;
                });
            
                res.on("end", function () {
                    try{
                        str = JSON.parse(str);
                    }
                    catch(ex){
                        str = {};
                    }
                    if(res.statusCode >= 200 && res.statusCode < 300 && str.result === "Success"){
                        callback(false, params);
                    }
                    else{
                        callback(true, params);
                    }
                });
            });
            if(method === "POST"){
                // write data to request body
                req.write(data);
            }
            req.end();
        } catch (e) {
            // fallback
            log("Failed HTTP request", e);
            if (typeof callback === "function") { callback(true, params); }
        }
    }
       
    //get current timestamp
    function getTimestamp(){
        return Math.floor(new Date().getTime() / 1000);
    }
    
    //retrieve only specific properties from object
    function getProperties(orig, props){
        var ob = {};
        var prop;
        for(var i = 0; i < props.length; i++){
            prop = props[i];
            if(typeof orig[prop] !== "undefined"){
                ob[prop] = orig[prop];
            }
        }
        return ob;
    }
    
    function handleWorkerMessage(msg){
        if(msg.cly_bulk){
            if(msg.cly_bulk.cly_queue){
                self.add_request(msg.cly_bulk.cly_queue);
            }
            else if(msg.cly_bulk.cly_bulk_queue){
                self.add_bulk_request(msg.cly_bulk.cly_bulk_queue);
            }
            else if(msg.cly_bulk.event && msg.cly_bulk.device_id){
                self.add_event(msg.cly_bulk.device_id, msg.cly_bulk.event);
            }
        }
    }
    
    var readFile = function(key){
        var data;
        if(conf.persist_queue){
            var dir = path.resolve(__dirname, conf.storage_path+"__"+key+".json");
            
            //try reading data file
            try{
                data = fs.readFileSync(dir);
            } catch (ex) {
                //ther was no file, probably new init
                data = null;
            }
        
            try{
                //trying to parse json string
                data = JSON.parse(data);
            } catch (ex) {
                //problem parsing, corrupted file?
                console.log(ex.stack);
                //backup corrupted file data
                fs.writeFile(path.resolve(__dirname, conf.storage_path+"__"+key+"."+getTimestamp()+Math.random()+".json"), data, function(){});
                //start with new clean object
                data = null;
            }
        }
        return data;
    };
    
    var storeSet = function(key, value) {
        if(conf.persist_queue){
            __data[key] = value;
            var dir = path.resolve(__dirname, conf.storage_path+"__"+key+".json");
            var ob = {};
            ob[key] = value;
            try{
                fs.writeFileSync(dir, JSON.stringify(ob));
            }
            catch(ex){
                //problem saving file
                console.log(ex.stack);
            }
        }
    };
    
    var storeGet = function(key, def) {
        if(typeof __data[key] === "undefined"){
            var ob = readFile(key);
            if(!ob){
                __data[key] = def;
            }
            else{
                __data[key] = ob[key];
            }
        }
        return __data[key];
    };
    
    //listen to current workers
    if(cluster.workers){
        for (var id in cluster.workers) {
            cluster.workers[id].on("message", handleWorkerMessage);
        }
    }
    
    //handle future workers
    cluster.on("fork", function(worker) {
        worker.on("message", handleWorkerMessage);
    });
    
    var requestQueue = storeGet("cly_req_queue", []),
        eventQueue = storeGet("cly_bulk_event", {}),
        bulkQueue = storeGet("cly_bulk_queue", []);
}

module.exports = CountlyBulk;
