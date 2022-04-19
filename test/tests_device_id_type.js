/* eslint-disable no-console */
var Countly = require("../lib/countly");
var assert = require("assert");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

function initMain(deviceId) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        device_id: deviceId,
        max_events: -1,
    });
}
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

describe("View test", () => {
    it("Generated device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            validateSdkGeneratedId(Countly.get_device_id());
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.SDK_GENERATED);
            done();
        }, hp.sWait);
    });
    it("Change generated device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.change_id("changedID");
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            assert.equal(Countly.get_device_id(), "changedID");
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
            done();
        }, hp.sWait);
    });
    it("Developer supplied device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain("ID");
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            assert.equal(Countly.get_device_id(), "ID");
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
            done();
        }, hp.sWait);
    });

});
