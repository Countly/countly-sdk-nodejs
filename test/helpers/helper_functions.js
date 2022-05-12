/* eslint-disable no-unused-vars */
var path = require("path");
var assert = require("assert");
var fs = require("fs");
var Countly = require("../../lib/countly");

// paths for convenience
var dir = path.resolve(__dirname, "../../");
var idDir = (`${dir}/data/__cly_id.json`);
var eventDir = (`${dir}/data/__cly_event.json`);
var reqDir = (`${dir}/data/__cly_queue.json`);
// timeout variables
var sWait = 50;
var mWait = 3000;
var lWait = 10000;
// parsing event queue
function readEventQueue() {
    var a = JSON.parse(fs.readFileSync(eventDir, "utf-8")).cly_event;
    return a;
}
// parsing request queue
function readRequestQueue() {
    var a = JSON.parse(fs.readFileSync(reqDir, "utf-8")).cly_queue;
    return a;
}

// queue files clearing logic
function clearStorage(keepID) {
    keepID = keepID || false;
    // Resets Countly
    Countly.halt(true);
    // clean storages
    if (fs.existsSync(eventDir)) {
        fs.unlinkSync(eventDir);
    }
    if (fs.existsSync(reqDir)) {
        fs.unlinkSync(reqDir);
    }
    if (!keepID) {
        if (fs.existsSync(idDir)) {
            fs.unlinkSync(idDir);
        }
    }
}
/**
 * bunch of tests specifically gathered for testing events
 * @param {Object} eventObject - Original event object to test
 * @param {Object} eventQueue - Object from cly_event that corresponds to the tested object's recording  
 * @param {Number} time - Expected time for timed event duration
 */
function eventValidator(eventObject, eventQueue, time) {
    // key key is mandatory
    assert.equal(eventObject.key, eventQueue.key);
    // check if count key exists. If it does add a test
    if (typeof eventObject.count !== 'undefined') {
        assert.equal(eventObject.count, eventQueue.count);
    }
    // check if sum key exists. If it does add a test
    if (typeof eventObject.sum !== 'undefined') {
        assert.equal(eventObject.sum, eventQueue.sum);
    }
    // check if dur key exists or if it is a timed event. If it is one of those add a test
    if (typeof eventObject.dur !== 'undefined' || typeof time !== 'undefined') {
        // set expected duration
        if (typeof time !== 'undefined') {
            eventObject.dur = time;
        }
        assert.equal(eventObject.dur, eventQueue.dur);
    }
    // check if segmentation exists. If it is add test(s)
    if (typeof eventObject.segmentation !== 'undefined') {
        // loop through segmentation keys and create tets
        for (var key in eventObject.segmentation) {
            assert.equal(eventObject.segmentation[key], eventQueue.segmentation[key]);
        }
    }
    // common parameter validation
    assert.ok(typeof eventQueue.timestamp !== 'undefined');
    assert.ok(typeof eventQueue.hour !== 'undefined');
    assert.ok(typeof eventQueue.dow !== 'undefined');
}
/**
 * bunch of tests specifically gathered for other validators
 * @param {Object} resultingObject - Resulting object wrt the request 
 * @param {String} id - Specific ID to verify
 */
function requestBaseParamValidator(resultingObject, id) {
    if (typeof id === 'undefined') {
        id = Countly.device_id;
    }
    assert.ok(resultingObject);
    assert.equal(Countly.app_key, resultingObject.app_key);
    assert.equal(id, resultingObject.device_id);
    assert.ok(typeof resultingObject.sdk_name !== 'undefined');
    assert.ok(typeof resultingObject.sdk_version !== 'undefined');
    assert.ok(typeof resultingObject.timestamp !== 'undefined');
    assert.ok(resultingObject.dow > -1 && resultingObject.dow < 24);
    assert.ok(resultingObject.dow > 0 && resultingObject.dow < 8);
}
/**
 * bunch of tests specifically gathered for testing crashes
 * @param {Object} validator - Object from cly_queue that corresponds to the tested crash's recording  
 * @param {Boolean} nonfatal - true if it is not a fatality 
 */
function crashRequestValidator(validator, nonfatal) {
    requestBaseParamValidator(validator);
    var crash = JSON.parse(validator.crash);
    assert.ok(crash._os);
    assert.ok(crash._os_version);
    assert.ok(crash._error);
    assert.ok(crash._app_version);
    assert.ok(typeof crash._run !== 'undefined');
    assert.ok(typeof crash._custom !== 'undefined');
    assert.equal(nonfatal, crash._nonfatal);
    assert.equal(true, crash._javascript);
    assert.equal(true, crash._not_os_specific);
}
/**
 * bunch of tests specifically gathered for testing sessions
 * @param {Object} beginSs - Object from cly_queue that corresponds to begin session recording  
 * @param {Object} endSs - Object from cly_queue that corresponds to end session recording  
 * @param {Number} time - Expected time for between session duration
 * @param {String} id - Initial ID if changed
 */
function sessionRequestValidator(beginSs, endSs, time, id) {
    // begin_session
    requestBaseParamValidator(beginSs, id);
    var metrics = JSON.parse(beginSs.metrics);
    assert.ok(metrics._os);
    assert.ok(metrics._os_version);
    assert.ok(metrics._app_version);
    assert.equal(1, beginSs.begin_session);
    // end_session
    if (typeof endSs !== 'undefined') {
        requestBaseParamValidator(endSs);
        assert.equal(1, endSs.end_session);
        assert.equal(time, endSs.session_duration);
    }
}
/**
 * bunch of tests specifically gathered for testing user details
 * @param {Object} originalDetails - Original object that contains user details  
 * @param {Object} details - Object from cly_queue that corresponds to user details recording  
 */
function userDetailRequestValidator(originalDetails, details) {
    requestBaseParamValidator(details);
    var user = JSON.parse(details.user_details);
    assert.equal(originalDetails.name, user.name);
    assert.equal(originalDetails.username, user.username);
    assert.equal(originalDetails.email, user.email);
    assert.equal(originalDetails.organization, user.organization);
    assert.equal(originalDetails.phone, user.phone);
    assert.equal(originalDetails.picture, user.picture);
    assert.equal(originalDetails.gender, user.gender);
    assert.equal(originalDetails.byear, user.byear);
    if (typeof originalDetails.custom !== 'undefined') {
        for (var key in originalDetails.custom) {
            assert.equal(originalDetails.custom[key], user.custom[key]);
        }
    }
}
/**
 * bunch of tests specifically gathered for testing page views
 * @param {Object} name - page name 
 * @param {Object} viewObj - Object from cly_event that corresponds to page view recording  
 * @param {Number} time - Expected duration if any 
 */
function viewEventValidator(name, viewObj, time) {
    assert.equal('[CLY]_view', viewObj.key);
    assert.equal(1, viewObj.count);
    assert.ok(typeof viewObj.timestamp !== 'undefined');
    assert.ok(viewObj.dow > -1 && viewObj.dow < 24);
    assert.ok(viewObj.dow > 0 && viewObj.dow < 8);
    assert.equal(name, viewObj.segmentation.name);
    if (typeof time === 'undefined') {
        assert.equal(1, viewObj.segmentation.visit);
    }
    else {
        assert.equal(time, viewObj.dur);
    }
    assert.ok(viewObj.segmentation.segment);
}
// exports
module.exports = {
    clearStorage,
    sWait,
    mWait,
    lWait,
    readEventQueue,
    readRequestQueue,
    eventValidator,
    crashRequestValidator,
    sessionRequestValidator,
    userDetailRequestValidator,
    viewEventValidator,
};