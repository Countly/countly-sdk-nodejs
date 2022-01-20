/* eslint-disable no-console */
/* global describe, it, */
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
describe("Sessions tests", function() {
    it("Start and end session and validate the request queue", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send session calls
        Countly.begin_session();
        Countly.end_session();
        //read event queue
        setTimeout(() => {
            var beg = hp.readRequestQueue()[0];
            var end = hp.readRequestQueue()[1];
            var metrics = JSON.parse(beg.metrics);
            //begin
            assert.equal(beg.begin_session, 1);
            assert.equal(beg.app_key, "YOUR_APP_KEY");
            assert.ok(beg.device_id);
            assert.ok(metrics._app_version);
            assert.ok(metrics._os);
            assert.ok(metrics._os_version);
            assert.ok(beg.sdk_version);
            assert.ok(beg.sdk_name);
            assert.ok(beg.timestamp);
            assert.ok(typeof beg.hour !== "undefined");
            assert.ok(typeof beg.dow !== "undefined");
            //end
            assert.equal(end.end_session, 1);
            assert.equal(end.session_duration, 0);
            assert.equal(end.app_key, "YOUR_APP_KEY");
            assert.ok(end.device_id);
            assert.ok(end.sdk_version);
            assert.ok(end.sdk_name);
            assert.ok(end.timestamp);
            assert.ok(typeof end.hour !== "undefined");
            assert.ok(typeof end.dow !== "undefined");
            done();
        }, hp.span);
    });
});

