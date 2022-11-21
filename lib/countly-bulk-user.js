/**
 * CountlyBulkUser object to make it easier to send information about specific user in bulk requests
 * @name CountlyBulkUser
 * @module lib/countly-bulk-user
 * @example
 * var CountlyBulk = require("countly-sdk-nodejs").Bulk;
 *
 * var server = new CountlyBulk({
 *   app_key: "{YOUR-API-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true
 * });

 * //adding requests by user
 * var user = server.add_user({device_id:"my_device_id"});
 */
var cc = require("./countly-common");
/**
 * @lends module:lib/countly-bulk-user
 * Initialize CountlyBulkUser object
 * @param {Object} conf - CountlyBulkUser configuration options
 * @param {Object} conf.server - CountlyBulk instance with server configuration
 * @param {string} conf.device_id - identification of the user
 * @param {string=} conf.country_code - country code for your user
 * @param {string=} conf.city - name of the city of your user
 * @param {string=} conf.ip_address - ip address of your user
 * @param {boolean} [conf.debug=false] - output debug info into console
 * @param {boolean} [conf.require_consent=false] - Pass true if you are implementing GDPR compatible consent management. It would prevent running any functionality without proper consent
 * @param {number} [conf.max_key_length=128] - maximum size of all string keys
 * @param {number} [conf.max_value_size=256] - maximum size of all values in our key-value pairs (Except "picture" field, that has a limit of 4096 chars)
 * @param {number} [conf.max_segmentation_values=30] - max amount of custom (dev provided) segmentation in one event
 * @param {number} [conf.max_breadcrumb_count=100] - maximum amount of breadcrumbs that can be recorded before the oldest one is deleted
 * @param {number} [conf.max_stack_trace_lines_per_thread=30] - maximum amount of stack trace lines would be recorded per thread
 * @param {number} [conf.max_stack_trace_line_length=200] - maximum amount of characters are allowed per stack trace line. This limits also the crash message length
 * @example
 * var CountlyBulk = require("countly-sdk-nodejs").Bulk;
 *
 * var server = new CountlyBulk({
 *   app_key: "{YOUR-API-KEY}",
 *   url: "https://API_HOST/",
 *   debug: true
 * });
 *
 * //adding requests by user
 * var user = server.add_user({device_id:"my_device_id"});
 * user.begin_session().add_event({key:"Test", count:1})
 */
