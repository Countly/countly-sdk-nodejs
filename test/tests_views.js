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
var pageNameOne = "test view page name1";
var pageNameTwo = "test view page name2";

describe("View test", function() {
    it("Record and validate page views", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send track view
        Countly.track_view(pageNameOne);
        //read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            hp.viewEventValidator(pageNameOne, event);
            done();
        }, hp.sWait);
    });
    it("Record and validate timed page views with same name", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        Countly.track_view(pageNameOne);
        setTimeout(() => {
            //send track view
            Countly.track_view(pageNameOne);
            //read event queue
            setTimeout(() => {
                var event = hp.readEventQueue();
                //start view
                hp.viewEventValidator(pageNameOne, event[0]);
                //end view with recording duration
                hp.viewEventValidator(pageNameOne, event[1], (hp.mWait / 1000));
                //start second view
                hp.viewEventValidator(pageNameOne, event[2]);
                done();
            }, hp.sWait);
        }, hp.mWait);
    });
    it("Record and validate timed page views with same name", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        Countly.track_view(pageNameOne);
        setTimeout(() => {
            //send track view
            Countly.track_view(pageNameTwo);
            //read event queue
            setTimeout(() => {
                var event = hp.readEventQueue();
                //start view
                hp.viewEventValidator(pageNameOne, event[0]);
                //end view with recording duration
                hp.viewEventValidator(pageNameOne, event[1], (hp.mWait / 1000));
                //start second view
                hp.viewEventValidator(pageNameTwo, event[2]);
                done();
            }, hp.sWait);
        }, hp.mWait);
    });

});

