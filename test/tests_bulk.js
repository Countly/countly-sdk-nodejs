/* eslint-disable no-console */
/* global runthis */
const assert = require("assert");
const CountlyBulk = require("../lib/countly-bulk");
var hp = require("./helpers/helper_functions");
var storage = require("../lib/countly-storage");
var testUtils = require("./helpers/test_utils");

const { StorageTypes } = CountlyBulk;

var appKey = "YOUR_APP_KEY";
var serverUrl = "https://tests.url.cly";

function validateCrash(validator, nonfatal) {
    assert.ok(validator.crash._os);
    assert.ok(validator.crash._os_version);
    assert.ok(validator.crash._error);
    assert.ok(validator.crash._app_version);
    assert.ok(typeof validator.crash._run !== 'undefined');
    assert.ok(typeof validator.crash._custom !== 'undefined');
    assert.equal(nonfatal, validator.crash._nonfatal);
    assert.equal(true, validator.crash._javascript);
    assert.equal(true, validator.crash._not_os_specific);
}

// Create bulk data
function createBulkData(bulk) {
    // Add an event
    var user = bulk.add_user({ device_id: "testUser1" });
    user.add_event(testUtils.getEventObj());

    // add user details
    var user2 = bulk.add_user({ device_id: "testUser2" });
    user2.user_details(testUtils.getUserDetailsObj());

    // add request
    bulk.add_request({ device_id: "TestUser3" });

    // add Crash
    var user4 = bulk.add_user({ device_id: "TestUser4" });
    try {
        runthis();
    }
    catch (ex) {
        user4.report_crash({
            _os: "Android",
            _os_version: "7",
            _error: "Stack trace goes here",
            _app_version: "1.0",
            _run: 12345,
            _custom: {},
            _nonfatal: true,
            _javascript: true,
            _not_os_specific: true,
        }, 1500645200);
    }
}

// Validate created bulk data
function validateCreatedBulkData(bulk) {
    var events = bulk._getBulkEventQueue();
    var reqQueue = bulk._getBulkRequestQueue();
    var bulkQueue = bulk._getBulkQueue();

    assert.equal(Object.keys(events).length, 1);
    assert.equal(reqQueue.length, 3);
    assert.equal(bulkQueue.length, 0);

    var deviceEvents = events.testUser1; // Access the events for the specific device
    var recordedEvent = deviceEvents[0]; // Access the first event
    hp.eventValidator(testUtils.getEventObj(), recordedEvent);

    var req = reqQueue[0]; // read user details queue
    const actualUserDetails = req.user_details; // Extract the user_details from the actual request
    const isValid = hp.validateUserDetails(actualUserDetails, testUtils.getUserDetailsObj());
    assert.equal(true, isValid);

    var testUser3Request = reqQueue.find((request) => request.device_id === "TestUser3");
    assert.ok(testUser3Request);
    assert.strictEqual(testUser3Request.device_id, "TestUser3");
    assert.strictEqual(testUser3Request.app_key, "YOUR_APP_KEY");
    assert.strictEqual(testUser3Request.sdk_name, "javascript_native_nodejs_bulk");

    var testUser4Request = reqQueue.find((request) => request.device_id === "TestUser4");
    validateCrash(testUser4Request, true);
}

function shouldFilesExist(shouldExist, isCustomTest = false) {
    hp.doesFileStoragePathsExist((exists) => {
        assert.equal(shouldExist, exists);
    }, true, isCustomTest);
}

describe("Bulk Tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });

    it("1- CNR", (done) => {
        var bulk = new CountlyBulk({
            app_key: appKey,
            url: serverUrl,
        });
        assert.equal(storage.getStoragePath(), undefined);
        shouldFilesExist(false);
        createBulkData(bulk);

        setTimeout(() => {
            validateCreatedBulkData(bulk);
            shouldFilesExist(false);
            done();
        }, hp.mWait);
    });

    it("2- CNR_cPath_file", (done) => {
        var bulk = new CountlyBulk({
            app_key: appKey,
            url: serverUrl,
            storage_path: "../test/customStorageDirectory/",
            storage_type: StorageTypes.FILE,
        });
        shouldFilesExist(true, true);
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        createBulkData(bulk);

        setTimeout(() => {
            validateCreatedBulkData(bulk);
            shouldFilesExist(true, true);
            assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
            done();
        }, hp.sWait);
    });

    it("3- CNR_file", (done) => {
        var bulk = new CountlyBulk({
            app_key: appKey,
            url: serverUrl,
            storage_type: StorageTypes.FILE,
        });
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        shouldFilesExist(true);
        createBulkData(bulk);

        setTimeout(() => {
            validateCreatedBulkData(bulk);
            shouldFilesExist(true);
            assert.equal(storage.getStoragePath(), "../bulk_data/");
            done();
        }, hp.mWait);
    });

    it("4- CNR_memory", (done) => {
        var bulk = new CountlyBulk({
            app_key: appKey,
            url: serverUrl,
            storage_type: StorageTypes.MEMORY,
        });
        assert.equal(storage.getStoragePath(), undefined);
        shouldFilesExist(false);
        createBulkData(bulk);

        setTimeout(() => {
            validateCreatedBulkData(bulk);
            shouldFilesExist(false);
            assert.equal(storage.getStoragePath(), undefined);
            done();
        }, hp.mWait);
    });
});

// Currently tested: CNR, CNR_cPath_file, CNR_file
// TODO: Add tests for the following:
// - CNR: cPath_memory, persistTrue, persistFalse, cPath_persistTrue, cPath_persistFalse, persistTrue_file, persistFalse_file, cPath_persistTrue_file, cPath_persistFalse_file
// - CR_CG for all of the above
