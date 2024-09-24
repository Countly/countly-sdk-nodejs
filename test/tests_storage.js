const assert = require("assert");
var Countly = require("../lib/countly");
var storage = require("../lib/countly-storage");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

// example event object to use 
var eventObj = {
    key: "storage_check",
    count: 5,
    sum: 3.14,
    dur: 2000,
    segmentation: {
        app_version: "1.0",
        country: "Zambia",
    },
};

var userDetailObj = {
    name: "Akira Kurosawa",
    username: "a_kurosawa",
    email: "akira.kurosawa@filmlegacy.com",
    organization: "Toho Studios",
    phone: "+81312345678",
    picture: "https://example.com/profile_images/akira_kurosawa.jpg",
    gender: "Male",
    byear: 1910,
    custom: {
        "known for": "Film Director",
        "notable works": "Seven Samurai, Rashomon, Ran",
    },
};

// init function
function initMain(device_id) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://test.url.ly",
        interval: 10000,
        max_events: -1,
        device_id: device_id,
    });
}
// TODO: move these to helpers to reduce duplication
function validateSdkGeneratedId(providedDeviceId) {
    assert.ok(providedDeviceId);
    assert.equal(providedDeviceId.length, 36);
    assert.ok(cc.isUUID(providedDeviceId));
}
function checkRequestsForT(queue, expectedInternalType) {
    for (var i = 0; i < queue.length; i++) {
        assert.ok(queue[i].t);
        assert.equal(queue[i].t, expectedInternalType);
    }
}
function validateDeviceId(deviceId, deviceIdType, expectedDeviceId, expectedDeviceIdType) {
    var rq = hp.readRequestQueue()[0];
    if (expectedDeviceIdType === cc.deviceIdTypeEnums.SDK_GENERATED) {
        validateSdkGeneratedId(deviceId); // for SDK-generated IDs
    }
    else {
        assert.equal(deviceId, expectedDeviceId); // for developer-supplied IDs
    }
    assert.equal(deviceIdType, expectedDeviceIdType);
    checkRequestsForT(rq, expectedDeviceIdType);
}
function recordValuesToStorageAndValidate(userPath, memoryOnly = false, isBulk = false, persistQueue = false) {
    // Set values
    var deviceIdType = cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED;
    storage.initStorage(userPath, memoryOnly, isBulk, persistQueue);
    storage.storeSet("cly_id", "SpecialDeviceId");
    storage.storeSet("cly_id_type", deviceIdType);

    // Set values with different data types
    storage.storeSet("cly_count", 42);
    storage.storeSet("cly_object", { key: "value" });
    storage.storeSet("cly_null", null);

    // Retrieve and assert values
    assert.equal(storage.storeGet("cly_id"), "SpecialDeviceId");
    assert.equal(storage.storeGet("cly_id_type"), deviceIdType);
    assert.equal(storage.storeGet("cly_count"), 42);
    assert.deepEqual(storage.storeGet("cly_object"), { key: "value" });
    assert.equal(storage.storeGet("cly_null"), null);

    // Remove specific items by overriding with null or empty array
    storage.storeSet("cly_id", null);
    storage.storeSet("cly_object", []);
    assert.equal(storage.storeGet("cly_id"), null);
    assert.deepEqual(storage.storeGet("cly_object"), []);

    // Reset storage and check if it's empty again
    storage.resetStorage();
    assert.equal(storage.storeGet("cly_id"), undefined);
    assert.equal(storage.storeGet("cly_id_type"), undefined);
    assert.equal(storage.storeGet("cly_count"), undefined);
    assert.equal(storage.storeGet("cly_object"), undefined);
    assert.equal(storage.storeGet("cly_null"), undefined);
}

