/* eslint-disable no-unused-vars */
var path = require("path"),
    assert = require("assert"),
    fs = require("fs"),
    Countly = require("../../lib/countly.js");

//paths for convenience
var dir = path.resolve(__dirname, "../../");
var idDir = (dir + "/data/__cly_id.json");
var eventDir = (dir + "/data/__cly_event.json");
var reqDir = (dir + "/data/__cly_queue.json");
//timeout variables
var span = 50;
var mpan = 3000;
//parsing event queue
function readEventQueue() {
    var a = JSON.parse(fs.readFileSync(eventDir, "utf-8")).cly_event;
    return a;
}
//parsing request queue
function readRequestQueue() {
    var a = JSON.parse(fs.readFileSync(reqDir, "utf-8")).cly_queue;
    return a;
}

//queue files clearing logic
function clearStorage() {
    Countly.halt();
    if (fs.existsSync(idDir)) {
        fs.unlinkSync(idDir);
    }
    if (fs.existsSync(eventDir)) {
        fs.unlinkSync(eventDir);
    }
    if (fs.existsSync(reqDir)) {
        fs.unlinkSync(reqDir);
    }
}
/**
 * bunch of tests specifically gathered for testing events
 * @param {Object} eventObject - Original event object to test
 * @param {Object} eventQueue - Object from cly_queue that corresponds to the tested object's recording  
 * @param {Number} time - Expected time for timed event duration
 */
function eventValidator(eventObject, eventQueue, time) {
    //key key is mandatory
    assert.equal(eventObject.key, eventQueue.key);
    //check if count key exists. If it does add a test
    if (typeof eventObject.count !== 'undefined') {
        assert.equal(eventObject.count, eventQueue.count);
    }
    //check if sum key exists. If it does add a test
    if (typeof eventObject.sum !== 'undefined') {
        assert.equal(eventObject.sum, eventQueue.sum);
    }
    //check if dur key exists or if it is a timed event. If it is one of those add a test
    if (typeof eventObject.dur !== 'undefined' || typeof time !== 'undefined') {
        //set expected duration
        if (typeof time !== 'undefined') {
            eventObject.dur = time;
        }
        assert.equal(eventObject.dur, eventQueue.dur);
    }
    //check if segmentation exists. If it is add test(s)
    if (typeof eventObject.segmentation !== 'undefined') {
        //loop through segmentation keys and create tets
        for (var key in eventObject.segmentation) {
            assert.equal(eventObject.segmentation[key], eventQueue.segmentation[key]);
        }
    }
    //common parameter validation
    commonValidator(eventObject, eventQueue);
}
/**
 * bunch of tests specifically gathered for other validators
 * @param {Object} originalObject - Original object to test
 * @param {Object} testerObject - Tester object wrt the original 
 */
function commonValidator(originalObject, testerObject) {
    assert.ok(typeof testerObject.timestamp !== 'undefined');
    assert.ok(typeof testerObject.hour !== 'undefined');
    assert.ok(typeof testerObject.dow !== 'undefined');
}

//exports
module.exports = {
    clearStorage,
    span,
    mpan,
    readEventQueue,
    readRequestQueue,
    eventValidator
};