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
 * @returns {module:lib/countly-bulk-user} instance
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
 * user.begin_session().add_event({key:"Test", count:1})
 */
function CountlyBulkUser(conf){
    "use strict";
    
    var sessionStart = 0,
    syncConsents = {},
    lastParams = {};
    
    /**
    * Array with list of available features that you can require consent for
    */ 
    var features = ["sessions","events","views","crashes","attribution","users","star-rating","location"];
    
    //create object to store consents
    var consents = {};
    for(var i = 0; i < features.length; i++){
        consents[features[i]] = {};
    }

    if(!conf.device_id){
        log("device_id is missing");
        return;
    }
    
    if(!conf.server){
        log("server instance is missing");
        return;
    }
    
    
    /**
    * Modify feature groups for consent management. Allows you to group multiple features under one feature group
    * @param {object} features - object to define feature name as key and core features as value
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
    this.group_features = function(features){
        if(features){
            var ob;
            for(var i in features){
                ob = {};
                if(!consents[i]){
                    if(typeof features[i] === "string"){
                        consents[i] = {features:[features[i]]};
                    }
                    else if(features[i] && features[i].constructor === Array && features[i].length){
                        consents[i] = {features:features[i]};
                    }
                    else{
                        log("Incorrect feature list for "+i+" value: "+features[i]);
                    }
                }
                else{
                    log("Feature name "+i+" is already reserved");
                }
            }
        }
        else{
            log("Incorrect features: "+features);
        }
    };
    
    /**
    * Check if consent is given for specific feature (either core feature of from custom feature group)
    * @param {string} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link CountlyBulkUser.group_features}
    */
    this.check_consent = function(feature){
        if(!conf.require_consent){
            //we don't need to have specific consents
            return true;
        }
        if(consents[feature]){
            return (consents[feature] && consents[feature].optin) ? true : false;
        }
        else{
            log("No feature available for "+feature);
        }
        return false;
    };
    
    /**
    * Add consent for specific feature, meaning, user allowed to track that data (either core feature of from custom feature group). Add consent before adding any data, or else this data will be ignored, as per not having consent
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link CountlyBulkUser.group_features}
    */
    this.add_consent = function(feature){
        log("Adding consent for "+feature);
        if(feature.constructor === Array){
            for(var i = 0; i < feature.length; i++){
                this.add_consent(feature[i]);
            }
        }
        else if(consents[feature]){
            if(consents[feature].features){
                consents[feature].optin = true;
                //this is added group, let's iterate through sub features
                this.add_consent(consents[feature].features);
            }
            else{
                //this is core feature
                if(consents[feature].optin !== true){
                    syncConsents[feature] = true;
                    consents[feature].optin = true;
                    updateConsent();
                    setTimeout(function(){
                        if(feature === "sessions" && lastParams.begin_session){
                            this.begin_session.apply(this, lastParams.begin_session);
                            lastParams.begin_session = null;
                        }
                        else if(feature === "views" && lastParams.track_pageview){
                            this.track_pageview.apply(this, lastParams.track_pageview);
                            lastParams.track_pageview = null;
                        }
                    },1);
                }
            }
        }
        else{
            log("No feature available for "+feature);
        }
    };
    
    
    /**
    * Remove consent for specific feature, meaning, user opted out to track that data (either core feature of from custom feature group)
    * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","crashes","attribution","users" or customly provided through {@link CountlyBulkUser.group_features}
    */
    this.remove_consent = function(feature){
        log("Removing consent for "+feature);
        if(feature.constructor === Array){
            for(var i = 0; i < feature.length; i++){
                this.remove_consent(feature[i]);
            }
        }
        else if(consents[feature]){
            if(consents[feature].features){
                //this is added group, let's iterate through sub features
                this.remove_consent(consents[feature].features);
            }
            else{
                //this is core feature
                if(consents[feature].optin !== false){
                    syncConsents[feature] = false;
                    updateConsent();
                }
            }
            consents[feature].optin = false;
        }
        else{
            log("No feature available for "+feature);
        }
    };
    
    var consentTimer;
    var updateConsent = function(){
        if(consentTimer){
            //delay syncing consents
            clearTimeout(consentTimer);
            consentTimer = null;
        }
        consentTimer = setTimeout(function(){
            if(Object.keys(syncConsents).length){
                //we have consents to sync, create request
                conf.server.add_bulk_request([{consent:JSON.stringify(syncConsents)}]);
                //clear consents that needs syncing
                syncConsents = {};
            }
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
    **/
    this.begin_session = function(metrics, seconds, timestamp){
        if(this.check_consent("sessions")){
            var bulk = [];
            var query = prepareQuery({begin_session:1, metrics:metrics});
            if(this.check_consent("location")){
                if(conf.country_code){
                    query.country_code = conf.country_code;
                }
                if(conf.city){
                    query.city = conf.city;
                }
            }
            else{
                query.location = "";
            }
            if(timestamp){
                sessionStart = timestamp;
                query.timestamp = timestamp;
            }
            bulk.push(query);
            
            seconds = parseInt(seconds || 0);
            
            var beatCount = Math.ceil(seconds/60);
            for(var i = 0; i < beatCount; i++){
                if(seconds > 0){
                    query = prepareQuery();
                    if(seconds > 60){
                        query.session_duration = 60;
                    }
                    else{
                        query.session_duration = seconds;
                    }
                    if(conf.ip_address){
                        query.ip_address = conf.ip_address;
                    }
                    if(timestamp){
                        query.timestamp = timestamp+((i+1)*60);
                    }
                    seconds -= 60;
                    bulk.push(query);
                }
            }
            conf.server.add_bulk_request(bulk);
        }
        else{
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
    **/
    this.add_event = function(event){
        if(this.check_consent("events")){
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
    **/
    this.user_details = function(user){
        if(this.check_consent("users")){
            var props = ["name", "username", "email", "organization", "phone", "picture", "gender", "byear", "custom"];
            var query = prepareQuery({user_details: getProperties(user, props)});
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
    **/
    this.report_conversion = function(campaign_id, campaign_user_id, timestamp){
        if(this.check_consent("attribution")){
            var query = prepareQuery();
            
            if(campaign_id){
                query.campaign_id = campaign_id;
            }
            
            if(campaign_user_id){
                query.campaign_user = campaign_user_id;
            }
            
            if(timestamp || sessionStart !== 0){
                query.timestamp = timestamp || sessionStart;
            }
            
            conf.server.add_request(query);
        }
        return this;
    };
    
    /**
    * Report user accessing specific view in your application
    * @param {string} view_name - name of the view or any other view identifier
    * @param {string} platform - on which platforms/os did user access this view
    * @param {number} timestamp - when user accessed the view
    * @param {number} duration - how much did user spent on this view
    * @param {boolean=} landing - true if user started using your app with this view
    * @param {boolean=} exit - true if user exited your app after this view
    * @param {boolean=} bounce - true if user bounced having only one view and without much interaction with the app 
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.report_view = function(view_name, platform, timestamp, duration, landing, exit, bounce){
        if(this.check_consent("views")){
            var event = {
                "key": "[CLY]_view",
                "dur": duration,
                "count": 1,
                "segmentation": {
                    "name": view_name,
                    "visit":1,
                    "segment":platform
                }
            };
            if(landing){
                event.segmentation.start = 1;
            }
            if(exit){
                event.segmentation.exit = 1;
            }
            if(bounce){
                event.segmentation.bounce = 1;
            }
            var query = prepareQuery({events:[event]});
            if(timestamp){
                query.timestamp = timestamp;
            }
            conf.server.add_request(query);
        }
        else{
            lastParams.track_pageview = arguments;
        }
        return this;
    };
    
    /**
    * Report rating user left on the app
    * @param {number} rating - rating from 1 to 5
    * @param {string} platform - on which platforms/os did user leave rating
    * @param {number} app_version - for which app_version did user leave rating
    * @param {number} timestamp - when user rated the app
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.report_rating = function(rating, platform, app_version, timestamp){
        if(this.check_consent("star-rating")){
            var event = {
                "key": "[CLY]_star_rating",
                "count": 1,
                "segmentation": {
                    "rating": rating,
                    "app_version":app_version,
                    "platform":platform
                }
            };
            var query = prepareQuery({events:[event]});
            if(timestamp){
                query.timestamp = timestamp;
            }
            conf.server.add_request(query);
            return this;
        }
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
    **/
    this.report_crash = function(crash, timestamp){
        if(this.check_consent("crashes")){
            var query = prepareQuery({crash:crash});
            if(timestamp){
                query.timestamp = timestamp;
            }
            conf.server.add_request(query);
        }
        return this;
    };
    
    var customData = {};
    var change_custom_property = function(key, value, mod){
        if(!customData[key]){
            customData[key] = {};
        }
        if(mod === "$push" || mod === "$pull" || mod === "$addToSet"){
            if(!customData[key][mod]){
                customData[key][mod] = [];
            }
            customData[key][mod].push(value);
        }
        else{
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
    **/
    this.custom_set = function(key, value){
        customData[key] = value;
        return this;
    };
    /**
    * Sets user's custom property value only if it was not set before
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value to store under provided property
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_set_once = function(key, value){
        change_custom_property(key, 1, "$setOnce");
        return this;
    };
    /**
    * Unset's/delete's user's custom property
    * @param {string} key - name of the property to delete
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_unset = function (key) {
        customData[key] = "";
        return this;
    };
    /**
    * Increment value under the key of this user's custom properties by one
    * @param {string} key - name of the property to attach to user
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_increment = function(key){
        change_custom_property(key, 1, "$inc");
        return this;
    };
    /**
    * Increment value under the key of this user's custom properties by provided value
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value by which to increment server value
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_increment_by = function(key, value){
        change_custom_property(key, value, "$inc");
        return this;
    };
    /**
    * Multiply value under the key of this user's custom properties by provided value
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value by which to multiply server value
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_multiply = function(key, value){
        change_custom_property(key, value, "$mul");
        return this;
    };
    /**
    * Save maximal value under the key of this user's custom properties
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value which to compare to server's value and store maximal value of both provided
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_max = function(key, value){
        change_custom_property(key, value, "$max");
        return this;
    };
    /**
    * Save minimal value under the key of this user's custom properties
    * @param {string} key - name of the property to attach to user
    * @param {number} value - value which to compare to server's value and store minimal value of both provided
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_min = function(key, value){
        change_custom_property(key, value, "$min");
        return this;
    };
    /**
    * Add value to array under the key of this user's custom properties. If property is not an array, it will be converted to array
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value which to add to array
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_push = function(key, value){
        change_custom_property(key, value, "$push");
        return this;
    };
    /**
    * Add value to array under the key of this user's custom properties, storing only unique values. If property is not an array, it will be converted to array
    * @param {string} key - name of the property to attach to user
    * @param {string|number} value - value which to add to array
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_push_unique = function(key, value){
        change_custom_property(key, value, "$addToSet");
        return this;
    };
    /**
    * Remove value from array under the key of this user's custom properties
    * @param {string} key - name of the property
    * @param {string|number} value - value which to remove from array
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_pull = function(key, value){
        change_custom_property(key, value, "$pull");
        return this;
    };
    /**
    * Save changes made to user's custom properties object and send them to server
    * @returns {module:lib/countly-bulk-user} instance
    **/
    this.custom_save = function(){
        if(this.check_consent("users")){
            var query = prepareQuery({user_details:{custom:customData}});
            conf.server.add_request(query);
        }
        customData = {};
        return this;
    };
    
    //log stuff
    function log(){
        if(conf.debug && typeof console !== "undefined"){
            if(arguments[1] && typeof arguments[1] === "object"){
                arguments[1] = JSON.stringify(arguments[1]);
            }
            console.log( Array.prototype.slice.call(arguments).join("\n") );
        }
    }
    
    function prepareQuery(query){
        query = query || {};
        if(!query.device_id){
            query.device_id = conf.device_id;
        }
        if(conf.ip_address && this.check_consent("location")){
            query.ip_address = conf.ip_address;
        }
        return query;
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
}

module.exports = CountlyBulkUser;