describe("Storage Tests", () => {
    it("1- Store Generated Device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            validateSdkGeneratedId(Countly.get_device_id());
            done();
        }, hp.sWait);
    });

    it("1.1- Validate generated device id after process restart", (done) => {
        initMain();
        validateDeviceId(Countly.get_device_id(), Countly.get_device_id_type(), undefined, cc.deviceIdTypeEnums.SDK_GENERATED);
        done();
    });

    it("2.Developer supplied device ID", (done) => {
        hp.clearStorage();
        initMain("ID");
        Countly.begin_session();
        setTimeout(() => {
            validateDeviceId(Countly.get_device_id(), Countly.get_device_id_type(), "ID", cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
            done();
        }, hp.sWait);
    });

    it("2.1- Validate generated device id after process restart", (done) => {
        validateDeviceId(Countly.get_device_id(), Countly.get_device_id_type(), "ID", cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
        done();
    });

    it("3- Record and validate all user details", (done) => {
        hp.clearStorage();
        initMain();
        Countly.user_details(userDetailObj);
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.userDetailRequestValidator(userDetailObj, req);
            done();
        }, hp.sWait);
    });

    it("3.1- Validate stored user detail", (done) => {
        var req = hp.readRequestQueue()[0];
        hp.userDetailRequestValidator(userDetailObj, req);
        done();
    });

    it("4- Record event and validate storage", (done) => {
        hp.clearStorage();
        initMain();
        Countly.add_event(eventObj);
        setTimeout(() => {
            var storedEvents = hp.readEventQueue();
            assert.strictEqual(storedEvents.length, 1, "There should be exactly one event stored");

            var event = storedEvents[0];
            hp.eventValidator(eventObj, event);
            done();
        }, hp.mWait);
    });

    it("4.1- Validate event persistence after process restart", (done) => {
        // Initialize SDK
        initMain();

        // Read stored events without clearing storage
        var storedEvents = hp.readEventQueue();
        assert.strictEqual(storedEvents.length, 1, "There should be exactly one event stored");

        var event = storedEvents[0];
        hp.eventValidator(eventObj, event);
        done();
    });

    // if storage path is not provided it will be default "../data/"
    it("5- Not provide storage path during init", (done) => {
        hp.clearStorage();
        initMain();
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    // if set to undefined it should be set to default path
    it("6- Set storage path to undefined", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            storage_path: undefined,
        });
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    // if set to null it should be set to default path
    it("7- Set storage path to null", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            storage_path: null,
        });
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    // it should be set to the custom directory if provided
    it("8- Set storage path to custom directory", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            interval: 10000,
            max_events: -1,
            storage_path: "../test/customStorageDirectory/",
        });
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        done();
    });

    it("9- Reset Storage While on Default Path /no-init", (done) => {
        // will set to default storage path
        storage.setStoragePath();
        assert.equal(storage.getStoragePath(), "../data/");
        // will set to undefined
        storage.resetStorage();
        assert.equal(storage.getStoragePath(), undefined);
        done();
    });

    it("10- Recording to Storage with Default Storage Path /no-init", (done) => {
        storage.resetStorage();

        // Set to default storage path
        storage.setStoragePath();
        assert.equal(storage.getStoragePath(), "../data/");
        recordValuesToStorageAndValidate();
        done();
    });

    it("11- Recording to Storage with Custom Storage Path /no-init", (done) => {
        storage.resetStorage();
        // will set to default storage path
        storage.setStoragePath("../test/customStorageDirectory/");
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        recordValuesToStorageAndValidate("../test/customStorageDirectory/");
        done();
    });

    it("12- Recording to Bulk Storage with Default Bulk Data Path /no-init", (done) => {
        storage.resetStorage();
        // will set to default storage path
        // To set the storage path to the default bulk storage path and persist the queue
        storage.setStoragePath(null, true, true);
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        recordValuesToStorageAndValidate(null, false, true, true);
        done();
    });

    it("13- Recording to Bulk Storage with Custom Bulk Storage Path /no-init", (done) => {
        storage.resetStorage();
        // will set to default storage path
        storage.setStoragePath("../test/customStorageDirectory/", true);
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        recordValuesToStorageAndValidate("../test/customStorageDirectory/", false, true);
        done();
    });

    it("14- Setting storage path to default path via initStorage /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage();
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    it("15- Setting bulk storage path to default path via initStorage /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage(null, false, true);
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        done();
    });

    it("16- Setting custom storage path via initStorage /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage("../test/customStorageDirectory/");
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        done();
    });

    it("17- Setting storage method to memory only and checking storage path /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage(null, cc.storageTypeEnums.MEMORY);
        assert.equal(storage.getStoragePath(), undefined);
        done();
    });

    it("18- Recording to storage with memory only storage /no-init", (done) => {
        storage.resetStorage();
        recordValuesToStorageAndValidate(null, cc.storageTypeEnums.MEMORY);
        done();
    });
});