function CountlyBulkUser(conf) {
    var sessionStart = 0;
    var maxKeyLength = 128;
    var maxValueSize = 256;
    var maxSegmentationValues = 30;
    var maxBreadcrumbCount = 100;
    var maxStackTraceLinesPerThread = 30;
    var maxStackTraceLineLength = 200;
    var lastParams = {};

    /**
    * Array with list of available features that you can require consent for
    */
    var features = ["sessions", "events", "views", "crashes", "attribution", "users", "star-rating", "location", "apm", "feedback", "remote-config"];

    // create object to store consents
    var consents = {};
    for (var feat = 0; feat < features.length; feat++) {
        consents[features[feat]] = {};
    }

    conf.debug = conf.debug || false;
    cc.debugBulkUser = conf.debug;

    if (!conf.device_id) {
        cc.log(cc.logLevelEnums.ERROR, "CountlyBulkUser, 'device_id' is missing.");
        return;
    }

    if (!conf.server) {
        cc.log(cc.logLevelEnums.ERROR, "CountlyBulkUser, 'server' instance is missing.");
        return;
    }

    conf.maxKeyLength = conf.max_key_length || maxKeyLength;
    conf.maxValueSize = conf.max_value_size || maxValueSize;
    conf.maxSegmentationValues = conf.max_segmentation_values || maxSegmentationValues;
    conf.maxBreadcrumbCount = conf.max_breadcrumb_count || maxBreadcrumbCount;
    conf.maxStackTraceLinesPerThread = conf.max_stack_trace_lines_per_thread || maxStackTraceLinesPerThread;
    conf.maxStackTraceLineLength = conf.max_stack_trace_line_length || maxStackTraceLineLength;

    /**
    * Modify feature groups for consent management. Allows you to group multiple features under one feature group
    * @param {object} groupedFeatures - object to define feature name as key and core features as value
    * @example <caption>Adding all features under one group</caption>
    * user.group_features({all:["sessions","events","views","crashes","attribution","users"]});
    * //After this call user.add_consent("all") to allow all features
    @example <caption>Grouping features</caption>
    * user.group_features({
    *    activity:["sessions","events","views"],
    *    info:["attribution","users"]
    * });
    * //After this call user.add_consent("activity") to allow "sessions","events","views"
    * //or call user.add_consent("info") to allow "attribution","users"
    * //or call user.add_consent("crashes") to allow some separate feature
    */
    this.group_features = function(groupedFeatures) {
        if (groupedFeatures) {
            for (var i in groupedFeatures) {
                if (!consents[i]) {
                    if (typeof groupedFeatures[i] === "string") {
                        consents[i] = { features: [groupedFeatures[i]] };
                    }
                    else if (groupedFeatures[i] && groupedFeatures[i].constructor === Array && groupedFeatures[i].length) {
                        consents[i] = { features: groupedFeatures[i] };
                    }
                    else {
                        cc.log(cc.logLevelEnums.WARNING, `CountlyBulkUser group_features, Incorrect feature list for [${i}] value: [${groupedFeatures[i]}].`);
                    }
                }
                else {
                    cc.log(cc.logLevelEnums.WARNING, `CountlyBulkUser group_features, Feature name [${i}] is already reserved.`);
                }
            }
        }
        else {
            cc.log(cc.logLevelEnums.ERROR, `CountlyBulkUser group_features, Incorrect features: [${groupedFeatures}].`);
        }
    };

    /**
    * Check if consent is given for specific feature (either core feature of from custom feature group)
    * @param {string} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link CountlyBulkUser.group_features}
    * @returns {bool} true if consent is given, false if it is not
    */
    this.check_consent = function(feature) {
        if (!conf.require_consent) {
            // we don't need to have specific consents
            cc.log(cc.logLevelEnums.INFO, `CountlyBulkUser check_consent, Require consent is off. Giving consent for: [${feature}] feature.`);
            return true;
        }
        if (consents[feature] && consents[feature].optin) {
            cc.log(cc.logLevelEnums.INFO, `CountlyBulkUser check_consent, Giving consent for: [${feature}] feature.`);
            return true;
        }
        if (consents[feature] && !consents[feature].optin) {
            cc.log(cc.logLevelEnums.ERROR, `CountlyBulkUser check_consent, User is not optin. Consent refused for: [${feature}] feature.`);
            return false;
        }

        cc.log(cc.logLevelEnums.ERROR, `CountlyBulkUser check_consent, No feature available for: [${feature}].`);

        return false;
    };

    /**
    * Add consent for specific feature, meaning, user allowed to track that data (either core feature of from custom feature group). Add consent before adding any data, or else this data will be ignored, as per not having consent
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link CountlyBulkUser.group_features}
    */
    this.add_consent = function(feature) {
        cc.log(cc.logLevelEnums.INFO, `CountlyBulkUser add_consent, Adding consent for: [${feature}].`);
        if (feature.constructor === Array) {
            for (var i = 0; i < feature.length; i++) {
                this.add_consent(feature[i]);
            }
        }
        else if (consents[feature]) {
            if (consents[feature].features) {
                consents[feature].optin = true;
                // this is added group, let's iterate through sub features
                this.add_consent(consents[feature].features);
            }
            else {
                // this is core feature
                if (consents[feature].optin !== true) {
                    consents[feature].optin = true;
                    updateConsent();
                    setTimeout(function() {
                        if (feature === "sessions" && lastParams.begin_session) {
                            this.begin_session.apply(this, lastParams.begin_session);
                            lastParams.begin_session = null;
                        }
                        else if (feature === "views" && lastParams.track_pageview) {
                            this.track_pageview.apply(this, lastParams.track_pageview);
                            lastParams.track_pageview = null;
                        }
                    }, 1);
                }
            }
        }
        else {
            cc.log(cc.logLevelEnums.ERROR, `CountlyBulkUser add_consent, No feature available for: [${feature}].`);
        }
    };

    /**
    * Remove consent for specific feature, meaning, user opted out to track that data (either core feature of from custom feature group)
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or custom provided through {@link CountlyBulkUser.group_features}
    */
    this.remove_consent = function(feature) {
        cc.log(cc.logLevelEnums.INFO, `CountlyBulkUser remove_consent, Removing consent for: [${feature}].`);
        this.remove_consent_internal(feature, true);
    };

    /**
    * Remove consent internally for specific feature,so that a request wont be sent for the operation
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or custom provided through {@link CountlyBulkUser.group_features}
    * @param {Boolean} enforceConsentUpdate - regulates if a request will be sent to the server or not. If true, removing consents will send a request to the server and if false, consents will be removed without a request 
    */
    this.remove_consent_internal = function(feature, enforceConsentUpdate) {
        // if true updateConsent will execute when possible
        enforceConsentUpdate = enforceConsentUpdate || false;
        if (feature.constructor === Array) {
            for (var i = 0; i < feature.length; i++) {
                this.remove_consent_internal(feature[i], enforceConsentUpdate);
            }
        }
        else if (consents[feature]) {
            if (consents[feature].features) {
                // this is added group, let's iterate through sub features
                this.remove_consent_internal(consents[feature].features, enforceConsentUpdate);
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
            cc.log(cc.logLevelEnums.ERROR, `CountlyBulkUser remove_consent, No feature available to remove for: [${feature}].`);
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
            for (var i = 0; i < features.length; i++) {
                if (consents[features[i]].optin === true) {
                    consentMessage[features[i]] = true;
                }
                else {
                    consentMessage[features[i]] = false;
                }
            }
            conf.server.add_bulk_request({ consent: JSON.stringify(consentMessage) });
            cc.log(cc.logLevelEnums.DEBUG, "CountlyBulkUser updateConsent, Consent update request has been sent to the queue.");
        }, 1000);
    };

    /**
    * Start user's sesssion
    * @param {Object} metrics - provide {@link Metrics} for this user/device, or else will try to collect what's possible
    * @param {string} metrics._os - name of platform/operating system
    * @param {string} metrics._os_version - version of platform/operating system
    * @param {string=} metrics._device - device name
    * @param {string=} metrics._resolution - screen resolution of the device
    * @param {string=} metrics._carrier - carrier or operator used for connection
    * @param {string=} metrics._density - screen density of the device
    * @param {string=} metrics._locale - locale or language of the device in ISO format
    * @param {string=} metrics._store - source from where the user/device/installation came from
    * @param {number} seconds - how long did the session last in seconds
    * @param {number} timestamp - timestamp when session started
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.begin_session = function(metrics, seconds, timestamp) {
        if (this.check_consent("sessions")) {
            var bulk = [];
            var query = prepareQuery({ begin_session: 1, metrics });
            if (this.check_consent("location")) {
                if (conf.country_code) {
                    query.country_code = conf.country_code;
                }
                if (conf.city) {
                    query.city = conf.city;
                }
            }
            else {
                query.location = "";
            }
            if (timestamp) {
                sessionStart = timestamp;
                query.timestamp = timestamp;
            }
            bulk.push(query);

            seconds = parseInt(seconds || 0);

            var beatCount = Math.ceil(seconds / 60);
            for (var i = 0; i < beatCount; i++) {
                if (seconds > 0) {
                    query = prepareQuery();
                    if (seconds > 60) {
                        query.session_duration = 60;
                    }
                    else {
                        query.session_duration = seconds;
                    }
                    if (conf.ip_address) {
                        query.ip_address = conf.ip_address;
                    }
                    if (timestamp) {
                        query.timestamp = timestamp + ((i + 1) * 60);
                    }
                    seconds -= 60;
                    bulk.push(query);
                }
            }
            conf.server.add_bulk_request(bulk);
        }
        else {
            lastParams.begin_session = arguments;
        }
        return this;
    };

    /**
    * Report custom event
    * @param {Event} event - Countly {@link Event} object
    * @param {string} event.key - name or id of the event
    * @param {number} [event.count=1] - how many times did event occur
    * @param {number=} event.sum - sum to report with event (if any)
    * @param {number=} event.dur - duration to report with event (if any)
    * @param {number=} event.timestamp - timestamp when event occurred
    * @param {Object=} event.segmentation - object with segments key /values
    * @returns {module:lib/countly-bulk-user} instance
     * */
    this.add_event = function(event) {
        cc.log(cc.logLevelEnums.INFO, `CountlyBulkUser add_event, Trying to add the event with key: [${event.key}].`);
        // initially no consent is given
        var respectiveConsent = false;
        // to match the internal events and their respective required consents. Sets respectiveConsent to true if the consent is given
        switch (event.key) {
        case cc.internalEventKeyEnums.NPS:
            respectiveConsent = this.check_consent('feedback');
            break;
        case cc.internalEventKeyEnums.SURVEY:
            respectiveConsent = this.check_consent('feedback');
            break;
        case cc.internalEventKeyEnums.STAR_RATING:
            respectiveConsent = this.check_consent('star-rating');
            break;
        case cc.internalEventKeyEnums.VIEW:
            respectiveConsent = this.check_consent('views');
            break;
        case cc.internalEventKeyEnums.ORIENTATION:
            respectiveConsent = this.check_consent('users');
            break;
        case cc.internalEventKeyEnums.PUSH_ACTION:
            respectiveConsent = this.check_consent('push');
            break;
        case cc.internalEventKeyEnums.ACTION:
            respectiveConsent = this.check_consent('clicks') || this.check_consent('scroll');
            break;
        default:
            respectiveConsent = this.check_consent('events');
        }

        if (respectiveConsent) {
            event.key = cc.truncateSingleValue(event.key, conf.maxKeyLength, "add_event");
            event.segmentation = cc.truncateObject(event.segmentation, conf.maxKeyLength, conf.maxValueSize, conf.maxSegmentationValues, "add_event");
            conf.server.add_event(conf.device_id, event);
        }
        return this;
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
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.user_details = function(user) {
        if (this.check_consent("users")) {
            user.name = cc.truncateSingleValue(user.name, conf.maxValueSize, "user_details");
            user.username = cc.truncateSingleValue(user.username, conf.maxValueSize, "user_details");
            user.email = cc.truncateSingleValue(user.email, conf.maxValueSize, "user_details");
            user.organization = cc.truncateSingleValue(user.organization, conf.maxValueSize, "user_details");
            user.phone = cc.truncateSingleValue(user.phone, conf.maxValueSize, "user_details");
            user.picture = cc.truncateSingleValue(user.picture, 4096, "user_details");
            user.gender = cc.truncateSingleValue(user.gender, conf.maxValueSize, "user_details");
            user.byear = cc.truncateSingleValue(user.byear, conf.maxValueSize, "user_details");
            user.custom = cc.truncateObject(user.custom, conf.maxKeyLength, conf.maxValueSize, conf.maxSegmentationValues, "user_details");
            var props = ["name", "username", "email", "organization", "phone", "picture", "gender", "byear", "custom"];
            var query = prepareQuery({ user_details: cc.getProperties(user, props) });
            conf.server.add_request(query);
        }
        return this;
    };

    /**
    * Report user conversion to the server (when you retrieved countly campaign data, for example through Android INSTALL_REFERER intent)
    * @param {string} campaign_id - id of campaign, the last part of the countly campaign link
    * @param {string=} campaign_user_id - id of user's clicked on campaign link, if you have one or provide null
    * @param {number=} timestamp - timestamp of the conversion
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.report_conversion = function(campaign_id, campaign_user_id, timestamp) {
        if (this.check_consent("attribution")) {
            var query = prepareQuery();

            if (campaign_id) {
                campaign_id = cc.truncateSingleValue(campaign_id, conf.maxValueSize, "report_conversion");

                query.campaign_id = campaign_id;
            }

            if (campaign_user_id) {
                campaign_user_id = cc.truncateSingleValue(campaign_user_id, conf.maxValueSize, "report_conversion");

                query.campaign_user = campaign_user_id;
            }

            if (timestamp || sessionStart !== 0) {
                query.timestamp = timestamp || sessionStart;
            }

            conf.server.add_request(query);
        }
        return this;
    };

    /**
    * Report user accessing specific view in your application
    * @param {string} view_name - name of the view or any other view identifier
    * @param {number} timestamp - when user accessed the view
    * @param {number} duration - how much did user spent on this view
    * @param {object=} viewSegments - optional key value object with segments to report with the view
    * @param {string} viewSegments.platform - on which platforms/os did user access this view
    * @param {boolean=} viewSegments.landing - true if user started using your app with this view
    * @param {boolean=} viewSegments.exit - true if user exited your app after this view
    * @param {boolean=} viewSegments.bounce - true if user bounced having only one view and without much interaction with the app 
    * @param {boolean=} viewSegments.{any} - provide any other key value pairs to store with view
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.report_view = function(view_name, timestamp, duration, viewSegments) {
        view_name = cc.truncateSingleValue(view_name, conf.maxValueSize, "report_view");

        if (this.check_consent("views")) {
            var event = {
                key: cc.internalEventKeyEnums.VIEW,
                dur: duration,
                count: 1,
                segmentation: {
                    name: view_name,
                    visit: 1,
                },
            };

            if (viewSegments) {
                for (var key in viewSegments) {
                    if (typeof event.segmentation[key] === "undefined") {
                        event.segmentation[key] = viewSegments[key];
                    }
                }
            }

            var query = prepareQuery({ events: [event] });
            if (timestamp) {
                query.timestamp = timestamp;
            }
            conf.server.add_request(query);
        }
        else {
            lastParams.track_pageview = arguments;
        }
        return this;
    };

    /**
    * Provide information about user
    * @param {Object} feedback - object with feedback properties
    * @param {string} feedback.widget_id - id of the widget in the dashboard
    * @param {string} feedback.platform - user's platform 
    * @param {string} feedback.app_version - app's app version 
    * @param {number} feedback.rating - user's rating
    * @param {boolean=} feedback.contactMe - did user give consent to contact him
    * @param {string=} feedback.email - user's email
    * @param {string=} feedback.comment - user's comment
    * @param {number=} timestamp - timestamp when feedback was acquired
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.report_feedback = function(feedback, timestamp) {
        if (this.check_consent("star-rating") || this.check_consent("feedback")) {
            if (!feedback.widget_id) {
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulkUser report_feedback, Feedback must contain 'widget_id' property.");
                return;
            }
            if (!feedback.rating) {
                cc.log(cc.logLevelEnums.ERROR, "CountlyBulkUser report_feedback, Feedback must contain 'rating' property.");
                return;
            }
            if (this.check_consent("events")) {
                var props = ["widget_id", "contactMe", "platform", "app_version", "rating", "email", "comment"];
                var event = {
                    key: cc.internalEventKeyEnums.STAR_RATING,
                    count: 1,
                    segmentation: {},
                };
                if (timestamp) {
                    event.timestamp = timestamp;
                }
                event.segmentation = cc.getProperties(feedback, props);
                cc.log(cc.logLevelEnums.INFO, `CountlyBulkUser report_feedback, Reporting feedback for the widget with ID: [${feedback.widget_id}].`);
                this.add_event(event);
            }
        }
        return this;
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
     * @returns {module:lib/countly-bulk-user} instance
     */
    this.report_trace = function(trace) {
        if (this.check_consent("apm")) {
            trace.name = cc.truncateSingleValue(trace.name, conf.maxKeyLength, "report_trace");
            trace.app_metrics = cc.truncateObject(trace.app_metrics, conf.maxKeyLength, conf.maxValueSize, conf.maxSegmentationValues, "report_trace");
            var props = ["type", "name", "stz", "etz", "apm_metrics", "apm_attr"];
            for (var i = 0; i < props.length; i++) {
                if (props[i] !== "apm_attr" && typeof trace[props[i]] === "undefined") {
                    cc.log(cc.logLevelEnums.ERROR, `CountlyBulkUser report_trace, APM trace must have a: [${props[i]}] param.`);
                    return;
                }
            }

            var e = cc.getProperties(trace, props);
            e.timestamp = trace.stz;
            var date = new Date();
            e.hour = date.getHours();
            e.dow = date.getDay();
            var query = prepareQuery({ apm: JSON.stringify(e) });

            cc.log(cc.logLevelEnums.INFO, "CountlyBulkUser report_trace, Adding APM trace to the queue.");

            conf.server.add_request(query);
        }
        return this;
    };

    /**
    * Report crash
    * @param {Object} crash - object containing information about crash and state of device
    * @param {string} crash._os - Platform/OS of the device,
    * @param {string} crash._os_version - Platform's/OS version
    * @param {string=} crash._manufacture - manufacture of the device
    * @param {string=} crash._device - device model
    * @param {string=} crash._resolution - device resolution
    * @param {string} crash._app_version - version of the app that crashed
    * @param {string=} crash._cpu - type of cpu used on device (for ios will be based on device)
    * @param {string=} crash._opengl - version of open gl supported
    * @param {number=} crash._ram_current - used amount of ram at the time of crash in megabytes
    * @param {number=} crash._ram_total - total available amount of ram in megabytes
    * @param {number=} crash._disk_current - used amount of disk space at the time of crash in megabytes
    * @param {number=} crash._disk_total - total amount of disk space in megabytes
    * @param {number=} crash._bat - battery level from 0 to 100
    * @param {string=} crash._orientation - orientation in which device was held, landscape, portrait, etc
    * @param {boolean=} crash._root - true if device is rooted/jailbroken, false or not provided if not
    * @param {boolean=} crash._online - true if device is connected to the internet (WiFi or 3G), false or not provided if not connected
    * @param {boolean=} crash._muted - true if volume is off, device is in muted state
    * @param {boolean=} crash._background - true if app was in background when it crashed
    * @param {string=} crash._name - identfiiable name of the crash if provided by OS/Platform, else will use first line of stack
    * @param {string} crash._error - error stack, can provide multiple separated by blank new lines
    * @param {boolean=} crash._nonfatal - true if handled exception, false or not provided if unhandled crash
    * @param {string=} crash._logs - some additional logs provided, if any 
    * @param {number=} crash._run - running time since app start in seconds until crash
    * @param {string=} crash._custom - custom key values to record with crash report, like versions of other libraries and frameworks used, etc.
    * @param {number} timestamp - when crash happened
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.report_crash = function(crash, timestamp) {
        if (this.check_consent("crashes")) {
            var query = prepareQuery({ crash: crash });
            if (timestamp) {
                query.timestamp = timestamp;
            }
            conf.server.add_request(query);
        }
        return this;
    };

    var customData = {};
    var change_custom_property = function(key, value, mod) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "change_custom_property");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "change_custom_property");

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
    };

    /**
    * Sets user's custom property value
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value to store under provided property
    * @returns {module:lib/countly-bulk-user} instance
    * @example
    * var CountlyBulk = require("countly-sdk-nodejs").Bulk;
    *
    * var server = new CountlyBulk({
    *   app_key: "{YOUR-API-KEY}",
    *   url: "https://API_HOST/",
    *   debug: true
    * });
    *
    * //adding requests by user
    * var user = server.addUser({device_id:"my_device_id"});
    * //set custom key value property
    * user.custom_set("twitter", "ar2rsawseen");
    * //create or increase specific number property
    * user.custom_increment("login_count");
    * //add new value to array property if it is not already there
    * user.custom_push_unique("selected_category", "IT");
    * //send all custom property modified data to server
    * user.custom_save();
    * */
    this.custom_set = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_set");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_set");
        customData[key] = value;
        return this;
    };
    /**
    * Sets user's custom property value only if it was not set before
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value to store under provided property
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_set_once = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_set_once");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_set_once");
        change_custom_property(key, value, "$setOnce");
        return this;
    };
    /**
    * Unset's/delete's user's custom property
    * @param {string} key - name of the property to delete
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_unset = function(key) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_unset");
        customData[key] = "";
        return this;
    };
    /**
    * Increment value under the key of this user's custom properties by one
    * @param {string} key - name of the property to attach to user
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_increment = function(key) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_increment");
        change_custom_property(key, 1, "$inc");
        return this;
    };
    /**
    * Increment value under the key of this user's custom properties by provided value
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value by which to increment server value
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_increment_by = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_increment_by");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_increment_by");
        change_custom_property(key, value, "$inc");
        return this;
    };
    /**
    * Multiply value under the key of this user's custom properties by provided value
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value by which to multiply server value
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_multiply = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_multiply");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_multiply");
        change_custom_property(key, value, "$mul");
        return this;
    };
    /**
    * Save maximal value under the key of this user's custom properties
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value which to compare to server's value and store maximal value of both provided
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_max = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_max");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_max");
        change_custom_property(key, value, "$max");
        return this;
    };
    /**
    * Save minimal value under the key of this user's custom properties
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value which to compare to server's value and store minimal value of both provided
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_min = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_min");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_min");
        change_custom_property(key, value, "$min");
        return this;
    };
    /**
    * Add value to array under the key of this user's custom properties. If property is not an array, it will be converted to array
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value which to add to array
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_push = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_push");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_push");
        change_custom_property(key, value, "$push");
        return this;
    };
    /**
    * Add value to array under the key of this user's custom properties, storing only unique values. If property is not an array, it will be converted to array
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value which to add to array
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_push_unique = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_push_unique");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_push_unique");
        change_custom_property(key, value, "$addToSet");
        return this;
    };
    /**
    * Remove value from array under the key of this user's custom properties
    * @param {string} key - name of the property
    * @param {string|number} value - value which to remove from array
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_pull = function(key, value) {
        key = cc.truncateSingleValue(key, conf.maxKeyLength, "custom_pull");
        value = cc.truncateSingleValue(value, conf.maxValueSize, "custom_pull");
        change_custom_property(key, value, "$pull");
        return this;
    };
    /**
    * Save changes made to user's custom properties object and send them to server
    * @returns {module:lib/countly-bulk-user} instance
    * */
    this.custom_save = function() {
        if (this.check_consent("users")) {
            var query = prepareQuery({ user_details: { custom: customData } });
            conf.server.add_request(query);
            cc.log(cc.logLevelEnums.DEBUG, "CountlyBulkUser custom_save, Adding the request to the queue.");
        }
        customData = {};
        return this;
    };

    /**
     *  Prepare query parameters
     *  @param {Object} query - query params
     *  @returns {Object} enhanced query params
     */
    function prepareQuery(query) {
        query = query || {};
        if (!query.device_id) {
            query.device_id = conf.device_id;
        }
        if (conf.ip_address && this.check_consent("location")) {
            query.ip_address = conf.ip_address;
        }
        return query;
    }
}

module.exports = CountlyBulkUser;
