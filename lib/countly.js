/** **********
* Countly NodeJS SDK
* https://github.com/Countly/countly-sdk-nodejs
*********** */

/**
 * Countly object to manage the internal queue and send requests to Countly server. More information on {@link http://resources.count.ly/docs/countly-sdk-for-nodejs}
 * @name Countly
 * @global
 * @namespace Countly
 * @example <caption>SDK integration</caption>
 * var Countly = require("countly-sdk-nodejs");
 *
 * Countly.init({
 *   app_key: "{YOUR-APP-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true
 * });
 *
 * Countly.begin_session();
 */

var fs = require("fs");
var os = require("os");
var path = require("path");
var http = require("http");
var https = require("https");
var cluster = require("cluster");
var cc = require("./countly-common");
var Bulk = require("./countly-bulk");

var Countly = {};

Countly.Bulk = Bulk;
(function() {
    var SDK_VERSION = "22.02.0";
    var SDK_NAME = "javascript_native_nodejs";

    var inited = false;
    var sessionStarted = false;
    var platform;
    var apiPath = "/i";
    var readPath = "/o/sdk";
    var beatInterval = 500;
    var queueSize = 1000;
    var requestQueue = [];
    var eventQueue = [];
    var remoteConfigs = {};
    var crashLogs = [];
    var timedEvents = {};
    var crashSegments = null;
    var autoExtend = true;
    var lastBeat;
    var storedDuration = 0;
    var lastView = null;
    var lastViewTime = 0;
    var lastMsTs = 0;
    var lastViewStoredDuration = 0;
    var failTimeout = 0;
    var failTimeoutAmount = 60;
    var sessionUpdate = 60;
    var maxEventBatch = 100;
    var readyToProcess = true;
    var trackTime = true;
    var metrics = {};
    var lastParams = {};
    var startTime;
    var maxKeyLength = 128;
    var maxValueSize = 256;
    var maxSegmentationValues = 30;
    var maxBreadcrumbCount = 100;
    var maxStackTraceLinesPerThread = 30;
    var maxStackTraceLineLength = 200;
    var __data = {};
    var deviceIdType = null;

    /**
    * Array with list of available features that you can require consent for
    */
    Countly.features = ["sessions", "events", "views", "crashes", "attribution", "users", "location", "star-rating", "apm", "feedback", "remote-config"];

    // create object to store consents
    var consents = {};
    for (var feat = 0; feat < Countly.features.length; feat++) {
        consents[Countly.features[feat]] = {};
    }

    /**
 * Initialize Countly object
 * @param {Object} conf - Countly initialization {@link Init} object with configuration options
 * @param {string} conf.app_key - app key for your app created in Countly
 * @param {string} conf.device_id - to identify a visitor, will be auto generated if not provided
 * @param {string} conf.url - your Countly server url, you can use your own server URL or IP here
 * @param {string} [conf.app_version=0.0] - the version of your app or website
 * @param {string=} conf.country_code - country code for your visitor
 * @param {string=} conf.city - name of the city of your visitor
 * @param {string=} conf.ip_address - ip address of your visitor
 * @param {boolean} [conf.debug=false] - output debug info into console
 * @param {number} [conf.interval=500] - set an interval how often to check if there is any data to report and report it in miliseconds
 * @param {number} [conf.queue_size=1000] - maximum amount of queued requests to store
 * @param {number} [conf.fail_timeout=60] - set time in seconds to wait after failed connection to server in seconds
 * @param {number} [conf.session_update=60] - how often in seconds should session be extended
 * @param {number} [conf.max_events=100] - maximum amount of events to send in one batch
 * @param {boolean} [conf.force_post=false] - force using post method for all requests
 * @param {boolean} [conf.clear_stored_device_id=false] - set it to true if you want to erase the stored device ID
 * @param {boolean} [conf.test_mode=false] - set it to true if you want to initiate test_mode
 * @param {string} [conf.storage_path="../data/"] - where SDK would store data, including id, queues, etc
 * @param {boolean} [conf.require_consent=false] - pass true if you are implementing GDPR compatible consent management. It would prevent running any functionality without proper consent
 * @param {boolean|function} [conf.remote_config=false] - Enable automatic remote config fetching, provide callback function to be notified when fetching done
 * @param {function} [conf.http_options=] - function to get http options by reference and overwrite them, before running each request
 * @deprecated {number} [conf.max_logs=100] - maximum amount of breadcrumbs to store for crash logs
 * @param {number} [conf.max_key_length=128] - maximum size of all string keys
 * @param {number} [conf.max_value_size=256] - maximum size of all values in our key-value pairs (Except "picture" field, that has a limit of 4096 chars)
 * @param {number} [conf.max_segmentation_values=30] - max amount of custom (dev provided) segmentation in one event
 * @param {number} [conf.max_breadcrumb_count=100] - maximum amount of breadcrumbs that can be recorded before the oldest one is deleted
 * @param {number} [conf.max_stack_trace_lines_per_thread=30] - maximum amount of stack trace lines would be recorded per thread
 * @param {number} [conf.max_stack_trace_line_length=200] - maximum amount of characters are allowed per stack trace line. This limits also the crash message length
 * @param {Object} conf.metrics - provide {@link Metrics} for this user/device, or else will try to collect what's possible
 * @param {string} conf.metrics._os - name of platform/operating system
 * @param {string} conf.metrics._os_version - version of platform/operating system
 * @param {string} conf.metrics._device - device name
 * @param {string} conf.metrics._resolution - screen resolution of the device
 * @param {string} conf.metrics._carrier - carrier or operator used for connection
 * @param {string} conf.metrics._density - screen density of the device
 * @param {string} conf.metrics._locale - locale or language of the device in ISO format
 * @param {string} conf.metrics._store - source from where the user/device/installation came from
 * @example
 * Countly.init({
 *   app_key: "{YOUR-APP-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true,
 *   app_version: "1.0",
 *   metrics:{
 *      _os: "Ubuntu",
 *      _os_version: "16.04",
 *      _device: "aws-server"
 *   }
 * });
 */
    Countly.init = function(conf) {
        if (!inited) {
            startTime = cc.getTimestamp();
            inited = true;
            conf = conf || {};
            timedEvents = {};
            beatInterval = conf.interval || Countly.interval || beatInterval;
            queueSize = conf.queue_size || Countly.queue_size || queueSize;
            failTimeoutAmount = conf.fail_timeout || Countly.fail_timeout || failTimeoutAmount;
            sessionUpdate = conf.session_update || Countly.session_update || sessionUpdate;
            maxEventBatch = conf.max_events || Countly.max_events || maxEventBatch;
            metrics = conf.metrics || Countly.metrics || {};
            conf.debug = conf.debug || Countly.debug || false;
            conf.clear_stored_device_id = conf.clear_stored_device_id || false;
            Countly.test_mode = conf.test_mode || false;
            Countly.app_key = conf.app_key || Countly.app_key || null;
            Countly.url = cc.stripTrailingSlash(conf.url || Countly.url || "");
            Countly.app_version = conf.app_version || Countly.app_version || "0.0";
            Countly.country_code = conf.country_code || Countly.country_code || null;
            Countly.city = conf.city || Countly.city || null;
            Countly.ip_address = conf.ip_address || Countly.ip_address || null;
            Countly.force_post = conf.force_post || Countly.force_post || false;
            Countly.storage_path = conf.storage_path || Countly.storage_path || "../data/";
            Countly.require_consent = conf.require_consent || Countly.require_consent || false;
            Countly.remote_config = conf.remote_config || Countly.remote_config || false;
            Countly.http_options = conf.http_options || Countly.http_options || null;
            Countly.maxKeyLength = conf.max_key_length || Countly.max_key_length || maxKeyLength;
            Countly.maxValueSize = conf.max_value_size || Countly.max_value_size || maxValueSize;
            Countly.maxSegmentationValues = conf.max_segmentation_values || Countly.max_segmentation_values || maxSegmentationValues;
            Countly.maxBreadcrumbCount = conf.max_breadcrumb_count || Countly.max_breadcrumb_count || conf.max_logs || Countly.max_logs || maxBreadcrumbCount;
            Countly.maxStackTraceLinesPerThread = conf.max_stack_trace_lines_per_thread || Countly.max_stack_trace_lines_per_thread || maxStackTraceLinesPerThread;
            Countly.maxStackTraceLineLength = conf.max_stack_trace_line_length || Countly.max_stack_trace_line_length || maxStackTraceLineLength;

            // Common module debug value is set to init time debug value
            cc.debug = conf.debug;

            var dir = path.resolve(__dirname, Countly.storage_path);
            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }
            catch (ex) {
                // problem creating data dir
                cc.log(cc.logLevelEnums.ERROR, `init, Failed to create the '/data' folder: ${ex}`);
            }
            // clear stored device ID if flag is set
            if (conf.clear_stored_device_id) {
                cc.log(cc.logLevelEnums.WARNING, "init, clear_stored_device_id is true, erasing the stored ID.");
                storeSet("cly_id", null);
                storeSet("cly_id_type", null);
            }

            if (Countly.url === "") {
                cc.log(cc.logLevelEnums.ERROR, "init, Server URL not provided.");
            }
            else {
                cc.log(cc.logLevelEnums.INFO, "init, Countly initialized.");
                cc.log(cc.logLevelEnums.DEBUG, `init, Starting timestamp: [${startTime}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Beat interval: [${beatInterval}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Queue size: [${queueSize}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Fail timeout amount: [${failTimeoutAmount}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Session update interval: [${sessionUpdate}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Max event batch size: [${maxEventBatch}].`);
                if (metrics) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Metrics: `, metrics);
                }
                if (Countly.test_mode) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Test mode is on.`);
                }
                cc.log(cc.logLevelEnums.DEBUG, `init, app_key: [${Countly.app_key}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, url: [${Countly.url}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, app_version: [${Countly.app_version}].`);
                if (Countly.country_code) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Country code: [${Countly.country_code}].`);
                }
                if (Countly.city) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, City: [${Countly.city}].`);
                }
                if (Countly.ip_address) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, IP address: [${Countly.ip_address}].`);
                }
                cc.log(cc.logLevelEnums.DEBUG, `init, Force POST requests: [${Countly.force_post}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Storage path: [${Countly.storage_path}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Require consent: [${Countly.require_consent}].`);
                if (Countly.remote_config) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Automatic Remote Configuration is on.`);
                }
                if (Countly.http_options) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Custom headers: [${Countly.http_options}].`);
                }
                cc.log(cc.logLevelEnums.DEBUG, `init,  General value limits are,\n for key length: [${Countly.maxKeyLength}],\n for value size: [${Countly.maxValueSize}],\n for segmentation: [${Countly.maxSegmentationValues}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init,  Crash related value limits are,\n for breadcrumb count: [${Countly.maxBreadcrumbCount}],\n for trace lines per thread: [${Countly.maxStackTraceLinesPerThread}],\n for trace line length: [${Countly.maxStackTraceLineLength}].`);

                if (cluster.isMaster) {
                    // fetch stored ID and ID type
                    var storedId = storeGet("cly_id", null);
                    var storedIdType = storeGet("cly_id_type", null);
                    // if there was a stored ID
                    if (storedId !== null) {
                        Countly.device_id = storedId;
                        // deviceIdType = storedIdType || cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED;
                        if (storedIdType === null) {
                            // even though the device ID set, not type was set, setting it here
                            if (cc.isUUID(storedId)) {
                                // assuming it is a UUID so also assuming it is SDK generated
                                storedIdType = cc.deviceIdTypeEnums.SDK_GENERATED;
                            }
                            else {
                                // assuming it was set by the developer
                                storedIdType = cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED;
                            }
                        }
                        deviceIdType = storedIdType;
                    }
                    // if the user provided device ID during the init and no ID was stored
                    else if (conf.device_id || Countly.device_id) {
                        Countly.device_id = conf.device_id || Countly.device_id;
                        deviceIdType = cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED;
                    }
                    // if no device ID provided during init nor it was stored previously
                    else {
                        Countly.device_id = cc.generateUUID();
                        deviceIdType = cc.deviceIdTypeEnums.SDK_GENERATED;
                    }
                    // save the ID and ID type
                    storeSet("cly_id", Countly.device_id);
                    storeSet("cly_id_type", deviceIdType);
                    // create queues
                    requestQueue = storeGet("cly_queue", []);
                    eventQueue = storeGet("cly_event", []);
                    remoteConfigs = storeGet("cly_remote_configs", {});
                    heartBeat();
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
                    if (Countly.remote_config) {
                        Countly.fetch_remote_config(Countly.remote_config);
                    }
                }
            }
        }
    };

    /**
     * WARNING!!!
     * Should be used only for testing purposes!!!
     * 
     * Resets Countly to its initial state (used mainly to wipe the queues in memory).
     * Calling this will result in a loss of data
     * @param {boolean} preventRequestProcessing - if true request queues wont be processed, for testing purposes
     */
    Countly.halt = function(preventRequestProcessing) {
        cc.log(cc.logLevelEnums.WARNING, "halt, Resetting Countly.");
        inited = false;
        sessionStarted = false;
        beatInterval = 500;
        queueSize = 1000;
        requestQueue = [];
        eventQueue = [];
        remoteConfigs = {};
        crashLogs = [];
        timedEvents = {};
        crashSegments = null;
        autoExtend = true;
        storedDuration = 0;
        lastView = null;
        lastViewTime = 0;
        lastMsTs = 0;
        lastViewStoredDuration = 0;
        failTimeout = 0;
        failTimeoutAmount = 60;
        sessionUpdate = 60;
        maxEventBatch = 100;
        readyToProcess = !preventRequestProcessing;
        trackTime = true;
        metrics = {};
        lastParams = {};
        maxKeyLength = 128;
        maxValueSize = 256;
        maxSegmentationValues = 30;
        maxBreadcrumbCount = 100;
        maxStackTraceLinesPerThread = 30;
        maxStackTraceLineLength = 200;
        __data = {};
        deviceIdType = null;

        // cc DEBUG
        cc.debug = false;
        cc.debugBulk = false;
        cc.debugBulkUser = false;

        // CONSENTS
        consents = {};
        for (var a = 0; a < Countly.features.length; a++) {
            consents[Countly.features[a]] = {};
        }

        // device_id
        Countly.device_id = undefined;
        Countly.remote_config = undefined;
        Countly.require_consent = false;
        Countly.debug = undefined;
        Countly.app_key = undefined;
        Countly.url = undefined;
        Countly.app_version = undefined;
        Countly.country_code = undefined;
        Countly.city = undefined;
        Countly.ip_address = undefined;
        Countly.force_post = undefined;
        Countly.storage_path = undefined;
        Countly.require_consent = undefined;
        Countly.http_options = undefined;

        asyncWriteLock = false;
        asyncWriteQueue = [];
    };

    /**
    * Modify feature groups for consent management. Allows you to group multiple features under one feature group
    * @param {object} features - object to define feature name as key and core features as value
    * @example <caption>Adding all features under one group</caption>
    * Countly.group_features({all:["sessions","events","views","crashes","attribution","users"]});
    * //After this call Countly.add_consent("all") to allow all features
    @example <caption>Grouping features</caption>
    * Countly.group_features({
    *    activity:["sessions","events","views"],
    *    info:["attribution","users"]
    * });
    * //After this call Countly.add_consent("activity") to allow "sessions","events","views"
    * //or call Countly.add_consent("info") to allow "attribution","users"
    * //or call Countly.add_consent("crashes") to allow some separate feature
    */
    Countly.group_features = function(features) {
        if (features) {
            for (var i in features) {
                if (!consents[i]) {
                    cc.log(cc.logLevelEnums.INFO, "group_features, Trying to group the features.");
                    if (typeof features[i] === "string") {
                        consents[i] = { features: [features[i]] };
                    }
                    else if (features[i] && features[i].constructor === Array && features[i].length) {
                        consents[i] = { features: features[i] };
                    }
                    else {
                        cc.log(cc.logLevelEnums.WARNING, `group_features, Incorrect feature list for: [${i}] value: [${features[i]}].`);
                    }
                }
                else {
                    cc.log(cc.logLevelEnums.WARNING, `group_features, Feature name: [${i}] is already reserved.`);
                }
            }
        }
        else {
            cc.log(cc.logLevelEnums.ERROR, `group_features, Incorrect features value provided: [${features}].`);
        }
    };

    /**
    * Check if consent is given for specific feature (either core feature of from custom feature group)
    * @param {string} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link Countly.group_features}
    * @returns {bool} true if consent is given, false if not
    */
    Countly.check_consent = function(feature) {
        if (!Countly.require_consent) {
            // we don't need to have specific consents
            cc.log(cc.logLevelEnums.INFO, `check_consent, Require consent is off. Giving consent for: [${feature}] feature.`);
            return true;
        }
        if (consents[feature] && consents[feature].optin) {
            cc.log(cc.logLevelEnums.INFO, `check_consent, Giving consent for: [${feature}] feature.`);
            return true;
        }
        if (consents[feature] && !consents[feature].optin) {
            cc.log(cc.logLevelEnums.ERROR, `check_consent, User is not optin. Consent refused for: [${feature}] feature.`);
            return false;
        }

        cc.log(cc.logLevelEnums.ERROR, `check_consent, No feature available for: [${feature}].`);

        return false;
    };

    /**
    * Check if any consent is given, for some cases, when crucial parts are like device_id are needed for any request
    * @returns {bool} true if any consent is given, false if not
    */
    Countly.check_any_consent = function() {
        if (!Countly.require_consent) {
            cc.log(cc.logLevelEnums.INFO, "check_any_consent, require_consent is off, no consent is necessary.");

            // we don't need to have consents
            return true;
        }
        for (var i in consents) {
            if (consents[i] && consents[i].optin) {
                cc.log(cc.logLevelEnums.INFO, `check_any_consent, found consent for: [${consents[i]}].`);
                return true;
            }
        }
        cc.log(cc.logLevelEnums.WARNING, "check_any_consent, no consent is given yet.");

        return false;
    };

    /**
     * Enable/disable logging, to be used after init
     * @param {boolean} enableLogging - if true logging is enabled
     */
    Countly.setLoggingEnabled = function(enableLogging) {
        cc.debug = enableLogging;
    };

    /**
    * Add consent for specific feature, meaning, user allowed to track that data (either core feature of from custom feature group)
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link Countly.group_features}
    */
    Countly.add_consent = function(feature) {
        cc.log(cc.logLevelEnums.INFO, `add_consent, Adding consent for: [${feature}].`);
        if (feature.constructor === Array) {
            for (var i = 0; i < feature.length; i++) {
                Countly.add_consent(feature[i]);
            }
        }
        else if (consents[feature]) {
            if (consents[feature].features) {
                consents[feature].optin = true;
                // this is added group, let's iterate through sub features
                Countly.add_consent(consents[feature].features);
            }
            else {
                // this is core feature
                if (consents[feature].optin !== true) {
                    consents[feature].optin = true;
                    updateConsent();
                    setTimeout(() => {
                        if (feature === "sessions" && lastParams.begin_session) {
                            Countly.begin_session.apply(Countly, lastParams.begin_session);
                            lastParams.begin_session = null;
                        }
                        else if (feature === "views" && lastParams.track_pageview) {
                            lastView = null;
                            Countly.track_pageview.apply(Countly, lastParams.track_pageview);
                            lastParams.track_pageview = null;
                        }
                        if (lastParams.change_id) {
                            Countly.change_id.apply(Countly, lastParams.change_id);
                            lastParams.change_id = null;
                        }
                    }, 1);
                }
            }
        }
        else {
            cc.log(cc.logLevelEnums.WARNING, `add_consent, No feature available for: [${feature}].`);
        }
    };

    /**
    * Remove consent for specific feature, meaning, user opted out to track that data (either core feature of from custom feature group)
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or custom provided through {@link Countly.group_features}
    */
    Countly.remove_consent = function(feature) {
        cc.log(cc.logLevelEnums.INFO, `remove_consent, Removing consent for: [${feature}].`);
        Countly.remove_consent_internal(feature, true);
    };

    /**
    * Remove consent internally for specific feature,so that a request wont be sent for the operation
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or custom provided through {@link CountlyBulkUser.group_features}
    * @param {Boolean} enforceConsentUpdate - regulates if a request will be sent to the server or not. If true, removing consents will send a request to the server and if false, consents will be removed without a request 
    */
    Countly.remove_consent_internal = function(feature, enforceConsentUpdate) {
        // if true updateConsent will execute when possible
        enforceConsentUpdate = enforceConsentUpdate || false;
        if (feature.constructor === Array) {
            for (var i = 0; i < feature.length; i++) {
                Countly.remove_consent_internal(feature[i], enforceConsentUpdate);
            }
        }
        else if (consents[feature]) {
            if (consents[feature].features) {
                // this is added group, let's iterate through sub features
                Countly.remove_consent_internal(consents[feature].features, enforceConsentUpdate);
            }
            else {
                consents[feature].optin = false;
                // this is core feature
                if (enforceConsentUpdate && consents[feature].optin !== false) {
                    updateConsent();
                }
            }
        }
        else {
            cc.log(cc.logLevelEnums.WARNING, `remove_consent, No feature available for: [${feature}].`);
        }
    };

    var consentTimer;
    var updateConsent = function() {
        if (consentTimer) {
            // delay syncing consents
            clearTimeout(consentTimer);
            consentTimer = null;
        }
        consentTimer = setTimeout(() => {
            var consentMessage = {};
            for (var i = 0; i < Countly.features.length; i++) {
                if (consents[Countly.features[i]].optin === true) {
                    consentMessage[Countly.features[i]] = true;
                }
                else {
                    consentMessage[Countly.features[i]] = false;
                }
            }
            toRequestQueue({ consent: JSON.stringify(consentMessage) });
            cc.log(cc.logLevelEnums.DEBUG, "updateConsent, Consent update request has been sent to the queue.");
        }, 1000);
    };

    /**
    * Start session
    * @param {boolean} noHeartBeat - true if you don't want to use internal heartbeat to manage session
    */

    Countly.begin_session = function(noHeartBeat) {
        if (Countly.check_consent("sessions")) {
            if (!sessionStarted) {
                cc.log(cc.logLevelEnums.INFO, "begin_session, Session started.");
                lastBeat = cc.getTimestamp();
                sessionStarted = true;
                autoExtend = !(noHeartBeat);
                var req = {};
                req.begin_session = 1;
                req.metrics = JSON.stringify(getMetrics());
                toRequestQueue(req);
            }
        }
        else {
            lastParams.begin_session = arguments;
        }
    };

    /**
    * Report session duration
    * @param {int} sec - amount of seconds to report for current session
    */
    Countly.session_duration = function(sec) {
        if (Countly.check_consent("sessions")) {
            if (sessionStarted) {
                cc.log(cc.logLevelEnums.INFO, `session_duration, Session duration: [${sec}] seconds.`);
                toRequestQueue({ session_duration: sec });
            }
        }
    };

    /**
    * End current session
    * @param {int} sec - amount of seconds to report for current session, before ending it
    */
    Countly.end_session = function(sec) {
        if (Countly.check_consent("sessions")) {
            if (sessionStarted) {
                sec = sec || cc.getTimestamp() - lastBeat;
                cc.log(cc.logLevelEnums.INFO, `end_session, Ending session. Duration: [${sec}] seconds.`);
                reportViewDuration();
                sessionStarted = false;
                toRequestQueue({ end_session: 1, session_duration: sec });
            }
        }
    };

    /**
    * Check and return the current device id type
    * @returns {number} a number that indicates the device id type
    */
    Countly.get_device_id_type = function() {
        cc.log(cc.logLevelEnums.INFO, `check_device_id_type, Retrieving the current device id type: [${deviceIdType}].`);
        return deviceIdType;
    };

    /**
    * Gets the current device id
    * @returns {string} device id
    */
    Countly.get_device_id = function() {
        cc.log(cc.logLevelEnums.INFO, `get_device_id, Retrieving the device id: [${Countly.device_id}].`);
        return Countly.device_id;
    };

    /**
    * Change current user/device id
    * @param {string} newId - new user/device ID to use
    * @param {boolean=} merge - move data from old ID to new ID on server
    * */
    Countly.change_id = function(newId, merge) {
        newId = cc.truncateSingleValue(newId, Countly.maxValueSize, "change_id", Countly.debug);
        cc.log(cc.logLevelEnums.INFO, `change_id, Changing ID. Current ID: [${Countly.device_id}], new ID: [${newId}], merge: [${merge}].`);
        if (cluster.isMaster) {
            if (Countly.device_id !== newId) {
                if (!merge) {
                    // empty event queue
                    if (eventQueue.length > 0) {
                        toRequestQueue({ events: JSON.stringify(eventQueue) });
                        eventQueue = [];
                        storeSet("cly_event", eventQueue);
                    }
                    // end current session
                    Countly.end_session();
                    // clear timed events
                    timedEvents = {};
                    // clear all consents
                    Countly.remove_consent_internal(Countly.features, false);
                }
                var oldId = Countly.device_id;
                Countly.device_id = newId;
                deviceIdType = cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED;
                storeSet("cly_id", Countly.device_id);
                storeSet("cly_id_type", deviceIdType);
                if (merge) {
                    if (Countly.check_any_consent()) {
                        toRequestQueue({ old_device_id: oldId });
                    }
                    else {
                        lastParams.change_id = arguments;
                    }
                }
                else {
                    // start new session for new id
                    Countly.begin_session(!autoExtend);
                }
                if (Countly.remote_config) {
                    remoteConfigs = {};
                    if (cluster.isMaster) {
                        storeSet("cly_remote_configs", remoteConfigs);
                    }
                    Countly.fetch_remote_config(Countly.remote_config);
                }
            }
        }
        else {
            process.send({ cly: { change_id: newId, merge } });
        }
    };

    /**
    * Report custom event
    * @param {Event} event - Countly {@link Event} object
    * @param {string} event.key - name or id of the event
    * @param {number} [event.count=1] - how many times did event occur
    * @param {number=} event.sum - sum to report with event (if any)
    * @param {number=} event.dur - duration to report with event (if any)
    * @param {Object=} event.segmentation - object with segments key /values
    * */
    Countly.add_event = function(event) {
        cc.log(`Trying to add the event: [${event.key}].`);
        // initially no consent is given
        var respectiveConsent = false;
        // to match the internal events and their respective required consents. Sets respectiveConsent to true if the consent is given
        switch (event.key) {
        case cc.internalEventKeyEnums.NPS:
            respectiveConsent = Countly.check_consent('feedback');
            break;
        case cc.internalEventKeyEnums.SURVEY:
            respectiveConsent = Countly.check_consent('feedback');
            break;
        case cc.internalEventKeyEnums.STAR_RATING:
            respectiveConsent = Countly.check_consent('star-rating');
            break;
        case cc.internalEventKeyEnums.VIEW:
            respectiveConsent = Countly.check_consent('views');
            break;
        case cc.internalEventKeyEnums.ORIENTATION:
            respectiveConsent = Countly.check_consent('users');
            break;
        case cc.internalEventKeyEnums.PUSH_ACTION:
            respectiveConsent = Countly.check_consent('push');
            break;
        case cc.internalEventKeyEnums.ACTION:
            respectiveConsent = Countly.check_consent('clicks') || Countly.check_consent('scroll');
            break;
        default:
            respectiveConsent = Countly.check_consent('events');
        }
        // if consent is given adds event to the queue
        if (respectiveConsent) {
            add_cly_events(event);
        }
    };
    /**
    *  Add events to event queue
    *  @memberof Countly._internals
    *  @param {Event} event - countly event
    */
    function add_cly_events(event) {
        if (!event.key) {
            cc.log(cc.logLevelEnums.ERROR, "add_cly_events, Event must have 'key' property.");
            return;
        }
        if (cluster.isMaster) {
            if (!event.count) {
                event.count = 1;
            }
            event.key = cc.truncateSingleValue(event.key, Countly.maxKeyLength, "add_cly_event", Countly.debug);
            event.segmentation = cc.truncateObject(event.segmentation, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "add_cly_event", Countly.debug);
            var props = ["key", "count", "sum", "dur", "segmentation"];
            var e = cc.getProperties(event, props);
            e.timestamp = getMsTimestamp();
            var date = new Date();
            e.hour = date.getHours();
            e.dow = date.getDay();
            cc.log(cc.logLevelEnums.DEBUG, "add_cly_events, Adding event: ", event);
            eventQueue.push(e);
            storeSet("cly_event", eventQueue);
        }
        else {
            process.send({ cly: { event } });
        }
    }

    /**
    * Start timed event, which will fill in duration property upon ending automatically
    * @param {string} key - event name that will be used as key property
    * */
    Countly.start_event = function(key) {
        key = cc.truncateSingleValue(key, Countly.maxKeyLength, "start_event", Countly.debug);
        if (timedEvents[key]) {
            cc.log(cc.logLevelEnums.ERROR, `start_event, Timed event with key: [${key}] already exists.`);
            return;
        }
        cc.log(cc.logLevelEnums.INFO, `start_event, Timer for timed event with key: [${key}] starting.`);

        timedEvents[key] = cc.getTimestamp();
    };

    /**
    * End timed event
    * @param {string|Object} event - event key if string or Countly event same as passed to {@link Countly.add_event}
    * */
    Countly.end_event = function(event) {
        if (typeof event === "string") {
            event = cc.truncateSingleValue(event, Countly.maxKeyLength, "end_event", Countly.debug);
            event = { key: event };
        }
        if (!event.key) {
            cc.log(cc.logLevelEnums.ERROR, "end_event, Event must have 'key' property.");
            return;
        }
        if (!timedEvents[event.key]) {
            cc.log(cc.logLevelEnums.ERROR, `end_event, Timed event with key: [${event.key}] does not exist.`);
            return;
        }
        event.key = cc.truncateSingleValue(event.key, Countly.maxKeyLength, "end_event");
        cc.log(cc.logLevelEnums.INFO, `end_event, Timer for timed event with key: [${event.key}] is stopping.`);

        event.dur = cc.getTimestamp() - timedEvents[event.key];
        Countly.add_event(event);
        delete timedEvents[event.key];
    };

    /**
    * Report user data
    * @param {Object} user - Countly {@link UserDetails} object
    * @param {string=} user.name - user's full name
    * @param {string=} user.username - user's username or nickname
    * @param {string=} user.email - user's email address
    * @param {string=} user.organization - user's organization or company
    * @param {string=} user.phone - user's phone number
    * @param {string=} user.picture - url to user's picture
    * @param {string=} user.gender - M value for male and F value for femail
    * @param {number=} user.byear - user's birth year used to calculate current age
    * @param {Object=} user.custom - object with custom key value properties you want to save with user
    * */
    Countly.user_details = function(user) {
        cc.log(cc.logLevelEnums.INFO, "user_details, Adding user details: ", user);
        if (Countly.check_consent("users")) {
            var props = ["name", "username", "email", "organization", "phone", "picture", "gender", "byear", "custom"];
            user.name = cc.truncateSingleValue(user.name, Countly.maxValueSize, "user_details", Countly.debug);
            user.username = cc.truncateSingleValue(user.username, Countly.maxValueSize, "user_details", Countly.debug);
            user.email = cc.truncateSingleValue(user.email, Countly.maxValueSize, "user_details", Countly.debug);
            user.organization = cc.truncateSingleValue(user.organization, Countly.maxValueSize, "user_details", Countly.debug);
            user.phone = cc.truncateSingleValue(user.phone, Countly.maxValueSize, "user_details", Countly.debug);
            user.picture = cc.truncateSingleValue(user.picture, 4096, "user_details", Countly.debug);
            user.gender = cc.truncateSingleValue(user.gender, Countly.maxValueSize, "user_details", Countly.debug);
            user.byear = cc.truncateSingleValue(user.byear, Countly.maxValueSize, "user_details", Countly.debug);
            user.custom = cc.truncateObject(user.custom, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "user_details");
            toRequestQueue({ user_details: JSON.stringify(cc.getProperties(user, props)) });
        }
    };

    /** ************************
    * Modifying custom property values of user details
    * Possible modification commands
    *  - inc, to increment existing value by provided value
    *  - mul, to multiply existing value by provided value
    *  - max, to select maximum value between existing and provided value
    *  - min, to select minimum value between existing and provided value
    *  - setOnce, to set value only if it was not set before
    *  - push, creates an array property, if property does not exist, and adds value to array
    *  - pull, to remove value from array property
    *  - addToSet, creates an array property, if property does not exist, and adds unique value to array, only if it does not yet exist in array
    ************************* */
    var customData = {};
    var change_custom_property = function(key, value, mod) {
        key = cc.truncateSingleValue(key, Countly.maxKeyLength, "change_custom_property", Countly.debug);
        value = cc.truncateSingleValue(value, Countly.maxValueSize, "change_custom_property", Countly.debug);

        if (Countly.check_consent("users")) {
            if (!customData[key]) {
                customData[key] = {};
            }
            if (mod === "$push" || mod === "$pull" || mod === "$addToSet") {
                if (!customData[key][mod]) {
                    customData[key][mod] = [];
                }
                customData[key][mod].push(value);
            }
            else {
                customData[key][mod] = value;
            }
        }
    };

    /**
    * Control user related custom properties. Don't forget to call save after finishing manipulation of custom data
    * @namespace Countly.userData
    * @name Countly.userData
    * @example
    * //set custom key value property
    * Countly.userData.set("twitter", "ar2rsawseen");
    * //create or increase specific number property
    * Countly.userData.increment("login_count");
    * //add new value to array property if it is not already there
    * Countly.userData.push_unique("selected_category", "IT");
    * //send all custom property modified data to server
    * Countly.userData.save();
    */
    Countly.userData = {
        /**
        * Sets user's custom property value
        * @param {string} key - name of the property to attach to user
        * @param {string|number} value - value to store under provided property
        * */
        set(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "set", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "set", Countly.debug);
            customData[key] = value;
        },
        /**
        * Sets user's custom property value only if it was not set before
        * @param {string} key - name of the property to attach to user
        * @param {string|number} value - value to store under provided property
        * */
        set_once(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "set_once", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "set_once", Countly.debug);
            change_custom_property(key, value, "$setOnce");
        },
        /**
        * Unset's/delete's user's custom property
        * @param {string} key - name of the property to delete
        * */
        unset(key) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "unset", Countly.debug);
            customData[key] = "";
        },
        /**
        * Increment value under the key of this user's custom properties by one
        * @param {string} key - name of the property to attach to user
        * */
        increment(key) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "increment", Countly.debug);
            change_custom_property(key, 1, "$inc");
        },
        /**
        * Increment value under the key of this user's custom properties by provided value
        * @param {string} key - name of the property to attach to user
        * @param {number} value - value by which to increment server value
        * */
        increment_by(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "increment_by", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "increment_by", Countly.debug);
            change_custom_property(key, value, "$inc");
        },
        /**
        * Multiply value under the key of this user's custom properties by provided value
        * @param {string} key - name of the property to attach to user
        * @param {number} value - value by which to multiply server value
        * */
        multiply(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "multiply", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "multiply", Countly.debug);
            change_custom_property(key, value, "$mul");
        },
        /**
        * Save maximal value under the key of this user's custom properties
        * @param {string} key - name of the property to attach to user
        * @param {number} value - value which to compare to server's value and store maximal value of both provided
        * */
        max(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "max", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "max", Countly.debug);
            change_custom_property(key, value, "$max");
        },
        /**
        * Save minimal value under the key of this user's custom properties
        * @param {string} key - name of the property to attach to user
        * @param {number} value - value which to compare to server's value and store minimal value of both provided
        * */
        min(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "min", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "min", Countly.debug);
            change_custom_property(key, value, "$min");
        },
        /**
        * Add value to array under the key of this user's custom properties. If property is not an array, it will be converted to array
        * @param {string} key - name of the property to attach to user
        * @param {string|number} value - value which to add to array
        * */
        push(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "push", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "push", Countly.debug);
            change_custom_property(key, value, "$push");
        },
        /**
        * Add value to array under the key of this user's custom properties, storing only unique values. If property is not an array, it will be converted to array
        * @param {string} key - name of the property to attach to user
        * @param {string|number} value - value which to add to array
        * */
        push_unique(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "push_unique", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "push_unique", Countly.debug);
            change_custom_property(key, value, "$addToSet");
        },
        /**
        * Remove value from array under the key of this user's custom properties
        * @param {string} key - name of the property
        * @param {string|number} value - value which to remove from array
        * */
        pull(key, value) {
            key = cc.truncateSingleValue(key, Countly.maxKeyLength, "pull", Countly.debug);
            value = cc.truncateSingleValue(value, Countly.maxValueSize, "pull", Countly.debug);
            change_custom_property(key, value, "$pull");
        },
        /**
        * Save changes made to user's custom properties object and send them to server
        * */
        save() {
            if (Countly.check_consent("users")) {
                toRequestQueue({ user_details: JSON.stringify({ custom: customData }) });
            }
            customData = {};
        },
    };

    /**
    * Report user conversion to the server (when user signup or made a purchase, or whatever your conversion is)
    * @param {string} campaign_id - id of campaign, the last part of the countly campaign link
    * @param {string=} campaign_user_id - id of user's clicked on campaign link, if you have one
    * */
    Countly.report_conversion = function(campaign_id, campaign_user_id) {
        if (Countly.check_consent("attribution")) {
            if (campaign_id && campaign_user_id) {
                campaign_id = cc.truncateSingleValue(campaign_id, Countly.maxValueSize, "report_conversion", Countly.debug);
                campaign_user_id = cc.truncateSingleValue(campaign_user_id, Countly.maxValueSize, "report_conversion", Countly.debug);
                toRequestQueue({ campaign_id: campaign_id, campaign_user: campaign_user_id });
                cc.log(cc.logLevelEnums.INFO, `report_conversion, Conversion reported with campaign ID: [${campaign_id}] and campaign user ID: [${campaign_user_id}].`);
            }
            else if (campaign_id) {
                campaign_id = cc.truncateSingleValue(campaign_id, Countly.maxValueSize, "report_conversion", Countly.debug);
                toRequestQueue({ campaign_id: campaign_id });
                cc.log(cc.logLevelEnums.INFO, `report_conversion, Conversion reported with campaign ID: [${campaign_id}].`);
            }
            else {
                cc.log(cc.logLevelEnums.ERROR, "report_conversion, No campaign ID found.");
            }
        }
    };

    /**
    * Provide information about user
    * @param {Object} feedback - object with feedback properties
    * @param {string} feedback.widget_id - id of the widget in the dashboard
    * @param {boolean=} feedback.contactMe - did user give consent to contact him
    * @param {string=} feedback.platform - user's platform (will be filled if not provided)
    * @param {string=} feedback.app_version - app's app version (will be filled if not provided)
    * @param {number} feedback.rating - user's rating
    * @param {string=} feedback.email - user's email
    * @param {string=} feedback.comment - user's comment
    * */
    Countly.report_feedback = function(feedback) {
        if (Countly.check_consent("star-rating") || Countly.check_consent("feedback")) {
            if (!feedback.widget_id) {
                cc.log(cc.logLevelEnums.ERROR, "report_feedback, Feedback must contain 'widget_id' property.");
                return;
            }
            if (!feedback.rating) {
                cc.log(cc.logLevelEnums.ERROR, "report_feedback, Feedback must contain 'rating' property.");
                return;
            }
            if (Countly.check_consent("events")) {
                var props = ["widget_id", "contactMe", "platform", "app_version", "rating", "email", "comment"];
                var event = {
                    key: cc.internalEventKeyEnums.STAR_RATING,
                    count: 1,
                    segmentation: {},
                };
                event.segmentation = cc.getProperties(feedback, props);
                if (!event.segmentation.app_version) {
                    event.segmentation.app_version = metrics._app_version || Countly.app_version;
                }
                cc.log(cc.logLevelEnums.INFO, "report_feedback, Reporting feedback: ", event);
                Countly.add_event(event);
            }
        }
    };

    /**
    * Automatically track javascript errors that happen on the nodejs process
    * @param {object=} segments - additional key value pairs you want to provide with error report, like versions of libraries used, etc.
    * */
    Countly.track_errors = function(segments) {
        cc.log(cc.logLevelEnums.INFO, `track_errors, Tracking errors. Segments provided: [${segments}].`);

        crashSegments = segments;
        process.on("uncaughtException", (err) => {
            recordError(err, false);
            if (cluster.isMaster) {
                forceStore();
            }
            // eslint-disable-next-line no-console
            console.error(`${(new Date()).toUTCString()} uncaughtException:`, err.message);
            // eslint-disable-next-line no-console
            console.error(err.stack);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            var err = new Error(`Unhandled rejection (reason: ${reason && reason.stack ? reason.stack : reason}).`);
            recordError(err, false);
            if (cluster.isMaster) {
                forceStore();
            }
            // eslint-disable-next-line no-console
            console.error(`${(new Date()).toUTCString()} unhandledRejection:`, err.message);
            // eslint-disable-next-line no-console
            console.error(err.stack);
        });
    };

    /**
    * Log an exception that you catched through try and catch block and handled yourself and just want to report it to server
    * @param {Object} err - error exception object provided in catch block
    * @param {string=} segments - additional key value pairs you want to provide with error report, like versions of libraries used, etc.
    * */
    Countly.log_error = function(err, segments) {
        cc.log(cc.logLevelEnums.INFO, `log_error, Logging error: [${err}].`);

        recordError(err, true, segments);
    };

    /**
    * Add new line in the log of breadcrumbs of what was done did, will be included together with error report
    * @param {string} record - any text describing an action
    * */
    Countly.add_log = function(record) {
        if (Countly.check_consent("crashes")) {
            record = cc.truncateSingleValue(record, Countly.maxValueSize, "add_log", Countly.debug);
            if (crashLogs.length > Countly.maxBreadcrumbCount) {
                crashLogs.shift();
                cc.log(cc.logLevelEnums.DEBUG, "add_log, Breadcrumbs overflowed. Erasing the oldest.");
            }
            crashLogs.push(record);
            cc.log(cc.logLevelEnums.INFO, `add_log, Added breadcrumb: [${record}].`);
        }
    };

    /**
    * Fetch remote config
    * @param {array=} keys - Array of keys to fetch, if not provided will fetch all keys
    * @param {array=} omit_keys - Array of keys to omit, if provided will fetch all keys except provided ones
    * @param {function=} callback - Callback to notify with first param error and second param remote config object
    * */
    Countly.fetch_remote_config = function(keys, omit_keys, callback) {
        if (Countly.check_consent("remote-config")) {
            var request = {
                method: "fetch_remote_config",
            };
            if (Countly.check_consent("sessions")) {
                request.metrics = JSON.stringify(getMetrics());
            }
            if (keys) {
                if (!callback && typeof keys === "function") {
                    callback = keys;
                    keys = null;
                }
                else if (Array.isArray(keys) && keys.length) {
                    request.keys = JSON.stringify(keys);
                }
            }
            if (omit_keys) {
                if (!callback && typeof omit_keys === "function") {
                    callback = omit_keys;
                    omit_keys = null;
                }
                else if (Array.isArray(omit_keys) && omit_keys.length) {
                    request.omit_keys = JSON.stringify(omit_keys);
                }
            }
            prepareRequest(request);
            makeRequest(Countly.url, readPath, request, (err, params, responseText) => {
                try {
                    var configs = JSON.parse(responseText);
                    if (request.keys || request.omit_keys) {
                        // we merge config
                        for (var i in configs) {
                            remoteConfigs[i] = configs[i];
                        }
                    }
                    else {
                        // we replace config
                        remoteConfigs = configs;
                    }
                    if (cluster.isMaster) {
                        storeSet("cly_remote_configs", remoteConfigs);
                        cc.log(cc.logLevelEnums.INFO, `fetch_remote_config, Fetched remote config: [${remoteConfigs}].`);
                    }
                }
                catch (ex) {
                    // silent catch
                }
                if (typeof callback === "function") {
                    callback(err, remoteConfigs);
                }
            }, "fetch_remote_config", true);
        }
        else {
            cc.log(cc.logLevelEnums.ERROR, "fetch_remote_config, Remote config consent not given.");
            if (typeof callback === "function") {
                callback(new Error("Remote config requires explicit consent"), remoteConfigs);
            }
        }
    };

    /**
    * Get Remote config object or specific value for provided key
    * @param {string=} key - if provided, will return value for key, or return whole object
    * @returns {varies} remote config value
    * */
    Countly.get_remote_config = function(key) {
        if (typeof key !== "undefined") {
            cc.log(cc.logLevelEnums.INFO, `get_remote_config, Returning remote config with key: [${key}].`);
            return remoteConfigs[key];
        }
        cc.log(cc.logLevelEnums.INFO, "get_remote_config, Returning all remote configs.");

        return remoteConfigs;
    };

    /**
    * Stop tracking duration time for this user/device
    * */
    Countly.stop_time = function() {
        cc.log(cc.logLevelEnums.INFO, "stop_time, Stopping time.");

        trackTime = false;
        storedDuration = cc.getTimestamp() - lastBeat;
        lastViewStoredDuration = cc.getTimestamp() - lastViewTime;
    };

    /**
    * Start tracking duration time for this user/device, by default it is automatically if you scalled (@link begin_session)
    * */
    Countly.start_time = function() {
        cc.log(cc.logLevelEnums.INFO, "start_time, Starting time.");

        trackTime = true;
        lastBeat = cc.getTimestamp() - storedDuration;
        lastViewTime = cc.getTimestamp() - lastViewStoredDuration;
        lastViewStoredDuration = 0;
    };

    /**
    * Track which parts of application user visits
    * @param {string=} name - optional name of the view
    * @param {object=} viewSegments - optional key value object with segments to report with the view
    * */
    Countly.track_view = function(name, viewSegments) {
        reportViewDuration();
        if (name) {
            name = cc.truncateSingleValue(name, Countly.maxValueSize, "track_view", Countly.debug);
            cc.log(cc.logLevelEnums.INFO, `track_view, Tracking view. Name: [${name}].`);
            lastView = name;
            lastViewTime = cc.getTimestamp();
            if (!platform) {
                getMetrics();
            }
            var segments = {
                name,
                visit: 1,
                segment: platform,
            };

            if (viewSegments) {
                viewSegments = cc.truncateObject(viewSegments, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "track_view", Countly.debug);

                for (var key in viewSegments) {
                    if (typeof segments[key] === "undefined") {
                        segments[key] = viewSegments[key];
                    }
                }
            }

            // track pageview
            if (Countly.check_consent("views")) {
                add_cly_events({
                    key: cc.internalEventKeyEnums.VIEW,
                    segmentation: segments,
                });
            }
            else {
                lastParams.track_pageview = arguments;
            }
            return;
        }
        cc.log(cc.logLevelEnums.ERROR, `track_view, No view name given for tracking. Aborting.`);
    };

    /**
    * Track which parts of application user visits. Alias of {@link track_view} method for compatability with Web SDK
    * @param {string=} name - optional name of the view
    * @param {object=} viewSegments - optional key value object with segments to report with the view
    * */
    Countly.track_pageview = function(name, viewSegments) {
        Countly.track_view(name, viewSegments);
    };

    /**
     * Report performance trace
     * @param {Object} trace - apm trace object
     * @param {string} trace.type - device or network
     * @param {string} trace.name - url or view of the trace
     * @param {number} trace.stz - start timestamp
     * @param {number} trace.etz - end timestamp
     * @param {Object} trace.app_metrics - key/value metrics like duration, to report with trace where value is number
     * @param {Object=} trace.apm_attr - object profiling attributes (not yet supported)
     */
    Countly.report_trace = function(trace) {
        if (Countly.check_consent("apm")) {
            trace.name = cc.truncateSingleValue(trace.name, Countly.maxKeyLength, "report_trace", Countly.debug);
            trace.app_metrics = cc.truncateObject(trace.app_metrics, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "report_trace", Countly.debug);
            var props = ["type", "name", "stz", "etz", "apm_metrics", "apm_attr"];
            for (var i = 0; i < props.length; i++) {
                if (props[i] !== "apm_attr" && typeof trace[props[i]] === "undefined") {
                    cc.log(cc.logLevelEnums.WARNING, `report_trace, APM trace must have a: [${props[i]}].`);
                    return;
                }
            }

            var e = cc.getProperties(trace, props);
            e.timestamp = trace.stz;
            var date = new Date();
            e.hour = date.getHours();
            e.dow = date.getDay();
            toRequestQueue({ apm: JSON.stringify(e) });
            cc.log(cc.logLevelEnums.DEBUG, "report_trace, Adding APM trace: ", e);
            return;
        }
        cc.log(cc.logLevelEnums.ERROR, "report_trace, APM consent not given. Aborting.");
    };

    /**
     *  Report time passed since app start trace
     */
    Countly.report_app_start = function() {
        cc.log(cc.logLevelEnums.INFO, "report_app_start, Reporting app start.");

        // do on next tick to allow synchronous code to load
        process.nextTick(() => {
            var start = Math.floor(process.uptime() * 1000);
            var end = Date.now();
            Countly.report_trace({
                type: "device",
                name: process.title || process.argv.join(" "),
                stz: start,
                etz: end,
                app_metrics: {
                    duration: end - start,
                },
            });
        });
    };

    /**
    * Make raw request with provided parameters
    * @example Countly.request({app_key:"somekey", devide_id:"someid", events:"[{'key':'val','count':1}]", begin_session:1});
    * @param {Object} request - object with key/values which will be used as request parameters
    * */
    Countly.request = function(request) {
        request = cc.truncateObject(request, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "request", Countly.debug);

        if (!request.app_key || !request.device_id) {
            cc.log(cc.logLevelEnums.ERROR, "request, app_key or device_id is missing.");
            return;
        }
        if (cluster.isMaster) {
            cc.log(cc.logLevelEnums.INFO, "request, Adding the raw request to the queue.");
            requestQueue.push(request);
            storeSet("cly_queue", requestQueue);
        }
        else {
            cc.log(cc.logLevelEnums.INFO, "request, Sending message to the parent process. Adding the raw request to the queue.");
            process.send({ cly: { request: request } });
        }
    };

    /**
    *  PRIVATE METHODS
    * */

    /**
    *  Report duration of how long user was on this view
    */
    function reportViewDuration() {
        if (lastView) {
            if (!platform) {
                getMetrics();
            }
            var segments = {
                name: lastView,
                segment: platform,
            };

            // track pageview
            if (Countly.check_consent("views")) {
                add_cly_events({
                    key: cc.internalEventKeyEnums.VIEW,
                    dur: cc.getTimestamp() - lastViewTime,
                    segmentation: segments,
                });
            }
            lastView = null;
        }
    }

    /**
    *  Prepare request params by adding common properties to it
    *  @param {Object} request - request object
    */
    function prepareRequest(request) {
        request.app_key = Countly.app_key;
        request.device_id = Countly.device_id;
        request.sdk_name = SDK_NAME;
        request.sdk_version = SDK_VERSION;
        request.t = deviceIdType;
        if (Countly.check_consent("location")) {
            if (Countly.country_code) {
                request.country_code = Countly.country_code;
            }
            if (Countly.city) {
                request.city = Countly.city;
            }
            if (Countly.ip_address !== null) {
                request.ip_address = Countly.ip_address;
            }
        }
        else {
            request.location = "";
        }

        request.timestamp = getMsTimestamp();
        var date = new Date();
        request.hour = date.getHours();
        request.dow = date.getDay();
    }

    /**
    *  Add request to request queue
    *  @param {Object} request - object with request parameters
    */
    function toRequestQueue(request) {
        if (cluster.isMaster) {
            if (!Countly.app_key || !Countly.device_id) {
                cc.log(cc.logLevelEnums.ERROR, "toRequestQueue, app_key or device_id is missing.");
                return;
            }
            prepareRequest(request);

            if (requestQueue.length > queueSize) {
                cc.log(cc.logLevelEnums.WARNING, "toRequestQueue, Queue overflown. Erasing earliest request from the queue.");
                requestQueue.shift();
            }

            cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Adding request to the queue.");
            requestQueue.push(request);
            storeSet("cly_queue", requestQueue);
        }
        else {
            cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Sending message to the parent process. Adding request to the queue.");
            process.send({ cly: { cly_queue: request } });
        }
    }

    /**
    *  Making request making and data processing loop
    */
    function heartBeat() {
        // extend session if needed
        if (sessionStarted && autoExtend && trackTime) {
            var last = cc.getTimestamp();
            if (last - lastBeat > sessionUpdate) {
                Countly.session_duration(last - lastBeat);
                lastBeat = last;
            }
        }

        // process event queue
        if (eventQueue.length > 0) {
            if (eventQueue.length <= maxEventBatch) {
                toRequestQueue({ events: JSON.stringify(eventQueue) });
                eventQueue = [];
            }
            else {
                var events = eventQueue.splice(0, maxEventBatch);
                toRequestQueue({ events: JSON.stringify(events) });
            }
            storeSet("cly_event", eventQueue);
        }

        // process request queue with event queue
        if (requestQueue.length > 0 && readyToProcess && cc.getTimestamp() > failTimeout && !Countly.test_mode) {
            readyToProcess = false;
            var params = requestQueue.shift();
            cc.log(cc.logLevelEnums.DEBUG, "Processing the request:", params);
            makeRequest(Countly.url, apiPath, params, (err, res) => {
                cc.log(cc.logLevelEnums.DEBUG, "Request finished. Response:", res);
                if (err) {
                    requestQueue.unshift(res);
                    failTimeout = cc.getTimestamp() + failTimeoutAmount;
                    cc.log(cc.logLevelEnums.ERROR, `makeRequest, Encountered a problem while making the request: [${err}]`);
                }
                storeSet("cly_queue", requestQueue);
                readyToProcess = true;
            }, "heartBeat", false);
        }

        setTimeout(heartBeat, beatInterval);
    }

    /**
    *  Get metrics of the browser or config object
    *  @returns {Object} Metrics object
    */
    function getMetrics() {
        var m = JSON.parse(JSON.stringify(metrics));

        // getting app version
        m._app_version = m._app_version || Countly.app_version;

        m._os = m._os || os.type();
        m._os_version = m._os_version || os.release();
        platform = os.type();

        cc.log(cc.logLevelEnums.DEBUG, "getMetrics, Got metrics:", m);
        return m;
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
    *  Record and report error
    *  @param {Error} err - Error object
    *  @param {Boolean} nonfatal - nonfatal if true and false if fatal
    *  @param {Object} segments - custom crash segments
    */
    function recordError(err, nonfatal, segments) {
        if (Countly.check_consent("crashes") && err) {
            segments = segments || crashSegments;
            var error = "";
            if (typeof err === "object") {
                if (typeof err.stack !== "undefined") {
                    error = err.stack;
                }
                else {
                    if (typeof err.name !== "undefined") {
                        error += `${err.name}:`;
                    }
                    if (typeof err.message !== "undefined") {
                        error += `${err.message}\n`;
                    }
                    if (typeof err.fileName !== "undefined") {
                        error += `in ${err.fileName}\n`;
                    }
                    if (typeof err.lineNumber !== "undefined") {
                        error += `on ${err.lineNumber}`;
                    }
                    if (typeof err.columnNumber !== "undefined") {
                        error += `:${err.columnNumber}`;
                    }
                }
            }
            else {
                error = `${err}`;
            }
            segments = cc.truncateObject(segments, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "record_error", Countly.debug);
            // character limit check
            if (error.length > (Countly.maxStackTraceLineLength * Countly.maxStackTraceLinesPerThread)) {
                // convert error into an array split from each newline 
                var splittedError = error.split("\n");
                // trim the array if it is too long
                if (splittedError.length > Countly.maxStackTraceLinesPerThread) {
                    splittedError = splittedError.splice(0, Countly.maxStackTraceLinesPerThread);
                }
                // trim each line to a given limit
                for (var i = 0, len = splittedError.length; i < len; i++) {
                    if (splittedError[i].length > Countly.maxStackTraceLineLength) {
                        splittedError[i] = splittedError[i].substring(0, Countly.maxStackTraceLineLength);
                    }
                }
                // turn modified array back into error string
                error = splittedError.join("\n");
            }
            nonfatal = !!(nonfatal);
            var m = getMetrics();
            var ob = { _os: m._os, _os_version: m._os_version, _error: error, _app_version: m._app_version, _run: cc.getTimestamp() - startTime };

            ob._not_os_specific = true;
            ob._javascript = true;

            if (crashLogs.length > 0) {
                ob._logs = crashLogs.join("\n");
            }
            crashLogs = [];
            ob._nonfatal = nonfatal;

            if (typeof segments !== "undefined") {
                ob._custom = segments;
            }

            toRequestQueue({ crash: JSON.stringify(ob) });
        }
    }

    /**
    *  Making HTTP request
    *  @param {String} url - URL where to make request
    *  @param {String} api - API endpoint
    *  @param {Object} params - key value object with URL params
    *  @param {Function} callback - callback when request finished or failed
    *  @param {string} info - function name or any other information for the logs
    *  @param {Boolean} isBroad - if true a broader (more generous) response check would be implemented
    */
    function makeRequest(url, api, params, callback, info, isBroad) {
        try {
            info = info || "general";
            isBroad = isBroad || false;
            cc.log(cc.logLevelEnums.INFO, `makeRequest, Sending ${info} HTTP request`);
            var serverOptions = parseUrl(url);
            var data = prepareParams(params);
            var method = "GET";
            var options = {
                host: serverOptions.host,
                port: serverOptions.port,
                path: `${api}?${data}`,
                method: "GET",
            };

            if (data.length >= 2000 || Countly.force_post) {
                method = "POST";
            }

            if (method === "POST") {
                options.method = "POST";
                options.path = api;
                options.headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(data),
                };
            }

            if (typeof Countly.http_options === "function") {
                Countly.http_options(options);
            }
            var protocol = http;
            if (url.indexOf("https") === 0) {
                protocol = https;
            }
            var req = protocol.request(options, (res) => {
                var str = "";
                res.on("data", (chunk) => {
                    str += chunk;
                });
                res.on("end", () => {
                    cc.log(cc.logLevelEnums.DEBUG, `makeRequest, Response status code: [${res.statusCode}], response: [${str}]`);
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
                        callback(false, params, str);
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
                cc.log(cc.logLevelEnums.ERROR, "v, Connection failed. Error:", err);
                if (typeof callback === "function") {
                    callback(true, params);
                }
            });

            req.end();
        }
        catch (e) {
            // fallback
            cc.log(cc.logLevelEnums.ERROR, "makeRequest, Failed the HTTP request. Error:", e);
            if (typeof callback === "function") {
                callback(true, params);
            }
        }
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
     *  Parsing host and port information from url
     *  @param {String} url - url to which request will be made
     *  @returns {Object} Server options
     */
    function parseUrl(url) {
        var serverOptions = {
            host: "localhost",
            port: 80,
        };
        if (Countly.url.indexOf("https") === 0) {
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
     *  Handle messages from forked workers
     *  @param {Object} msg - message from worker
     */
    function handleWorkerMessage(msg) {
        if (msg.cly) {
            if (msg.cly.cly_queue) {
                toRequestQueue(msg.cly.cly_queue);
            }
            else if (msg.cly.change_id) {
                Countly.change_id(msg.cly.change_id, msg.cly.merge);
            }
            else if (msg.cly.event) {
                Countly.add_event(msg.cly.event);
            }
            else if (msg.cly.request) {
                Countly.request(msg.cly.request);
            }
        }
    }

    /**
     *  Read value from file
     *  @param {String} key - key for file
     *  @returns {varies} value in file
     */
    var readFile = function(key) {
        var dir = path.resolve(__dirname, `${Countly.storage_path}__${key}.json`);

        // try reading data file
        var data;
        try {
            data = fs.readFileSync(dir);
        }
        catch (ex) {
            // there was no file, probably new init
            data = null;
        }

        try {
            // trying to parse json string
            data = JSON.parse(data);
        }
        catch (ex) {
            // problem parsing, corrupted file?
            cc.log(cc.logLevelEnums.ERROR, `readFile, Failed to parse the file with key: [${key}]. Error: [${ex}].`);
            // backup corrupted file data
            fs.writeFile(path.resolve(__dirname, `${Countly.storage_path}__${key}.${cc.getTimestamp()}${Math.random()}.json`), data, () => {});
            // start with new clean object
            data = null;
        }
        return data;
    };

    /**
     *  Force store data synchronously on unrecoverable errors to preserve it for next launch
     */
    var forceStore = function() {
        for (var i in __data) {
            var dir = path.resolve(__dirname, `${Countly.storage_path}__${i}.json`);
            var ob = {};
            ob[i] = __data[i];
            try {
                fs.writeFileSync(dir, JSON.stringify(ob));
            }
            catch (ex) {
                // tried to save whats possible
                cc.log(cc.logLevelEnums.ERROR, `forceStore, Saving files failed. Error: [${ex}].`);
            }
        }
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
        var dir = path.resolve(__dirname, `${Countly.storage_path}__${key}.json`);
        fs.writeFile(dir, JSON.stringify(ob), (err) => {
            if (err) {
                cc.log(cc.logLevelEnums.ERROR, `writeFile, Writing files failed. Error: [${err}].`);
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
        cc.log(cc.logLevelEnums.DEBUG, `storeGet, Fetching item from storage with key: [${key}].`);
        if (typeof __data[key] === "undefined") {
            var ob = readFile(key);
            var obLen;
            // check if the 'read object' is empty or not
            try {
                obLen = Object.keys(ob).length;
            }
            catch (error) {
                // if we can not even asses length set it to 0 so we can return the default value
                obLen = 0;
            }

            // if empty or falsy set default value
            if (!ob || obLen === 0) {
                __data[key] = def;
            }
            // else set the value read file has
            else {
                __data[key] = ob[key];
            }
        }
        return __data[key];
    };
}());

module.exports = Countly;
