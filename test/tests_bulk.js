/* eslint-disable no-console */
const assert = require("assert");
const CountlyBulk = require("../lib/countly-bulk");
var hp = require("./helpers/helper_functions");
var storage = require("../lib/countly-storage");

function createBulk(storagePath) {
    var bulk = new CountlyBulk({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        storage_path: storagePath,
    });
    return bulk;
}

// note: this can replace the current one in the helper functions
function validateUserDetails(actual, expected) {
    const keys = ['name', 'username', 'email', 'organization', 'phone', 'picture', 'gender', 'byear', 'custom'];
    let isValid = true;
    keys.forEach((key) => {
        if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
            console.error(`Mismatch for key "${key}": expected "${expected[key]}", but got "${actual[key]}"`);
            isValid = false;
        }
    });
    // Validate nested custom object separately
    const customKeys = Object.keys(expected.custom || {});
    customKeys.forEach((key) => {
        if (actual.custom[key] !== expected.custom[key]) {
            console.error(`Mismatch in custom object for key "${key}": expected "${expected.custom[key]}", but got "${actual.custom[key]}"`);
            isValid = false;
        }
    });
    return isValid;
}

var eventObj = {
    key: "bulk_check",
    count: 55,
    sum: 3.14,
    dur: 2000,
    segmentation: {
        app_version: "1.0",
        country: "Zambia",
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
        key1: "value1 segment",
        key2: "value2 segment",
    },
};

describe("Bulk Tests", () => {
    it("1- Bulk with Default Storage Path", (done) => {
        storage.resetStorage();
        createBulk();
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        done();
    });

    it("2- Bulk with Custom Storage Path", (done) => {
        storage.resetStorage();
        createBulk("../test/customStorageDirectory/");
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        done();
    });

    it("3- Bulk add_user with Record Event", (done) => {
        storage.resetStorage();
        var bulk = createBulk();
        var user = bulk.add_user({ device_id: "testUser1" });
        user.add_event(eventObj);
        setTimeout(() => {
            var events = hp.readBulkEventQueue();
            var deviceEvents = events.testUser1; // Access the events for the specific device
            var recordedEvent = deviceEvents[0]; // Access the first event
            hp.eventValidator(eventObj, recordedEvent);
            done();
        }, hp.mWait);
    });

    it("4- Bulk add_user with User Details", (done) => {
        storage.resetStorage();
        var bulk = createBulk();
        var user = bulk.add_user({ device_id: "testUser2" });
        user.user_details(userDetailObj);

        // read event queue
        setTimeout(() => {
            var reqQueue = hp.readBulkReqQueue();
            var req = reqQueue[0];
            // Extract the user_details from the actual request
            const actualUserDetails = req.user_details || {};
            // Validate the user details
            const isValid = validateUserDetails(actualUserDetails, userDetailObj);
            assert.equal(true, isValid);
            done();
        }, hp.sWait);
    });

    it("5- Bulk add_request", (done) => {
        storage.resetStorage();
        var bulk = createBulk();
        bulk.add_request({ device_id: "TestUser4" });
        setTimeout(() => {
            var reqQueue = hp.readBulkReqQueue();
            var testUser4Request = reqQueue.find((req) => req.device_id === "TestUser4");
            assert.ok(testUser4Request);
            assert.strictEqual(testUser4Request.device_id, "TestUser4");
            assert.strictEqual(testUser4Request.app_key, "YOUR_APP_KEY");
            assert.strictEqual(testUser4Request.sdk_name, "javascript_native_nodejs_bulk");
            done();
        }, hp.sWait);
    });
});
/* eslint-enable no-console */