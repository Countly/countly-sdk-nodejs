/* eslint-disable no-console */
/* global describe, it, runthis */
var assert = require("assert"),
    Countly = require("../lib/countly"),
    hp = require("./helpers/helper_functions");

//init function
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        max_events: -1
    });
}

describe("Crash tests", function() {
    it("Validate handled error logic", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //error logic
        Countly.track_errors();
        try {
            runthis();
        }
        catch (ex) {
            Countly.log_error(ex);
        }
        //read event queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            var crash = JSON.parse(req.crash);
            assert.ok(crash._os);
            assert.ok(crash._os_version);
            assert.ok(crash._error);
            assert.equal(crash._app_version, "0.0");
            assert.equal(crash._run, 0);
            assert.ok(crash._not_os_specific);
            assert.ok(crash._nonfatal);
            assert.equal(req.app_key, "YOUR_APP_KEY");
            assert.ok(req.device_id);
            assert.ok(req.sdk_name);
            assert.ok(req.sdk_version);
            assert.ok(req.timestamp);
            assert.ok(typeof req.hour !== "undefined");
            assert.ok(typeof req.dow !== "undefined");
            done();
        }, hp.span);
    });
    //This needs two steps, first creating an error and second checking the logs without erasing, otherwise error would halt the test
    describe("Unhandled Error logic", function() {
        it("Create unhandled rejection", function() {
            //clear previous data
            hp.clearStorage();
            //initialize SDK
            initMain();
            //send emitter
            Countly.track_errors();
            process.emit('unhandledRejection');
        });
        it("Validate unhandled rejection recording", function(done) {
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                var crash = JSON.parse(req.crash);
                assert.ok(crash._os);
                assert.ok(crash._os_version);
                assert.ok(crash._error);
                assert.equal(crash._app_version, "0.0");
                assert.equal(crash._run, 0);
                assert.ok(crash._not_os_specific);
                assert.equal(crash._nonfatal, false);
                assert.equal(req.app_key, "YOUR_APP_KEY");
                assert.ok(req.device_id);
                assert.ok(req.sdk_name);
                assert.ok(req.sdk_version);
                assert.ok(req.timestamp);
                assert.ok(typeof req.hour !== "undefined");
                assert.ok(typeof req.dow !== "undefined");
                done();
            }, hp.mpan);
        });
    });
});

