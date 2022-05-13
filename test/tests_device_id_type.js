/* eslint-disable no-console */
var assert = require("assert");
var Countly = require("../lib/countly");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

/**
 * +--------------------------------------------------+------------------------------------+----------------------+
 * | SDK state at the end of the previous app session | Provided configuration during init | Action taken by SDK  |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |           Custom      |   SDK used a             |              Custom                |    Flag   |   flag   |
 * |         device ID     |   generated              |            device ID               |    not    |          |
 * |         was set       |       ID                 |             provided               |    set    |   set    |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |                     First init                   |                   -                |    1      |    -     |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |                     First init                   |                   x                |    2      |    -     |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |            x          |             -            |                   -                |    3      |    7     |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |            x          |             -            |                   x                |    4      |    8     |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |            -          |             x            |                   -                |    5      |    9     |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |            -          |             x            |                   x                |    6      |    10    |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |                                        Change ID  tests                                                      |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |                     First init                   |                   -                |    11     |     -    |
 * +--------------------------------------------------+------------------------------------+----------------------+
 * |                     First init                   |                   x                |    12     |     -    |
 * +--------------------------------------------------+------------------------------------+----------------------+
 */

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
}
function checkRequestsForT(queue, expectedInternalType) {
    for (var i = 0; i < queue.length; i++) {
        assert.ok(queue[i].t);
        assert.equal(queue[i].t, expectedInternalType);
    }
}

describe("Device ID type tests", () => {
    it("1.Generated device ID", (done) => {
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
    it("2.Developer supplied device ID", (done) => {
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
    it("3.With stored dev ID and no new ID", (done) => {
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
            Countly.halt(true);
            initMain(undefined);
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                assert.equal(Countly.get_device_id(), "ID");
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("4.With stored dev ID and with new ID", (done) => {
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
            Countly.halt(true);
            initMain("ID2");
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                assert.equal(Countly.get_device_id(), "ID");
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("5.With stored generated ID and no new ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            var initialId = Countly.get_device_id();
            validateSdkGeneratedId(initialId);
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.SDK_GENERATED);
            Countly.halt(true);
            initMain(undefined);
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                validateSdkGeneratedId(Countly.get_device_id());
                assert.equal(Countly.get_device_id(), initialId);
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.SDK_GENERATED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("6.With stored generated ID and with new ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            var initialId = Countly.get_device_id();
            validateSdkGeneratedId(initialId);
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.SDK_GENERATED);
            Countly.halt(true);
            initMain("ID2");
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                validateSdkGeneratedId(Countly.get_device_id());
                assert.equal(Countly.get_device_id(), initialId);
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.SDK_GENERATED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("7.With stored dev ID and no new ID, flag set", (done) => {
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
            Countly.halt(true);
            initMain(undefined, true);
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                validateSdkGeneratedId(Countly.get_device_id());
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.SDK_GENERATED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });

    it("8.With stored dev ID and with new ID, flag set", (done) => {
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
            Countly.halt(true);
            initMain("ID2", true);
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                assert.equal(Countly.get_device_id(), "ID2");
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("9.With stored sdk ID and no new ID, flag set", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            var oldId = Countly.get_device_id();
            validateSdkGeneratedId(Countly.get_device_id());
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.SDK_GENERATED);
            Countly.halt(true);
            initMain(undefined, true);
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                validateSdkGeneratedId(Countly.get_device_id());
                assert.notEqual(Countly.get_device_id(), oldId);
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.SDK_GENERATED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });

    it("10.With stored sdk ID and with new ID, flag set", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue()[0];
            var oldId = Countly.get_device_id();
            validateSdkGeneratedId(Countly.get_device_id());
            assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.SDK_GENERATED);
            checkRequestsForT(rq, cc.deviceIdTypeEnums.SDK_GENERATED);
            Countly.halt(true);
            initMain("ID2", true);
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                assert.equal(Countly.get_device_id(), "ID2");
                assert.notEqual(Countly.get_device_id(), oldId);
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                checkRequestsForT(req, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("11.Change generated device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain(undefined);
        Countly.change_id("changedID");
        setTimeout(() => {
            Countly.begin_session();
            // read request queue
            setTimeout(() => {
                var rq = hp.readRequestQueue()[0];
                assert.equal(Countly.get_device_id(), "changedID");
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                checkRequestsForT(rq, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
    it("12.Change developer supplied device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain("ID");
        Countly.change_id("changedID");
        setTimeout(() => {
            Countly.begin_session();
            // read request queue
            setTimeout(() => {
                var rq = hp.readRequestQueue()[0];
                assert.equal(Countly.get_device_id(), "changedID");
                assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                checkRequestsForT(rq, cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
});
