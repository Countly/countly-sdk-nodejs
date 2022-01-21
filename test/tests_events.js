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
        interval: 10000,
        max_events: -1
    });
}

describe("Events tests", function() {
    it("Record and check custom event", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send custom event
        Countly.add_event({
            "key": "in_app_purchase",
            "count": 3,
            "sum": 2.97,
            "dur": 1000,
            "segmentation": {
                "app_version": "1.0",
                "country": "Turkey"
            }
        });
        //read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "in_app_purchase");
            assert.equal(event.count, 3);
            assert.equal(event.sum, 2.97);
            assert.equal(event.dur, 1000);
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            assert.equal(event.segmentation.app_version, '1.0');
            assert.equal(event.segmentation.country, 'Turkey');
            done();
        }, hp.span);
    });
    it("Record and check timed events", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send timed event
        Countly.start_event("timed");
        Countly.end_event({
            "key": "timed",
            "count": 1,
            "segmentation": {
                "app_version": "1.0",
                "country": "Turkey"
            }
        });
        //read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "timed");
            assert.equal(event.count, 1);
            assert.equal(event.dur, 0);
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            assert.equal(event.segmentation.app_version, '1.0');
            assert.equal(event.segmentation.country, 'Turkey');
            done();
        }, hp.span);
    });

});
