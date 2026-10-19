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

var os = require("os");
var http = require("http");
var https = require("https");
var fs = require("fs");
var path = require("path");
var cluster = require("cluster");
var cc = require("./countly-common");
var behavior = require("./countly-behavior");
var Bulk = require("./countly-bulk");
var CountlyStorage = require("./countly-storage");

var Countly = {};
Countly.StorageTypes = cc.storageTypeEnums;
Countly.DeviceIdType = cc.deviceIdTypeEnums;
Countly.Bulk = Bulk;
(function() {
    var SDK_VERSION = "24.10.4";
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
    var maxSegmentationValues = 100;
    var maxBreadcrumbCount = 100;
    var maxStackTraceLinesPerThread = 30;
    var maxStackTraceLineLength = 200;
    var deviceIdType = null;
    var heartBeatTimer = null;
    var uncaughtExceptionHandler = null;
    var unhandledRejectionHandler = null;
    var clusterForkHandler = null;
    var workerListeners = [];
    var workerMessageHandler = null;
    var primaryCheckTimer = null;
    var requestTimeout = 30;
    var standaloneWorker = false;
    var sdkGeneration = 0;
    var flushWaiters = [];
    var processingDisabled = false;
    var inFlightRequest = null;
    var serverSettings = {};
    var developerSettings = {};
    var settingsUpdatesDisabled = false;
    var healthCheckDisabled = false;
    var backoffDisabled = false;
    var settingsTimer = null;
    var settingsFetchAfterMerge = false;
    var healthCheckSent = false;
    var health = newHealthCounters();
    var healthDirty = false;
    var healthSavedAt = 0;
    var backoffUntil = 0;
    var backoffStreak = 0;
    /**
    * Array with list of available features that you can require consent for
    */
    Countly.features = ["sessions", "events", "views", "crashes", "attribution", "users", "location", "star-rating", "apm", "feedback", "remote-config"];

    // create object to store consents
    var consents = {};
    for (var feat = 0; feat < Countly.features.length; feat++) {
        consents[Countly.features[feat]] = {};
    }

    cc.onErrorOrWarning = function(level) {
        if (level === cc.logLevelEnums.ERROR) {
            health.el++;
        }
        else {
            health.wl++;
        }
        healthDirty = true;
    };

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
 * @param {string} [conf.salt] - shared secret used to append checksum256 to outgoing requests
 * @param {boolean} [conf.clear_stored_device_id=false] - set it to true if you want to erase the stored device ID
 * @param {boolean} [conf.test_mode=false] - set it to true if you want to initiate test_mode
 * @param {string} [conf.storage_path=.countly-storage] - folder where the SDK stores data, including id, queues, etc. A relative path is resolved against the app's working directory
 * @param {number} [conf.request_timeout=30] - seconds to wait for the server's answer; after that the request counts as failed and is sent again later
 * @param {boolean} [conf.standalone_worker=false] - in a cluster worker, send the worker's data directly instead of handing it to the main process. Needed when the main process does not run the SDK, for example in PM2 cluster mode. Each worker then keeps its data in its own "worker-<number>" folder inside the storage folder
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
 * @param {StorageTypes} conf.storage_type - to determine which storage type is going to be applied
 * @param {Object} conf.custom_storage_method - user given storage methods
 * @param {Object=} conf.behavior_settings - SDK behavior settings to use until the server's settings have been fetched once, in the format SDK Manager exports: an object with a "c" object
 * @param {boolean} [conf.disable_sdk_behavior_settings_updates=false] - do not fetch the SDK behavior settings from the server; stored and provided settings still apply
 * @param {boolean} [conf.disable_health_check=false] - do not send the health check at start
 * @param {boolean} [conf.disable_backoff_mechanism=false] - never pause sending when the server answers slowly, whatever the server settings say
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
            requestTimeout = Number(conf.request_timeout || Countly.request_timeout || requestTimeout);
            if (!(requestTimeout > 0)) {
                cc.log(cc.logLevelEnums.WARNING, `init, request_timeout must be a number of seconds, using 30 seconds instead of [${conf.request_timeout || Countly.request_timeout}].`);
                requestTimeout = 30;
            }
            else if (requestTimeout < 1) {
                cc.log(cc.logLevelEnums.WARNING, `init, request_timeout must be at least 1 second, using 1 second instead of [${requestTimeout}].`);
                requestTimeout = 1;
            }
            standaloneWorker = cluster.isWorker && !!(conf.standalone_worker || Countly.standalone_worker);
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
            Countly.salt = conf.salt || Countly.salt || null;
            Countly.require_consent = conf.require_consent || Countly.require_consent || false;
            Countly.remote_config = conf.remote_config || Countly.remote_config || false;
            Countly.http_options = conf.http_options || Countly.http_options || null;
            Countly.maxKeyLength = conf.max_key_length || Countly.max_key_length || maxKeyLength;
            Countly.maxValueSize = conf.max_value_size || Countly.max_value_size || maxValueSize;
            Countly.maxSegmentationValues = conf.max_segmentation_values || Countly.max_segmentation_values || maxSegmentationValues;
            Countly.maxBreadcrumbCount = conf.max_breadcrumb_count || Countly.max_breadcrumb_count || conf.max_logs || Countly.max_logs || maxBreadcrumbCount;
            Countly.maxStackTraceLinesPerThread = conf.max_stack_trace_lines_per_thread || Countly.max_stack_trace_lines_per_thread || maxStackTraceLinesPerThread;
            Countly.maxStackTraceLineLength = conf.max_stack_trace_line_length || Countly.max_stack_trace_line_length || maxStackTraceLineLength;
            settingsUpdatesDisabled = !!(conf.disable_sdk_behavior_settings_updates || Countly.disable_sdk_behavior_settings_updates);
            healthCheckDisabled = !!(conf.disable_health_check || Countly.disable_health_check);
            backoffDisabled = !!(conf.disable_backoff_mechanism || Countly.disable_backoff_mechanism);
            developerSettings = {
                rqs: queueSize,
                eqs: maxEventBatch,
                sui: sessionUpdate,
                lkl: Countly.maxKeyLength,
                lvs: Countly.maxValueSize,
                lsv: Countly.maxSegmentationValues,
                lbc: Countly.maxBreadcrumbCount,
                ltlpt: Countly.maxStackTraceLinesPerThread,
                ltl: Countly.maxStackTraceLineLength,
                cr: !!Countly.require_consent,
            };
            conf.storage_path = conf.storage_path || Countly.storage_path;
            conf.storage_type = conf.storage_type || Countly.storage_type;
            // Common module debug value is set to init time debug value
            cc.debug = conf.debug;

            var storagePath = conf.storage_path;
            if (standaloneWorker) {
                var workerNumber = typeof process.env.NODE_APP_INSTANCE !== "undefined" ? process.env.NODE_APP_INSTANCE : cluster.worker.id;
                storagePath = path.join(path.resolve(process.cwd(), conf.storage_path || CountlyStorage.defaultFolder), `worker-${workerNumber}`);
            }
            CountlyStorage.initStorage(storagePath, conf.storage_type, false, conf.custom_storage_method);

            // clear stored device ID if flag is set
            if (conf.clear_stored_device_id) {
                cc.log(cc.logLevelEnums.WARNING, "init, clear_stored_device_id is true, erasing the stored ID.");
                CountlyStorage.storeSet("cly_id", null);
                CountlyStorage.storeSet("cly_id_type", null);
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
                cc.log(cc.logLevelEnums.DEBUG, `init, Salt is configured: [${!!Countly.salt}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Storage path: [${CountlyStorage.getStoragePath()}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init, Require consent: [${Countly.require_consent}].`);
                if (Countly.remote_config) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Automatic Remote Configuration is on.`);
                }
                if (Countly.http_options) {
                    cc.log(cc.logLevelEnums.DEBUG, `init, Custom headers: [${Countly.http_options}].`);
                }
                cc.log(cc.logLevelEnums.DEBUG, `init,  General value limits are,\n for key length: [${Countly.maxKeyLength}],\n for value size: [${Countly.maxValueSize}],\n for segmentation: [${Countly.maxSegmentationValues}].`);
                cc.log(cc.logLevelEnums.DEBUG, `init,  Crash related value limits are,\n for breadcrumb count: [${Countly.maxBreadcrumbCount}],\n for trace lines per thread: [${Countly.maxStackTraceLinesPerThread}],\n for trace line length: [${Countly.maxStackTraceLineLength}].`);

                if (ownsQueue()) {
                    // fetch stored ID and ID type
                    var storedId = CountlyStorage.storeGet("cly_id", null);
                    var storedIdType = CountlyStorage.storeGet("cly_id_type", null);
                    // if there was a stored ID
                    if (storedId !== null && storedId !== "") {
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
                    CountlyStorage.storeSet("cly_id", Countly.device_id);
                    CountlyStorage.storeSet("cly_id_type", deviceIdType);
                    // create queues
                    requestQueue = CountlyStorage.storeGet("cly_queue", []);
                    eventQueue = CountlyStorage.storeGet("cly_event", []);
                    remoteConfigs = CountlyStorage.storeGet("cly_remote_configs", {});
                    serverSettings = behavior.parseStored(CountlyStorage.storeGet("cly_sbs", null))
                        || behavior.parseProvided(conf.behavior_settings || Countly.behavior_settings, warnAboutSettings)
                        || {};
                    health = loadHealthCounters(CountlyStorage.storeGet("cly_hc", null), health);
                    process.removeListener("exit", saveHealthCountersOnExit);
                    process.on("exit", saveHealthCountersOnExit);
                    applyBehaviorSettings();
                    heartBeat();
                    if (cluster.isMaster) {
                        // listen to current workers
                        if (cluster.workers) {
                            for (var id in cluster.workers) {
                                listenToWorker(cluster.workers[id], true);
                            }
                        }
                        // handle future workers
                        clusterForkHandler = (worker) => {
                            listenToWorker(worker, false);
                        };
                        cluster.on("fork", clusterForkHandler);
                    }
                    if (Countly.remote_config) {
                        Countly.fetch_remote_config(Countly.remote_config);
                    }
                    fetchBehaviorSettings(sendHealthCheck);
                }
                else {
                    startPrimaryCheck();
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
        readyToProcess = true;
        processingDisabled = !!preventRequestProcessing;
        trackTime = true;
        metrics = {};
        lastParams = {};
        maxKeyLength = 128;
        maxValueSize = 256;
        maxSegmentationValues = 100;
        maxBreadcrumbCount = 100;
        maxStackTraceLinesPerThread = 30;
        maxStackTraceLineLength = 200;
        deviceIdType = null;
        if (heartBeatTimer) {
            clearInterval(heartBeatTimer);
            heartBeatTimer = null;
        }
        if (clusterForkHandler) {
            cluster.removeListener("fork", clusterForkHandler);
            clusterForkHandler = null;
        }
        workerListeners.forEach((entry) => {
            entry.worker.removeListener("message", entry.listener);
        });
        workerListeners = [];
        stopPrimaryCheck();
        sdkGeneration++;
        inFlightRequest = null;
        settleFlushWaiters(false);
        if (settingsTimer) {
            clearTimeout(settingsTimer);
            settingsTimer = null;
        }
        process.removeListener("exit", saveHealthCountersOnExit);
        if (consentTimer) {
            clearTimeout(consentTimer);
            consentTimer = null;
        }
        serverSettings = {};
        developerSettings = {};
        settingsUpdatesDisabled = false;
        healthCheckDisabled = false;
        backoffDisabled = false;
        settingsFetchAfterMerge = false;
        healthCheckSent = false;
        health = newHealthCounters();
        healthDirty = false;
        healthSavedAt = 0;
        backoffUntil = 0;
        backoffStreak = 0;
        requestTimeout = 30;
        standaloneWorker = false;
        if (uncaughtExceptionHandler) {
            process.removeListener("uncaughtException", uncaughtExceptionHandler);
            uncaughtExceptionHandler = null;
        }
        if (unhandledRejectionHandler) {
            process.removeListener("unhandledRejection", unhandledRejectionHandler);
            unhandledRejectionHandler = null;
        }

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
        Countly.device_id_type = undefined;
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
        Countly.salt = undefined;
        Countly.require_consent = undefined;
        Countly.http_options = undefined;
        Countly.behavior_settings = undefined;
        Countly.disable_sdk_behavior_settings_updates = undefined;
        Countly.disable_health_check = undefined;
        Countly.disable_backoff_mechanism = undefined;
        CountlyStorage.resetStorage();
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
                consents[feature].optin = false;
                // this is added group, let's iterate through sub features
                Countly.remove_consent_internal(consents[feature].features, enforceConsentUpdate);
            }
            else {
                var wasGiven = consents[feature].optin === true;
                consents[feature].optin = false;
                // this is core feature
                if (enforceConsentUpdate && wasGiven) {
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
            consentTimer = null;
            queueConsentRequest();
        }, 1000);
    };

    /**
     * Queues a request with the current consent state of every feature
     */
    function queueConsentRequest() {
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
    }

    /**
     * Queues a consent change that is still waiting out its one second delay right away, so that it is sent
     * under the device ID of the user who made it and is included in a flush
     */
    function sendPendingConsent() {
        if (consentTimer) {
            clearTimeout(consentTimer);
            consentTimer = null;
            queueConsentRequest();
        }
    }

    /**
    * Start session
    * @param {boolean} noHeartBeat - true if you don't want to use internal heartbeat to manage session
    */

    Countly.begin_session = function(noHeartBeat) {
        if (!setting("st")) {
            cc.log(cc.logLevelEnums.INFO, "begin_session, Session tracking is turned off in the SDK behavior settings.");
            return;
        }
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
                saveHealthCounters(true);
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
    * Changes the current device ID according to the device ID type (the preffered method)
    * @param {string} newId - new user/device ID to use. Must be a non-empty string value. Invalid values (like null, empty string or undefined) will be rejected
    * */
    Countly.set_id = function(newId) {
        cc.log(cc.logLevelEnums.INFO, `set_id, Changing the device ID to: [${newId}]`);
        if (newId === null || newId === undefined || newId === "" || typeof newId !== "string") {
            cc.log(cc.logLevelEnums.WARNING, "set_id, The provided id is not a valid ID");
            return;
        }
        if (Countly.get_device_id_type() === cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED) {
            // change ID without merge as current ID is Dev supplied, so not first login
            Countly.change_id(newId, false);
        }
        else {
            // change ID with merge as current ID is not Dev supplied*/
            Countly.change_id(newId, true);
        }
    };

    /**
    * Change current user/device id.
    * Without merge, everything recorded for the current user is finished and sent under the current ID first:
    * the open view's duration, unsaved custom property changes and recorded events. The session is ended,
    * and timed events, breadcrumbs, calls waiting for consent and stored remote config values are cleared,
    * so nothing of the previous user is reported for the new one.
    * @param {string} newId - new user/device ID to use. Must be a non-empty string; a number is used as text
    * @param {boolean=} merge - move data from old ID to new ID on server
    * */
    Countly.change_id = function(newId, merge) {
        if (typeof newId === "number" && Number.isFinite(newId)) {
            newId = String(newId);
        }
        if (typeof newId !== "string" || newId === "") {
            cc.log(cc.logLevelEnums.WARNING, `change_id, The provided ID: [${newId}] is not valid, it must be a non-empty string. The device ID was not changed.`);
            return;
        }
        newId = cc.truncateSingleValue(newId, Countly.maxValueSize, "change_id", Countly.debug);
        cc.log(cc.logLevelEnums.INFO, `change_id, Changing ID. Current ID: [${Countly.device_id}], new ID: [${newId}], merge: [${merge}].`);
        if (Countly.device_id !== newId) {
            sendPendingConsent();
        }
        if (ownsQueue()) {
            if (Countly.device_id !== newId) {
                var mergeQueued = false;
                if (!merge) {
                    closeCurrentUser();
                    // empty event queue
                    if (eventQueue.length > 0) {
                        toRequestQueue({ events: JSON.stringify(eventQueue) }, true);
                        eventQueue = [];
                        CountlyStorage.storeSet("cly_event", eventQueue);
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
                CountlyStorage.storeSet("cly_id", Countly.device_id);
                CountlyStorage.storeSet("cly_id_type", deviceIdType);
                if (merge) {
                    if (Countly.check_any_consent()) {
                        mergeQueued = toRequestQueue({ old_device_id: oldId });
                    }
                    else {
                        lastParams.change_id = arguments;
                    }
                }
                else {
                    // start new session for new id
                    Countly.begin_session(!autoExtend);
                }
                if (!merge || Countly.remote_config) {
                    remoteConfigs = {};
                    CountlyStorage.storeSet("cly_remote_configs", remoteConfigs);
                }
                if (Countly.remote_config) {
                    Countly.fetch_remote_config(Countly.remote_config);
                }
                if (mergeQueued) {
                    settingsFetchAfterMerge = true;
                }
                else {
                    fetchBehaviorSettings();
                }
            }
        }
        else {
            if (!merge) {
                closeCurrentUser();
                timedEvents = {};
                remoteConfigs = {};
                Countly.remove_consent_internal(Countly.features, false);
            }
            process.send({ cly: { change_id: newId, merge } });
        }
    };

    /**
    * Before the device ID changes without merge: sends what is still open for the current user, which is the
    * open view's duration and unsaved custom property changes, and forgets the user's breadcrumbs and the
    * calls that wait for consent
    * */
    function closeCurrentUser() {
        reportViewDuration();
        if (Object.keys(customData).length > 0) {
            Countly.userData.save();
        }
        crashLogs = [];
        lastParams = {};
    }

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
        if (ownsQueue()) {
            if (!acceptsNewEvent(event.key)) {
                return;
            }
            if (!event.count) {
                event.count = 1;
            }
            // internal events keep their key and segmentation, as the server recognizes them by both; the developer's view segments are limited in track_view
            if (Object.values(cc.internalEventKeyEnums).indexOf(event.key) === -1) {
                event.key = cc.truncateSingleValue(event.key, Countly.maxKeyLength, "add_cly_event", Countly.debug);
                event.segmentation = cc.truncateObject(event.segmentation, Countly.maxKeyLength, Countly.maxValueSize, Countly.maxSegmentationValues, "add_cly_event", Countly.debug);
            }
            var props = ["key", "count", "sum", "dur", "segmentation"];
            var e = cc.makeJsonSafe(cc.getProperties(event, props), "add_cly_event");
            e.timestamp = getMsTimestamp();
            var date = new Date();
            e.hour = date.getHours();
            e.dow = date.getDay();
            cc.log(cc.logLevelEnums.DEBUG, "add_cly_events, Adding event: ", e);
            eventQueue.push(e);
            CountlyStorage.storeSet("cly_event", eventQueue);
            updateKeepAlive();
        }
        else {
            process.send({ cly: { event: cc.makeJsonSafe(event, "add_cly_event") } });
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
    * @param {string=} user.picturePath - local path to user's picture, if 'user.picture' is set this will be ignored
    * @param {string=} user.gender - M value for male and F value for female
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
            var request = { user_details: JSON.stringify(cc.makeJsonSafe(cc.getProperties(user, props), "user_details")) };
            if (!user.picture && user.picturePath) {
                cc.log(cc.logLevelEnums.INFO, "user_details, Picture is not set but picturePath is set, will try to upload picture from path.");
                request.picturePath = user.picturePath;
            }
            toRequestQueue(request);
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
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            cc.log(cc.logLevelEnums.ERROR, "change_custom_property, Provided key is not allowed.");
            return;
        }

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
                toRequestQueue({ user_details: JSON.stringify({ custom: cc.makeJsonSafe(customData, "save") }) });
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
    * Automatically track javascript errors that happen on the nodejs process.
    * An uncaught exception is reported as a fatal crash, stored synchronously and the process exits with code 1.
    * An unhandled promise rejection is reported as a non-fatal error and the process keeps running, as it
    * did before Node.js 15 made unhandled rejections stop the process.
    * @param {object=} segments - additional key value pairs you want to provide with error report, like versions of libraries used, etc.
    * */
    Countly.track_errors = function(segments) {
        cc.log(cc.logLevelEnums.INFO, `track_errors, Tracking errors. Segments provided: [${segments}].`);

        crashSegments = segments;
        // replace previously registered handlers so repeated calls don't record the same error multiple times
        if (uncaughtExceptionHandler) {
            process.removeListener("uncaughtException", uncaughtExceptionHandler);
        }
        if (unhandledRejectionHandler) {
            process.removeListener("unhandledRejection", unhandledRejectionHandler);
        }
        uncaughtExceptionHandler = (err) => {
            recordError(err, false);
            if (ownsQueue()) {
                CountlyStorage.forceStore();
            }
            // eslint-disable-next-line no-console
            console.error(`${(new Date()).toUTCString()} uncaughtException:`, err.message);
            // eslint-disable-next-line no-console
            console.error(err.stack);
            process.exit(1);
        };
        process.on("uncaughtException", uncaughtExceptionHandler);

        unhandledRejectionHandler = (reason) => {
            var err = new Error(`Unhandled rejection (reason: ${reason && reason.stack ? reason.stack : reason}).`);
            recordError(err, true);
            // eslint-disable-next-line no-console
            console.error(`${(new Date()).toUTCString()} unhandledRejection:`, err.message);
            // eslint-disable-next-line no-console
            console.error(err.stack);
        };
        process.on('unhandledRejection', unhandledRejectionHandler);
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
    * Fetch remote config. Values downloaded for a device ID that is no longer the current one are not used;
    * the callback then gets an error and the current values.
    * @param {array=} keys - Array of keys to fetch, if not provided will fetch all keys
    * @param {array=} omit_keys - Array of keys to omit, if provided will fetch all keys except provided ones
    * @param {function=} callback - Callback to notify with first param error and second param remote config object
    * */
    Countly.fetch_remote_config = function(keys, omit_keys, callback) {
        if (!setting("networking")) {
            if (!callback && typeof omit_keys === "function") {
                callback = omit_keys;
            }
            else if (!callback && typeof keys === "function") {
                callback = keys;
            }
            cc.log(cc.logLevelEnums.WARNING, "fetch_remote_config, Networking is turned off in the SDK behavior settings.");
            if (typeof callback === "function") {
                callback(new Error("Networking is turned off in the SDK behavior settings"), remoteConfigs);
            }
            return;
        }
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
            var generation = sdkGeneration;
            makeRequest(Countly.url, readPath, request, (err, params, responseText) => {
                if (generation !== sdkGeneration || request.device_id !== Countly.device_id) {
                    cc.log(cc.logLevelEnums.WARNING, "fetch_remote_config, The device ID changed while remote config was downloading, the downloaded values are not used.");
                    if (typeof callback === "function") {
                        callback(new Error("The device ID changed while remote config was downloading"), remoteConfigs);
                    }
                    return;
                }
                if (!err) {
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
                        if (ownsQueue()) {
                            CountlyStorage.storeSet("cly_remote_configs", remoteConfigs);
                            cc.log(cc.logLevelEnums.INFO, `fetch_remote_config, Fetched remote config: [${remoteConfigs}].`);
                        }
                    }
                    catch (ex) {
                        // silent catch
                    }
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
        if (!setting("vt")) {
            cc.log(cc.logLevelEnums.INFO, "track_view, View tracking is turned off in the SDK behavior settings.");
            return;
        }
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
    * Make raw request with provided parameters. The values are sent as given, without the SDK's length limits,
    * and the request counts towards the request queue size like every other request.
    * @example Countly.request({app_key:"somekey", device_id:"someid", events:'[{"key":"val","count":1}]', begin_session:1});
    * @param {Object} request - object with key/values which will be used as request parameters
    * */
    Countly.request = function(request) {
        request = cc.makeJsonSafe(request, "request");

        if (!request || typeof request !== "object" || !request.app_key || !request.device_id) {
            cc.log(cc.logLevelEnums.ERROR, "request, app_key or device_id is missing.");
            return;
        }
        if (ownsQueue()) {
            if (!setting("tracking")) {
                cc.log(cc.logLevelEnums.INFO, "request, Tracking is turned off in the SDK behavior settings. The request is not recorded.");
                return;
            }
            if (requestQueue.length > queueSize) {
                cc.log(cc.logLevelEnums.WARNING, "request, Queue overflown. Erasing earliest request from the queue.");
                dropOldestRequest();
            }
            cc.log(cc.logLevelEnums.INFO, "request, Adding the raw request to the queue.");
            requestQueue.push(request);
            CountlyStorage.storeSet("cly_queue", requestQueue);
            updateKeepAlive();
        }
        else {
            cc.log(cc.logLevelEnums.INFO, "request, Sending message to the parent process. Adding the raw request to the queue.");
            process.send({ cly: { request: request } });
        }
    };

    /**
    * Sends everything recorded so far without waiting for the next heartbeat: recorded events are packed into
    * requests and the queued requests are sent one after another, also right after an earlier failed attempt.
    * Use it before a script, a scheduled job or a serverless function ends, or in a shutdown handler before
    * calling process.exit().
    * @example
    * process.on("SIGTERM", async () => {
    *     Countly.end_session();
    *     await Countly.flush(5);
    *     process.exit(0);
    * });
    * @param {number=} timeout - seconds to wait at most. Without it, the call waits until the requests queued at the time of the call are sent, or one of them fails
    * @param {function=} callback - called with true when they were all delivered, and with false when something is still waiting: the server could not be reached, the timeout passed, test mode is on, or this is a cluster worker that hands its data to the main process
    * @returns {Promise<boolean>} resolves with the same value the callback receives
    * */
    Countly.flush = function(timeout, callback) {
        if (typeof timeout === "function") {
            callback = timeout;
            timeout = undefined;
        }
        var result = new Promise((resolve) => {
            if (!inited || !ownsQueue() || !Countly.url || Countly.test_mode || processingDisabled) {
                cc.log(cc.logLevelEnums.WARNING, "flush, Nothing can be sent from this process: the SDK is not initialized, test mode is on, or this cluster worker hands its data to the main process.");
                resolve(false);
                return;
            }
            saveHealthCounters(true);
            if (!setting("networking")) {
                cc.log(cc.logLevelEnums.WARNING, "flush, Networking is turned off in the SDK behavior settings, the data stays queued.");
                resolve(false);
                return;
            }
            sendPendingConsent();
            packEvents();
            if (requestQueue.length === 0) {
                resolve(true);
                return;
            }
            var waiter = { pending: requestQueue.slice(), timer: null, resolve: resolve };
            if (typeof timeout === "number" && timeout > 0) {
                waiter.timer = setTimeout(() => {
                    flushWaiters = flushWaiters.filter((entry) => entry !== waiter);
                    resolve(false);
                }, timeout * 1000);
            }
            flushWaiters.push(waiter);
            failTimeout = 0;
            processRequestQueue();
        });
        if (typeof callback === "function") {
            result.then((delivered) => {
                process.nextTick(callback, delivered);
            });
        }
        return result;
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
        if (Countly.check_consent("location") && setting("lt")) {
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
        request.tz = -date.getTimezoneOffset();
    }

    /**
    *  Add request to request queue
    *  @param {Object} request - object with request parameters
    *  @param {Boolean=} alreadyRecorded - true for events recorded before, which are sent even if tracking was turned off since
    *  @returns {Boolean} true if the request was queued or handed to the main process
    */
    function toRequestQueue(request, alreadyRecorded) {
        if (ownsQueue()) {
            if (!Countly.app_key || !Countly.device_id) {
                cc.log(cc.logLevelEnums.ERROR, "toRequestQueue, app_key or device_id is missing.");
                return false;
            }
            if (!alreadyRecorded && !acceptsNewRequest(request)) {
                return false;
            }
            prepareRequest(request);

            if (requestQueue.length > queueSize) {
                cc.log(cc.logLevelEnums.WARNING, "toRequestQueue, Queue overflown. Erasing earliest request from the queue.");
                dropOldestRequest();
            }

            cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Adding request to the queue.");
            requestQueue.push(request);
            CountlyStorage.storeSet("cly_queue", requestQueue);
            updateKeepAlive();
            return true;
        }
        cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Sending message to the parent process. Adding request to the queue.");
        process.send({ cly: { cly_queue: request } });
        return true;
    }

    /**
     * Tells whether a new request may be recorded under the SDK behavior settings. Checked where requests are
     * queued, so requests that cluster workers hand to this process are checked too.
     * @param {Object} request - request parameters
     * @returns {Boolean} true if the request may be recorded
     */
    function acceptsNewRequest(request) {
        if (!setting("tracking")) {
            cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Tracking is turned off in the SDK behavior settings. The request is not recorded.");
            return false;
        }
        if (request.crash && !setting("crt")) {
            cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Crash tracking is turned off in the SDK behavior settings. The crash is not recorded.");
            return false;
        }
        if ((request.begin_session || (request.session_duration && !request.end_session)) && !setting("st")) {
            cc.log(cc.logLevelEnums.INFO, "toRequestQueue, Session tracking is turned off in the SDK behavior settings. The session request is not recorded.");
            return false;
        }
        return true;
    }

    /**
     * Tells whether a new event may be recorded under the SDK behavior settings: tracking must be on, views
     * need view tracking and custom events (keys not starting with "[CLY]_") need custom event tracking
     * @param {String} key - event key
     * @returns {Boolean} true if the event may be recorded
     */
    function acceptsNewEvent(key) {
        if (!setting("tracking")) {
            cc.log(cc.logLevelEnums.INFO, "add_cly_events, Tracking is turned off in the SDK behavior settings. The event is not recorded.");
            return false;
        }
        if (key === cc.internalEventKeyEnums.VIEW) {
            if (!setting("vt")) {
                cc.log(cc.logLevelEnums.INFO, "add_cly_events, View tracking is turned off in the SDK behavior settings. The view is not recorded.");
                return false;
            }
            return true;
        }
        if (String(key).indexOf("[CLY]_") !== 0 && !setting("cet")) {
            cc.log(cc.logLevelEnums.INFO, "add_cly_events, Custom event tracking is turned off in the SDK behavior settings. The event is not recorded.");
            return false;
        }
        return true;
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

        packEvents();
        processRequestQueue();
        saveHealthCounters(false);

        heartBeatTimer = setTimeout(heartBeat, beatInterval);
        updateKeepAlive();
    }

    /**
     *  Moves all recorded events into the request queue, at most max_events events per request
     */
    function packEvents() {
        if (eventQueue.length === 0) {
            return;
        }
        var batchSize = maxEventBatch > 0 ? maxEventBatch : eventQueue.length;
        var events = eventQueue;
        eventQueue = [];
        for (var i = 0; i < events.length; i += batchSize) {
            toRequestQueue({ events: JSON.stringify(events.slice(i, i + batchSize)) }, true);
        }
        CountlyStorage.storeSet("cly_event", eventQueue);
    }

    /**
     *  Sends the oldest queued request when no other request is running. The request stays in the queue until
     *  the server confirms it, so it is still stored if the process ends meanwhile. After a confirmed request
     *  the next one is sent right away instead of waiting for the next heartbeat.
     */
    function processRequestQueue() {
        if (requestQueue.length === 0 || !readyToProcess || processingDisabled || Countly.test_mode || cc.getTimestamp() <= failTimeout || !setting("networking")) {
            return;
        }
        if (isBackingOff()) {
            return;
        }
        dropOldRequests();
        if (requestQueue.length === 0) {
            return;
        }
        readyToProcess = false;
        var params = requestQueue[0];
        var generation = sdkGeneration;
        var sentAt = Date.now();
        inFlightRequest = params;
        cc.log(cc.logLevelEnums.DEBUG, "Processing the request:", params);
        makeRequest(Countly.url, apiPath, params, (err, res, responseText, statusCode) => {
            if (generation !== sdkGeneration) {
                return;
            }
            inFlightRequest = null;
            cc.log(cc.logLevelEnums.DEBUG, "Request finished. Response:", res);
            if (err) {
                failTimeout = cc.getTimestamp() + failTimeoutAmount;
                cc.log(cc.logLevelEnums.ERROR, `makeRequest, Encountered a problem while making the request: [${err}]`);
                if (statusCode > 0 && statusCode < 1000) {
                    health.sc = statusCode;
                    health.em = String(responseText || "").substring(0, 1000);
                    healthDirty = true;
                    saveHealthCounters(true);
                }
            }
            else {
                var index = requestQueue.indexOf(params);
                if (index !== -1) {
                    requestQueue.splice(index, 1);
                }
                CountlyStorage.storeSet("cly_queue", requestQueue);
                checkBackoff(params, sentAt);
                if (settingsFetchAfterMerge && params.old_device_id) {
                    settingsFetchAfterMerge = false;
                    fetchBehaviorSettings();
                }
            }
            readyToProcess = true;
            if (err) {
                settleFlushWaiters(false);
            }
            else {
                updateFlushWaiters(params, true);
            }
            if (!err && requestQueue.length > 0) {
                setImmediate(processRequestQueue);
            }
            updateKeepAlive();
        }, "heartBeat", false);
    }

    /**
     * Lets the heartbeat timer keep the Node.js process running only while there is data to send and the
     * server is answering. A script then ends by itself once its data is delivered, or when the server cannot
     * be reached; undelivered data stays stored and is sent on the next start.
     */
    function updateKeepAlive() {
        if (!heartBeatTimer) {
            return;
        }
        var hasWork = requestQueue.length > 0 || eventQueue.length > 0;
        if (hasWork && readyToProcess && !processingDisabled && !Countly.test_mode && cc.getTimestamp() > failTimeout && setting("networking") && !isBackingOff()) {
            heartBeatTimer.ref();
        }
        else {
            heartBeatTimer.unref();
        }
    }

    /**
     * Value of an SDK behavior setting: the server's value (also when stored or provided at init), else the
     * developer's value, else the default
     * @param {String} key - setting key
     * @returns {*} the value in use
     */
    function setting(key) {
        return behavior.valueOf(serverSettings, key, developerSettings[key]);
    }

    /**
     * Puts the SDK behavior settings into effect. New values apply to data recorded from now on; data already
     * recorded is not changed. The server can turn the consent requirement on and off, as on Android and Web;
     * without "cr" the developer's requirement applies.
     */
    function applyBehaviorSettings() {
        queueSize = setting("rqs");
        maxEventBatch = setting("eqs");
        sessionUpdate = setting("sui");
        Countly.maxKeyLength = setting("lkl");
        Countly.maxValueSize = setting("lvs");
        Countly.maxSegmentationValues = setting("lsv");
        Countly.maxBreadcrumbCount = setting("lbc");
        Countly.maxStackTraceLinesPerThread = setting("ltlpt");
        Countly.maxStackTraceLineLength = setting("ltl");
        Countly.require_consent = setting("cr");
        if (!setting("networking")) {
            settleFlushWaiters(false);
        }
        updateKeepAlive();
    }

    /**
     * Logs a problem found in the SDK behavior settings
     * @param {String} message - what is wrong
     */
    function warnAboutSettings(message) {
        cc.log(cc.logLevelEnums.WARNING, `behavior settings, ${message}`);
    }

    /**
     * Adds the common parameters of the requests the SDK sends directly instead of through the queue
     * @param {Object} params - request specific parameters
     * @returns {Object} the parameters with the common ones added
     */
    function directRequestParams(params) {
        params.app_key = Countly.app_key;
        params.device_id = Countly.device_id;
        params.sdk_name = SDK_NAME;
        params.sdk_version = SDK_VERSION;
        params.t = deviceIdType;
        params.av = Countly.app_version;
        params.timestamp = getMsTimestamp();
        var date = new Date();
        params.hour = date.getHours();
        params.dow = date.getDay();
        params.tz = -date.getTimezoneOffset();
        return params;
    }

    /**
     * Fetches the SDK behavior settings from the server and puts them into effect. The request is sent
     * directly, also while networking is turned off, so that turning networking back on reaches the SDK. A
     * failed request or an unusable answer keeps the current settings. The next fetch follows scui hours later.
     * @param {Function=} done - called when the fetch finished or was skipped
     */
    function fetchBehaviorSettings(done) {
        /**
         * Tells the caller that the fetch finished or was skipped
         */
        function finish() {
            if (typeof done === "function") {
                done();
            }
        }
        if (!inited || !ownsQueue() || !Countly.url || Countly.test_mode || processingDisabled || settingsUpdatesDisabled) {
            finish();
            return;
        }
        var generation = sdkGeneration;
        makeRequest(Countly.url, readPath, directRequestParams({ method: "sc" }), (err, params, responseText) => {
            if (generation !== sdkGeneration) {
                return;
            }
            var fetched = err ? null : behavior.parseAnswer(responseText, warnAboutSettings);
            if (fetched) {
                serverSettings = fetched;
                CountlyStorage.storeSet("cly_sbs", fetched);
                applyBehaviorSettings();
                cc.log(cc.logLevelEnums.INFO, "fetchBehaviorSettings, SDK behavior settings fetched:", fetched);
            }
            else {
                cc.log(cc.logLevelEnums.WARNING, "fetchBehaviorSettings, The SDK behavior settings could not be fetched, the current settings stay in use.");
            }
            scheduleBehaviorSettingsFetch();
            finish();
        }, "behavior_settings", true);
    }

    /**
     * Schedules the next SDK behavior settings fetch, scui hours from now. The timer does not keep the process
     * running.
     */
    function scheduleBehaviorSettingsFetch() {
        if (settingsTimer) {
            clearTimeout(settingsTimer);
        }
        settingsTimer = setTimeout(() => {
            settingsTimer = null;
            fetchBehaviorSettings();
        }, setting("scui") * 3600 * 1000);
        settingsTimer.unref();
    }

    /**
     * Health check counters with their starting values
     * @returns {Object} error and warning log counts (el, wl), the last failed request's status code and
     * response (sc, em), and the backoff counts (bom, cbom)
     */
    function newHealthCounters() {
        return { el: 0, wl: 0, sc: -1, em: "", bom: 0, cbom: 0 };
    }

    /**
     * Reads health check counters, for example the ones an earlier run stored; a damaged value starts from zero
     * @param {*} stored - stored counters
     * @param {Object=} logged - counters of this run so far, whose error and warning counts are added, so
     * warnings logged during init before the stored counters were read are reported too
     * @returns {Object} a copy of the usable counters
     */
    function loadHealthCounters(stored, logged) {
        var counters = newHealthCounters();
        if (stored && typeof stored === "object") {
            Object.keys(counters).forEach((key) => {
                if (typeof stored[key] === typeof counters[key]) {
                    counters[key] = stored[key];
                }
            });
        }
        if (logged) {
            counters.el += logged.el;
            counters.wl += logged.wl;
            if (logged.el > 0 || logged.wl > 0) {
                healthDirty = true;
            }
        }
        return counters;
    }

    /**
     * Stores the health check counters when they changed. Unless "now" is set they are stored at most once per
     * session update interval, so a failing storage, whose failed writes are counted as errors, cannot cause
     * one write after another.
     * @param {Boolean} now - true to store right away
     */
    function saveHealthCounters(now) {
        if (!healthDirty || !inited || !ownsQueue()) {
            return;
        }
        if (!now && Date.now() - healthSavedAt < sessionUpdate * 1000) {
            return;
        }
        healthDirty = false;
        healthSavedAt = Date.now();
        CountlyStorage.storeSet("cly_hc", health);
    }

    /**
     * Stores changed health check counters synchronously when the process exits, because while the process
     * runs they are stored at most once per session update interval
     */
    function saveHealthCountersOnExit() {
        if (healthDirty) {
            saveHealthCounters(true);
            CountlyStorage.flushSync();
        }
    }

    /**
     * Sends the health check once per start, directly instead of through the queue, with the error and warning
     * log counts, the last failed request and the backoff counts. The counters are cleared only when the
     * server confirms the health check; otherwise they are sent again at the next start.
     */
    function sendHealthCheck() {
        if (healthCheckSent || healthCheckDisabled || !inited || !ownsQueue() || !Countly.url || Countly.test_mode || processingDisabled) {
            return;
        }
        if (!setting("networking")) {
            cc.log(cc.logLevelEnums.INFO, "sendHealthCheck, Networking is turned off in the SDK behavior settings, the health check is not sent.");
            return;
        }
        healthCheckSent = true;
        var sent = loadHealthCounters(health);
        var request = directRequestParams({
            hc: JSON.stringify(sent),
            metrics: JSON.stringify({ _app_version: getMetrics()._app_version }),
        });
        var generation = sdkGeneration;
        makeRequest(Countly.url, apiPath, request, (err) => {
            if (generation !== sdkGeneration || err) {
                return;
            }
            health.el = Math.max(0, health.el - sent.el);
            health.wl = Math.max(0, health.wl - sent.wl);
            health.bom = Math.max(0, health.bom - sent.bom);
            if (health.cbom === sent.cbom) {
                health.cbom = 0;
            }
            if (health.sc === sent.sc && health.em === sent.em) {
                health.sc = -1;
                health.em = "";
            }
            healthDirty = true;
            saveHealthCounters(true);
        }, "health_check", false);
    }

    /**
     * Tells whether sending is paused because the server answered slowly. A running flush call does not wait
     * for the pause.
     * @returns {Boolean} true while the pause lasts
     */
    function isBackingOff() {
        return flushWaiters.length === 0 && Date.now() < backoffUntil;
    }

    /**
     * After a delivered request, pauses sending for bom_d seconds when the server answered slowly while the
     * queue was short and the request recent (backoff), unless the developer turned the backoff off
     * @param {Object} request - the delivered request
     * @param {Number} sentAt - time the request was sent, in milliseconds
     */
    function checkBackoff(request, sentAt) {
        if (backoffDisabled || !setting("bom")) {
            backoffStreak = 0;
            return;
        }
        var recordedAt = Number(request.timestamp);
        var slow = behavior.shouldBackOff({
            durationSeconds: (Date.now() - sentAt) / 1000,
            queueLength: requestQueue.length,
            queueSize: queueSize,
            ageHours: recordedAt > 0 ? (Date.now() - recordedAt) / 3600000 : 0,
            bom_at: setting("bom_at"),
            bom_rqp: setting("bom_rqp"),
            bom_ra: setting("bom_ra"),
        });
        if (!slow) {
            backoffStreak = 0;
            return;
        }
        backoffUntil = Date.now() + setting("bom_d") * 1000;
        backoffStreak++;
        health.bom++;
        health.cbom = Math.max(health.cbom, backoffStreak);
        healthDirty = true;
        saveHealthCounters(true);
        cc.log(cc.logLevelEnums.INFO, `checkBackoff, The server answered slowly, sending pauses for [${setting("bom_d")}] seconds.`);
    }

    /**
     * Drops queued requests recorded more than dort hours ago, when the dort setting is above 0
     */
    function dropOldRequests() {
        var hours = setting("dort");
        if (!(hours > 0)) {
            return;
        }
        var limit = Date.now() - hours * 3600000;
        var kept = [];
        requestQueue.forEach((request) => {
            if (Number(request.timestamp) > 0 && Number(request.timestamp) < limit) {
                updateFlushWaiters(request, false);
            }
            else {
                kept.push(request);
            }
        });
        if (kept.length !== requestQueue.length) {
            cc.log(cc.logLevelEnums.INFO, `dropOldRequests, Dropped [${requestQueue.length - kept.length}] requests recorded more than [${hours}] hours ago.`);
            requestQueue = kept;
            CountlyStorage.storeSet("cly_queue", requestQueue);
        }
    }

    /**
     * Resolves all waiting flush calls with the same result
     * @param {Boolean} result - value the flush calls resolve with
     */
    function settleFlushWaiters(result) {
        var waiting = flushWaiters;
        flushWaiters = [];
        waiting.forEach((waiter) => {
            clearTimeout(waiter.timer);
            waiter.resolve(result);
        });
    }

    /**
     * Tells the waiting flush calls that a request left the queue. A delivered request is crossed off, and a
     * flush call resolves with true once all requests it waits for are delivered, or with false as soon as one
     * of them was dropped because the queue was full.
     * @param {Object} request - request that left the queue
     * @param {Boolean} delivered - true if the server confirmed it, false if it was dropped
     */
    function updateFlushWaiters(request, delivered) {
        var waiting = [];
        flushWaiters.forEach((waiter) => {
            var index = waiter.pending.indexOf(request);
            if (index === -1) {
                waiting.push(waiter);
                return;
            }
            waiter.pending.splice(index, 1);
            if (!delivered || waiter.pending.length === 0) {
                clearTimeout(waiter.timer);
                waiter.resolve(delivered);
                return;
            }
            waiting.push(waiter);
        });
        flushWaiters = waiting;
    }

    /**
     * Drops the oldest request when the queue is full. The request being sent right now can still be delivered,
     * so only other requests count as lost for waiting flush calls.
     */
    function dropOldestRequest() {
        var dropped = requestQueue.shift();
        if (dropped !== inFlightRequest) {
            updateFlushWaiters(dropped, false);
        }
    }

    /**
     * Tells whether this process keeps the queues and sends the requests: a process outside a cluster, the
     * cluster's main process, or a cluster worker started with standalone_worker
     * @returns {Boolean} true if this process sends its data itself
     */
    function ownsQueue() {
        return cluster.isMaster || standaloneWorker;
    }

    /**
     * Receives the data of a cluster worker in the main process
     * @param {Object} worker - cluster worker
     * @param {Boolean} announce - true to tell an already running worker right away that this process runs the SDK
     */
    function listenToWorker(worker, announce) {
        var entry = { worker: worker, listener: null };
        entry.listener = function(msg) {
            handleWorkerMessage(msg, worker);
        };
        worker.on("message", entry.listener);
        worker.once("exit", () => {
            worker.removeListener("message", entry.listener);
            workerListeners = workerListeners.filter((item) => item !== entry);
        });
        workerListeners.push(entry);
        if (announce) {
            sendToWorker(worker, { cly: { ack: true } });
        }
    }

    /**
     * Sends a message to a cluster worker. A worker whose channel is already closed is skipped, and a failed
     * send is only logged, since a closed channel would otherwise raise an error event nobody handles.
     * @param {Object} worker - cluster worker
     * @param {Object} msg - message
     */
    function sendToWorker(worker, msg) {
        if (typeof worker.isConnected === "function" && !worker.isConnected()) {
            return;
        }
        try {
            worker.send(msg, (err) => {
                if (err) {
                    cc.log(cc.logLevelEnums.WARNING, "sendToWorker, Could not send a message to a cluster worker:", err);
                }
            });
        }
        catch (ex) {
            cc.log(cc.logLevelEnums.WARNING, "sendToWorker, Could not send a message to a cluster worker:", ex);
        }
    }

    /**
     * In a cluster worker that hands its data to the main process: asks the main process whether it runs the
     * SDK, and warns once when no answer arrives within 5 seconds, because the worker's data is then not sent.
     * The check neither keeps the worker running nor warns when the worker is already disconnecting.
     */
    function startPrimaryCheck() {
        if (!cluster.isWorker || typeof process.send !== "function" || !process.connected) {
            return;
        }
        workerMessageHandler = function(msg) {
            if (msg && msg.cly && msg.cly.ack) {
                stopPrimaryCheck();
            }
        };
        process.on("message", workerMessageHandler);
        process.once("disconnect", stopPrimaryCheck);
        primaryCheckTimer = setTimeout(() => {
            var { connected } = process;
            stopPrimaryCheck();
            if (connected) {
                cc.warnOnce("cluster-no-primary", "Countly: this cluster worker hands its data to the main process, but the main process does not run the Countly SDK, so nothing recorded in this worker is sent. Initialize Countly in the main process as well, or pass standalone_worker: true to Countly.init when the main process is not yours (for example in PM2 cluster mode).");
            }
        }, 5000);
        primaryCheckTimer.unref();
        try {
            process.send({ cly: { hello: true } }, (err) => {
                if (err) {
                    cc.log(cc.logLevelEnums.ERROR, "init, Could not contact the main process:", err);
                }
            });
        }
        catch (ex) {
            cc.log(cc.logLevelEnums.ERROR, "init, Could not contact the main process:", ex);
        }
    }

    /**
     * Ends the main process check of a cluster worker
     */
    function stopPrimaryCheck() {
        if (primaryCheckTimer) {
            clearTimeout(primaryCheckTimer);
            primaryCheckTimer = null;
        }
        if (workerMessageHandler) {
            process.removeListener("message", workerMessageHandler);
            process.removeListener("disconnect", stopPrimaryCheck);
            workerMessageHandler = null;
        }
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
        if (!setting("crt")) {
            cc.log(cc.logLevelEnums.INFO, "recordError, Crash tracking is turned off in the SDK behavior settings.");
            return;
        }
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
    *  Making HTTP request. The request fails when the server sends nothing for request_timeout seconds or
    *  the connection closes before the whole response arrived, and the callback is called exactly once.
    *  The options passed to http_options always contain a headers object.
    *  @param {String} url - URL where to make request
    *  @param {String} api - API endpoint
    *  @param {Object} params - key value object with URL params
    *  @param {Function} callback - callback when request finished or failed
    *  @param {string} info - function name or any other information for the logs
    *  @param {Boolean} isBroad - if true a broader (more generous) response check would be implemented
    */
    function makeRequest(url, api, params, callback, info, isBroad) {
        var finished = false;
        /**
         * Reports the outcome of the request to the callback, once
         * @param {Boolean} failed - true if the request failed
         * @param {String=} responseText - response body, when the server answered
         * @param {Number=} statusCode - HTTP status code, when the server answered
         */
        function finish(failed, responseText, statusCode) {
            if (finished) {
                return;
            }
            finished = true;
            if (typeof callback === "function") {
                callback(failed, params, responseText, statusCode);
            }
        }
        try {
            info = info || "general";
            isBroad = isBroad || false;
            cc.log(cc.logLevelEnums.INFO, `makeRequest, Sending ${info} HTTP request`);
            var serverOptions = parseUrl(url);
            var data;
            var method = "GET";
            var options = {
                host: serverOptions.host,
                port: serverOptions.port,
                path: api,
                method: "GET",
                headers: {},
            };

            if (params && params.picturePath) {
                try {
                    var filePath = params.picturePath;
                    var fileName = path.basename(filePath);
                    var ext = (fileName.split('.').pop() || '').toLowerCase();
                    var contentType = 'application/octet-stream';
                    if (ext === 'png') {
                        contentType = 'image/png';
                    }
                    else if (ext === 'jpg' || ext === 'jpeg') {
                        contentType = 'image/jpeg';
                    }
                    else if (ext === 'gif') {
                        contentType = 'image/gif';
                    }

                    var boundary = `FormBoundary${Math.random().toString(16).slice(2)}`;
                    var bodyParts = [];
                    var uploadParams = {};

                    for (var p in params) {
                        if (Object.prototype.hasOwnProperty.call(params, p) && typeof params[p] !== "undefined" && p !== "picturePath") {
                            uploadParams[p] = params[p];
                        }
                    }

                    var uploadChecksum = null;
                    if (Countly.salt) {
                        uploadChecksum = cc.calculateChecksum(cc.serializeParams(uploadParams), Countly.salt, true);
                    }

                    for (var param in uploadParams) {
                        if (Object.prototype.hasOwnProperty.call(uploadParams, param)) {
                            var value = uploadParams[param];
                            bodyParts.push(Buffer.from(`--${boundary}\r\n`));
                            bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="${param}"\r\n\r\n`));
                            bodyParts.push(Buffer.from(String(value)));
                            bodyParts.push(Buffer.from('\r\n'));
                        }
                    }

                    if (uploadChecksum) {
                        bodyParts.push(Buffer.from(`--${boundary}\r\n`));
                        bodyParts.push(Buffer.from('Content-Disposition: form-data; name="checksum256"\r\n\r\n'));
                        bodyParts.push(Buffer.from(uploadChecksum));
                        bodyParts.push(Buffer.from('\r\n'));
                    }

                    bodyParts.push(Buffer.from(`--${boundary}\r\n`));
                    bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="user_picture"; filename="${fileName}"\r\n`));
                    bodyParts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
                    var fileBuffer = fs.readFileSync(filePath);
                    bodyParts.push(fileBuffer);
                    bodyParts.push(Buffer.from('\r\n'));

                    bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

                    data = Buffer.concat(bodyParts);
                    method = "POST";
                    options.method = "POST";
                    options.path = api;
                    options.headers = options.headers || {};
                    options.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
                    options.headers['Content-Length'] = data.length;
                }
                catch (e) {
                    cc.log(cc.logLevelEnums.ERROR, `makeRequest, Failed preparing picture upload: [${e}]. Falling back to sending request without image.`);
                    // Remove picturePath to continue with regular request
                    delete params.picturePath;
                }
            }

            if (!data) {
                data = prepareParams(params);
                options.path = `${api}?${data}`;

                if (data.length >= 2000 || Countly.force_post) {
                    method = "POST";
                }

                if (method === "POST") {
                    options.method = "POST";
                    options.path = api;
                    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
                    options.headers["Content-Length"] = Buffer.byteLength(data);
                }
            }

            if (typeof Countly.http_options === "function") {
                Countly.http_options(options);
            }
            var protocol = https;
            if (url.indexOf("http:") === 0) {
                protocol = http;
            }
            var req = protocol.request(options, (res) => {
                var str = "";
                res.setEncoding("utf8");
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
                    finish(!isResponseValidated, str, res.statusCode);
                });
                res.on("error", (err) => {
                    cc.log(cc.logLevelEnums.ERROR, "makeRequest, Connection failed while receiving the response. Error:", err);
                    finish(true);
                });
                res.on("close", () => {
                    if (!res.complete) {
                        cc.log(cc.logLevelEnums.ERROR, "makeRequest, The connection closed before the whole response arrived.");
                        finish(true);
                    }
                });
            });
            req.setTimeout(requestTimeout * 1000, () => {
                cc.log(cc.logLevelEnums.ERROR, `makeRequest, The server did not answer within [${requestTimeout}] seconds.`);
                req.destroy(new Error("request timeout"));
            });
            req.on("error", (err) => {
                cc.log(cc.logLevelEnums.ERROR, "makeRequest, Connection failed. Error:", err);
                finish(true);
            });
            if (method === "POST") {
                // write data to request body
                req.write(data);
            }

            req.end();
        }
        catch (e) {
            // fallback
            cc.log(cc.logLevelEnums.ERROR, "makeRequest, Failed the HTTP request. Error:", e);
            finish(true);
        }
    }

    /**
     *  Convert JSON object to query params and append checksum when configured
     *  @param {Object} params - object with url params
     *  @param {Boolean} decodeBeforeHash - if true request data is URL-decoded before hashing
     *  @returns {String} query string
     */
    function prepareParams(params, decodeBeforeHash) {
        var data = cc.serializeParams(params);
        return cc.addChecksum(data, Countly.salt, decodeBeforeHash, false);
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
     *  @param {Object=} worker - worker that sent the message, answered when it asks whether this process runs the SDK
     */
    function handleWorkerMessage(msg, worker) {
        if (msg && msg.cly) {
            if (msg.cly.hello) {
                if (worker) {
                    sendToWorker(worker, { cly: { ack: true } });
                }
            }
            else if (msg.cly.cly_queue) {
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
}());

module.exports = Countly;
