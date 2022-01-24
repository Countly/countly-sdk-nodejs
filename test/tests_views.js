/* eslint-disable no-console */
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");

var pageNameOne = "test view page name1";
var pageNameTwo = "test view page name2";
// init function
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
    });
}

describe("View test", () => {
    it("Record and validate page views", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        // send track view
        Countly.track_view(pageNameOne);
        // read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            hp.viewEventValidator(pageNameOne, event);
            done();
        }, hp.sWait);
    });
    it("Record and validate timed page views with same name", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        Countly.track_view(pageNameOne);
        setTimeout(() => {
            // send track view
            Countly.track_view(pageNameOne);
            // read event queue
            setTimeout(() => {
                var event = hp.readEventQueue();
                // start view
                hp.viewEventValidator(pageNameOne, event[0]);
                // end view with recording duration
                hp.viewEventValidator(pageNameOne, event[1], (hp.mWait / 1000));
                // start second view
                hp.viewEventValidator(pageNameOne, event[2]);
                done();
            }, hp.sWait);
        }, hp.mWait);
    });
    it("Record and validate timed page views with same name", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        Countly.track_view(pageNameOne);
        setTimeout(() => {
            // send track view
            Countly.track_view(pageNameTwo);
            // read event queue
            setTimeout(() => {
                var event = hp.readEventQueue();
                // start view
                hp.viewEventValidator(pageNameOne, event[0]);
                // end view with recording duration
                hp.viewEventValidator(pageNameOne, event[1], (hp.mWait / 1000));
                // start second view
                hp.viewEventValidator(pageNameTwo, event[2]);
                done();
            }, hp.sWait);
        }, hp.mWait);
    });
});
