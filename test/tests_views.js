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

describe("View test", function() {
    it("Record and validate page views", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send track view
        Countly.track_view("test view page name");
        //read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "[CLY]_view");
            assert.equal(event.count, 1);
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            assert.equal(event.segmentation.name, 'test view page name');
            assert.equal(event.segmentation.visit, 1);
            assert.ok(event.segmentation.segment);
            done();
        }, hp.span);
    });
});

