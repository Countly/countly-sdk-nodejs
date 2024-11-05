/* eslint-disable no-console */
var assert = require("assert");
var Countly = require("../lib/countly");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

function initMain(deviceId, eraseID) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        device_id: deviceId,
        max_events: -1,
        // debug: true,
        clear_stored_device_id: eraseID,
    });
}
function validateSdkGeneratedId(providedDeviceId) {
    assert.ok(providedDeviceId);
    assert.equal(providedDeviceId.length, 36);
    assert.ok(cc.isUUID(providedDeviceId));
    assert.equal(Countly.get_device_id(), providedDeviceId);
    assert.equal(Countly.get_device_id_type(), Countly.DeviceIdType.SDK_GENERATED);
}

function validateDeveloperSuppliedId(providedDeviceId) {
    assert.equal(Countly.get_device_id_type(), Countly.DeviceIdType.DEVELOPER_SUPPLIED);
    assert.equal(Countly.get_device_id(), providedDeviceId);
}

describe("Device ID tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("1.set_id with SDK generated to developer supplied", (done) => {
        // initialize SDK
        initMain(undefined);
        validateSdkGeneratedId(Countly.get_device_id());
        var oldId = Countly.get_device_id();
        Countly.set_id("ID");
        validateDeveloperSuppliedId("ID");
        setTimeout(() => {
            // validate that merge request is generated
            var RQ = hp.readRequestQueue();
            assert.equal(RQ.length, 1);
            hp.requestBaseParamValidator(RQ[0]);
            assert.equal(RQ[0].old_device_id, oldId);
            done();
        }, hp.sWait);
    });
    it("2.set_id with developer supplied to developer supplied", (done) => {
        // initialize SDK
        initMain("ID2");
        validateDeveloperSuppliedId("ID2");
        Countly.set_id("ID");
        validateDeveloperSuppliedId("ID");
        setTimeout(() => {
            // validate that no merge request is generated and the existing request is begin session
            var RQ = hp.readRequestQueue();
            assert.equal(RQ.length, 1);
            hp.sessionRequestValidator(RQ[0]);
            done();
        }, hp.sWait);
    });
    it("3.set_id with same custom id", (done) => {
        // initialize SDK
        initMain("ID");
        validateDeveloperSuppliedId("ID");
        Countly.set_id("ID");
        validateDeveloperSuppliedId("ID");
        done();
    });
    it("4.set_id with same sdk generated id", (done) => {
        // initialize SDK
        initMain(undefined);
        var id = Countly.get_device_id();
        validateSdkGeneratedId(id);
        Countly.set_id(id);
        // so that the type is not converted to developer_supplied
        validateSdkGeneratedId(id);
        done();
    });
    it("5.set_id with invalid ids", (done) => {
        // initialize SDK
        initMain(undefined);
        var id = Countly.get_device_id();
        validateSdkGeneratedId(id);
        Countly.set_id(undefined);
        validateSdkGeneratedId(id);

        Countly.set_id(null);
        validateSdkGeneratedId(id);

        Countly.set_id("");
        validateSdkGeneratedId(id);
        done();
    });
});
