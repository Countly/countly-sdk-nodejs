/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* global runthis */
var path = require("path");
var assert = require("assert");
var fs = require("fs");
var fsp = require("fs/promises");
var Countly = require("../../lib/countly");
var CountlyStorage = require("../../lib/countly-storage");

// paths for convenience
var dir = path.resolve(__dirname, "../../");
var dir_test = path.resolve(__dirname, "../");

// paths for convenience
const DIR_CLY = (`${dir}/data`);
const DIR_CLY_ID = (`${dir}/data/__cly_id.json`);
const DIR_CLY_ID_type = (`${dir}/data/__cly_id_type.json`);
const DIR_CLY_event = (`${dir}/data/__cly_event.json`);
const DIR_CLY_request = (`${dir}/data/__cly_queue.json`);

// Bulk paths for convenience
const DIR_Bulk = (`${dir}/bulk_data`);
const DIR_Bulk_bulk = (`${dir}/bulk_data/__cly_bulk_queue.json`);
const DIR_Bulk_event = (`${dir}/bulk_data/__cly_bulk_event.json`);
const DIR_Bulk_request = (`${dir}/bulk_data/__cly_req_queue.json`);

// Custom
const DIR_Test = (`${dir_test}/customStorageDirectory`);
const DIR_Test_event = (`${dir_test}/customStorageDirectory/__cly_event.json`);
const DIR_Test_request = (`${dir_test}/customStorageDirectory/__cly_queue.json`);
const DIR_Test_bulk = (`${dir_test}/customStorageDirectory/__cly_bulk_queue.json`);
const DIR_Test_bulk_event = (`${dir_test}/customStorageDirectory/__cly_bulk_event.json`);
const DIR_Test_bulk_request = (`${dir_test}/customStorageDirectory/__cly_req_queue.json`);

// timeout variables
const sWait = 50;
const mWait = 3000;
const lWait = 10000;

// parsing event queue
function readEventQueue(givenPath = null, isBulk = false) {
    var destination = DIR_CLY_event;
    if (givenPath !== null) {
        destination = givenPath;
    }
    var a = JSON.parse(fs.readFileSync(destination, "utf-8")).cly_event;
    if (isBulk) {
        a = JSON.parse(fs.readFileSync(destination, "utf-8")).cly_bulk_event;
    }
    return a;
}
// parsing request queue
function readRequestQueue(customPath = false, isBulk = false, isMemory = false) {
    var destination = DIR_CLY_request;
    if (customPath) {
        destination = DIR_Test_request;
    }
    var a;
    if (isBulk) {
        a = JSON.parse(fs.readFileSync(destination, "utf-8")).cly_req_queue;
    }
    if (isMemory) {
        a = CountlyStorage.storeGet("cly_queue");
    }
    else {
        a = JSON.parse(fs.readFileSync(destination, "utf-8")).cly_queue;
    }
    return a;
}
function doesFileStoragePathsExist(callback, isBulk = false, testPath = false) {
    var paths = [DIR_CLY_ID, DIR_CLY_ID_type, DIR_CLY_event, DIR_CLY_request];

    if (isBulk) {
        paths = [DIR_Bulk_request, DIR_Bulk_event, DIR_Bulk_bulk];
    }
    else if (testPath) {
        paths = [DIR_Test_event, DIR_Test_request];
    }

    let errors = 0;
    paths.forEach((p, index) => {
        fs.access(p, fs.constants.F_OK, (err) => {
            if (err) {
                errors++;
            }
            if (index === p.length - 1) {
                callback(errors === 0);
            }
        });
    });
}
async function clearStorage(customPath = null) {
    Countly.halt(true);

    const relativePath = `../${customPath}`;
    const resolvedCustomPath = path.resolve(__dirname, relativePath);

    await fsp.rm(DIR_CLY, { recursive: true, force: true }).catch(() => { });
    await fsp.rm(DIR_Bulk, { recursive: true, force: true }).catch(() => { });
    await fsp.rm(DIR_Test, { recursive: true, force: true }).catch(() => { });

    if (resolvedCustomPath !== null && typeof resolvedCustomPath === 'string') {
        await fsp.rm(resolvedCustomPath, { recursive: true, force: true }).catch(() => { });
    }

    const storageExists = await fsp.access(DIR_CLY).then(() => true).catch(() => false);
    const bulkStorageExists = await fsp.access(DIR_Bulk).then(() => true).catch(() => false);
    const customTestStorage = await fsp.access(DIR_Test).then(() => true).catch(() => false);
    const customStorageExists = resolvedCustomPath !== null ? await fsp.access(resolvedCustomPath).then(() => true).catch(() => false) : false;

    if (storageExists || bulkStorageExists || customTestStorage || customStorageExists) {
        throw new Error("Failed to clear storage");
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
    // check if segmentation exists. If it does, add tests
    if (typeof eventObject.segmentation !== 'undefined') {
        // loop through segmentation keys and create tests
        for (var key in eventObject.segmentation) {
            if (Array.isArray(eventObject.segmentation[key]) || typeof eventObject.segmentation[key] === 'object') {
                assert.deepStrictEqual(eventObject.segmentation[key], eventQueue.segmentation[key]);
            }
            else {
                assert.equal(eventObject.segmentation[key], eventQueue.segmentation[key]);
            }
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
    assert.ok(resultingObject.dow >= 0 && resultingObject.dow < 8);
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

function validateUserDetails(actual, expected) {
    // Helper function to remove undefined values
    const cleanObj = (obj) => {
        if (typeof obj === "string") {
            try {
                // Parse if it's a JSON string
                obj = JSON.parse(obj);
            }
            catch (e) {
                console.error("Invalid JSON string:", obj);
                // Return null for invalid JSON
                return null;
            }
        }
        // Remove properties with undefined values
        return Object.fromEntries(Object.entries(obj).filter(([_, value]) => value !== undefined));
    };
    const cleanedActual = cleanObj(actual);
    const cleanedExpected = cleanObj(expected);
    if (!cleanedActual || !cleanedExpected) {
        // If either cleaned object is null, validation fails
        return false;
    }
    // Perform deep strict comparison after cleaning up undefined values
    try {
        assert.deepStrictEqual(cleanedActual, cleanedExpected);
        return true;
    }
    catch (e) {
        console.log("Validation failed:", e);
        return false;
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
    validateUserDetails,
    viewEventValidator,
    doesFileStoragePathsExist,
    requestBaseParamValidator,
};