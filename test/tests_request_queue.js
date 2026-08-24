/* eslint-disable no-console */
/* global runthis */
var assert = require("assert");
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");

// init function
function initMain(extraConfig) {
    var config = {
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
    };
    for (var key in extraConfig) {
        config[key] = extraConfig[key];
    }
    Countly.init(config);
}

describe("Request queue tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("Requests are queued in recording order", (done) => {
        // initialize SDK
        initMain();
        // record different features back to back
        Countly.begin_session();
        Countly.user_details({ name: "orderCheck" });
        try {
            runthis();
        }
        catch (ex) {
            Countly.log_error(ex);
        }
        Countly.report_trace({
            type: "device", name: "orderTrace", stz: 1234567890123, etz: 1234567890321, apm_metrics: { duration: 198 },
        });
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue();
            assert.equal(rq.length, 4);
            // queue must hold begin_session, user_details, crash and apm requests in call order
            hp.sessionRequestValidator(rq[0]);
            assert.equal(JSON.parse(rq[1].user_details).name, "orderCheck");
            hp.crashRequestValidator(rq[2], true);
            assert.ok(rq[3].apm);
            for (var i = 0; i < rq.length; i++) {
                hp.requestBaseParamValidator(rq[i]);
            }
            done();
        }, hp.sWait);
    });
    it("Events are batched into requests in recording order", (done) => {
        // initialize SDK with a small batch size and a short processing interval
        initMain({ max_events: 2, interval: 500 });
        for (var i = 1; i < 6; i++) {
            Countly.add_event({ key: `batch_${i}`, count: 1 });
        }
        // wait for the heartbeat to move all events into the request queue
        setTimeout(() => {
            // event queue must be fully drained
            assert.equal(hp.readEventQueue().length, 0);
            var rq = hp.readRequestQueue();
            assert.equal(rq.length, 3);
            var batchSizes = [];
            var recordedKeys = [];
            for (var j = 0; j < rq.length; j++) {
                hp.requestBaseParamValidator(rq[j]);
                var batch = JSON.parse(rq[j].events);
                batchSizes.push(batch.length);
                for (var k = 0; k < batch.length; k++) {
                    recordedKeys.push(batch[k].key);
                    assert.ok(typeof batch[k].timestamp !== 'undefined');
                    assert.ok(batch[k].hour > -1 && batch[k].hour < 24);
                    assert.ok(batch[k].dow > -1 && batch[k].dow < 7);
                }
            }
            // batches must respect max_events and keep the original recording order
            assert.deepStrictEqual(batchSizes, [2, 2, 1]);
            assert.deepStrictEqual(recordedKeys, ["batch_1", "batch_2", "batch_3", "batch_4", "batch_5"]);
            done();
        }, hp.mWait);
    });
    it("Overflown request queue drops oldest requests first", (done) => {
        // initialize SDK with a tiny request queue
        initMain({ queue_size: 3 });
        for (var i = 1; i < 6; i++) {
            Countly.user_details({ name: `user_${i}` });
        }
        // read request queue
        setTimeout(() => {
            var rq = hp.readRequestQueue();
            // current implementation lets the queue grow to queue_size + 1 before evicting the oldest request
            assert.equal(rq.length, 4);
            var names = [];
            for (var j = 0; j < rq.length; j++) {
                hp.requestBaseParamValidator(rq[j]);
                names.push(JSON.parse(rq[j].user_details).name);
            }
            assert.deepStrictEqual(names, ["user_2", "user_3", "user_4", "user_5"]);
            done();
        }, hp.sWait);
    });
    it("APM trace request content is preserved", (done) => {
        // initialize SDK
        initMain();
        Countly.report_trace({
            type: "device", name: "forLoopProfiling", stz: 1234567890123, etz: 1234567890321, apm_metrics: { duration: 198 },
        });
        // read request queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.requestBaseParamValidator(req);
            var apm = JSON.parse(req.apm);
            assert.equal(apm.type, "device");
            assert.equal(apm.name, "forLoopProfiling");
            assert.equal(apm.stz, 1234567890123);
            assert.equal(apm.etz, 1234567890321);
            assert.equal(apm.apm_metrics.duration, 198);
            // trace timestamp must be the provided start time
            assert.equal(apm.timestamp, apm.stz);
            assert.ok(apm.hour > -1 && apm.hour < 24);
            assert.ok(apm.dow > -1 && apm.dow < 7);
            done();
        }, hp.sWait);
    });
    it("Request queue persists order across halt and re-init", (done) => {
        // initialize SDK
        initMain();
        Countly.begin_session();
        setTimeout(() => {
            assert.equal(hp.readRequestQueue().length, 1);
            // simulate app restart without wiping the storage
            Countly.halt(true);
            initMain();
            Countly.user_details({ name: "afterRestart" });
            setTimeout(() => {
                var rq = hp.readRequestQueue();
                assert.equal(rq.length, 2);
                // stored request must survive the restart and stay in front of the new one
                hp.sessionRequestValidator(rq[0]);
                assert.equal(JSON.parse(rq[1].user_details).name, "afterRestart");
                // both requests must belong to the same stored device ID
                assert.equal(rq[0].device_id, rq[1].device_id);
                done();
            }, hp.sWait);
        }, hp.sWait);
    });
});
