/* eslint-disable no-console */
/* global runthis */
var path = require("path");
const assert = require("assert");
const CountlyBulk = require("../lib/countly-bulk");
var hp = require("./helpers/helper_functions");
var storage = require("../lib/countly-storage");
var cc = require("../lib/countly-common");

const StorageTypes = cc.storageTypeEnums;

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

// note: this can replace the current one in the helper functions
function validateUserDetails(actual, expected) {
    const keys = ['name', 'username', 'email', 'organization', 'phone', 'picture', 'gender', 'byear', 'custom'];
    let isValid = true;

    keys.forEach((key) => {
        if (typeof actual[key] === 'object' && actual[key] !== null) {
            if (Array.isArray(actual[key])) {
                if (!Array.isArray(expected[key]) || JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
                    console.error(`Mismatch for key "${key}": expected "${JSON.stringify(expected[key])}", but got "${JSON.stringify(actual[key])}"`);
                    isValid = false;
                }
            }
            else {
                if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
                    console.error(`Mismatch for key "${key}": expected "${JSON.stringify(expected[key])}", but got "${JSON.stringify(actual[key])}"`);
                    isValid = false;
                }
            }
        }
        else if (actual[key] !== expected[key]) {
            console.error(`Mismatch for key "${key}": expected "${expected[key]}", but got "${actual[key]}"`);
            isValid = false;
        }
    });
    // Validate nested custom object separately
    if (expected.custom && actual.custom) {
        const customKeys = Object.keys(expected.custom);
        customKeys.forEach((key) => {
            if (typeof actual.custom[key] === 'object' && actual.custom[key] !== null) {
                if (Array.isArray(actual.custom[key])) {
                    if (!Array.isArray(expected.custom[key]) || JSON.stringify(actual.custom[key]) !== JSON.stringify(expected.custom[key])) {
                        console.error(`Mismatch in custom object for key "${key}": expected "${JSON.stringify(expected.custom[key])}", but got "${JSON.stringify(actual.custom[key])}"`);
                        isValid = false;
                    }
                }
                else {
                    if (JSON.stringify(actual.custom[key]) !== JSON.stringify(expected.custom[key])) {
                        console.error(`Mismatch in custom object for key "${key}": expected "${JSON.stringify(expected.custom[key])}", but got "${JSON.stringify(actual.custom[key])}"`);
                        isValid = false;
                    }
                }
            }
            else if (actual.custom[key] !== expected.custom[key]) {
                console.error(`Mismatch in custom object for key "${key}": expected "${expected.custom[key]}", but got "${actual.custom[key]}"`);
                isValid = false;
            }
        });
    }
    return isValid;
}

var eventObj = {
    key: "bulk_check",
    count: 55,
    sum: 3.14,
    dur: 2000,
    segmentation: {
        string_value: "example",
        number_value: 42,
        boolean_value: true,
        array_value: ["item1", "item2"],
        object_value: { nested_key: "nested_value" },
        null_value: null,
        undefined_value: undefined,
    },
};

var userDetailObj = {
    name: "Alexandrina Jovovich",
    username: "alex_jov",
    email: "alex.jov@example.com",
    organization: "TechNova",
    phone: "+987654321",
    picture: "https://example.com/images/profile_alex.jpg",
    gender: "Female",
    byear: 1992, // birth year
    custom: {
        string_value: "example",
        number_value: 42,
        boolean_value: true,
        array_value: ["item1", "item2"],
        object_value: { nested_key: "nested_value" },
        null_value: null,
        undefined_value: undefined,
    },
};

describe("Bulk Tests", () => {
    // Bulk is on memory by default
    // If no storage path and storage type provided during init Bulk should use memory storage
    it("1- Bulk with No Storage Path and Storage Type", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        assert.equal(storage.getStoragePath(), undefined);
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        }, true);
        done();
    });

    // Providing storage path and storage type to Bulk
    // Storage path should be the provided custom path and default bulk file paths should not exist
    it("2- Bulk with Custom Storage Path", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            storage_path: "../test/customStorageDirectory/",
            storage_type: StorageTypes.FILE,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        }, true);
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        done();
    });

    // Initialize CountlyBulk and record an event
    // Bulk should initialize correctly, default bulk file paths should not exist
    // Event should be recorded and validated in event queue
    it("3- Bulk add_user with Record Event", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        }, true);
        var user = bulk.add_user({ device_id: "testUser1" });
        user.add_event(eventObj);
        setTimeout(() => {
            var events = bulk.getBulkEventQueue();
            var deviceEvents = events.testUser1; // Access the events for the specific device
            var recordedEvent = deviceEvents[0]; // Access the first event
            hp.eventValidator(eventObj, recordedEvent);
            done();
        }, hp.mWait);
    });

    // Initialize CountlyBulk and record user details
    // Bulk should initialize correctly, default bulk file paths should not exist
    // User details should be recorded and validated in request queue
    it("4- Bulk add_user with User Details", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        }, true);
        var user = bulk.add_user({ device_id: "testUser2" });
        user.user_details(userDetailObj);
        // read event queue
        setTimeout(() => {
            var reqQueue = bulk.getBulkRequestQueue();
            var req = reqQueue[0];
            // Extract the user_details from the actual request
            const actualUserDetails = req.user_details || {};
            // Validate the user details
            const isValid = validateUserDetails(actualUserDetails, userDetailObj);
            assert.equal(true, isValid);
            done();
        }, hp.sWait);
    });

    // Initialize CountlyBulk and call add_request
    // Bulk should initialize correctly, default bulk file paths should not exist
    // Request should be added correctly and validated
    it("5- Bulk add_request", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        }, true);
        bulk.add_request({ device_id: "TestUser3" });
        setTimeout(() => {
            var reqQueue = bulk.getBulkRequestQueue();
            var testUser3Request = reqQueue.find((req) => req.device_id === "TestUser3");
            assert.ok(testUser3Request);
            assert.strictEqual(testUser3Request.device_id, "TestUser3");
            assert.strictEqual(testUser3Request.app_key, "YOUR_APP_KEY");
            assert.strictEqual(testUser3Request.sdk_name, "javascript_native_nodejs_bulk");
            done();
        }, hp.sWait);
    });

    // Initialize CountlyBulk and report crash
    // Bulk should initialize correctly, default bulk file paths should not exist
    // Crash should be recorded correctly and validated
    it("6- Bulk add_user Report Crash", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        }, true);
        var user = bulk.add_user({ device_id: "TestUser4" });
        try {
            runthis();
        }
        catch (ex) {
            user.report_crash({
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
        // read event queue
        setTimeout(() => {
            var reqQueue = bulk.getBulkRequestQueue();
            var testUser4Request = reqQueue.find((req) => req.device_id === "TestUser4");
            validateCrash(testUser4Request, true);
            done();
        }, hp.sWait);
    });

    // Initialize CountlyBulk in File Storage and record an event
    // Bulk should initialize correctly, default bulk file paths should exist
    // Event should be recorded and validated in event queue
    it("7- Bulk File Storage add_user with Record Event", (done) => {
        hp.clearStorage();
        var bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            storage_type: StorageTypes.FILE,
        });
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(true, exists);
        }, true);
        var user = bulk.add_user({ device_id: "testUser1" });
        user.add_event(eventObj);
        setTimeout(() => {
            var events = bulk.getBulkEventQueue();
            var deviceEvents = events.testUser1; // Access the events for the specific device
            var recordedEvent = deviceEvents[0]; // Access the first event
            hp.eventValidator(eventObj, recordedEvent);
            done();
        }, hp.mWait);
    });
});