const assert = require("assert");
var Countly = require("../lib/countly");
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
        url: "https://try.count.ly",
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
        initMain();
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
});
