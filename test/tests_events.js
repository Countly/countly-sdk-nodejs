/* eslint-disable no-console */
/* global describe, it, */
var Countly = require("../lib/countly"),
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
//an event object to use 
var eventObj = {
    "key": "in_app_purchase",
    "count": 3,
    "sum": 2.97,
    "dur": 1000,
    "segmentation": {
        "app_version": "1.0",
        "country": "Turkey"
    }
};
// a timed event object
var timedEventObj = {
    "key": "timed",
    "count": 1,
    "segmentation": {
        "app_version": "1.0",
        "country": "Turkey"
    }
};
describe("Events tests", function() {
    it("Record and check custom event", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send custom event
        Countly.add_event(eventObj);
        //read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            hp.eventValidator(eventObj, event);
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
        setTimeout(() => {
            Countly.end_event(timedEventObj);
            //read event queue
            setTimeout(() => {
                var event = hp.readEventQueue()[0];
                hp.eventValidator(timedEventObj, event, (hp.mpan / 1000));
                done();
            }, hp.span);
        }, hp.mpan);
    });

});
