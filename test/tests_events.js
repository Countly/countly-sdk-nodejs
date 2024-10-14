/* eslint-disable no-console */
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");
var testUtils = require("./helpers/test_utils");

// init function
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
    });
}

describe("Events tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("Record and check custom event", (done) => {
        // initialize SDK
        initMain();
        // send custom event
        Countly.add_event(testUtils.getEventObj());
        // read event queue
        setTimeout(() => {
            var event = hp.readEventQueue()[0];
            hp.eventValidator(testUtils.getEventObj(), event);
            done();
        }, hp.mWait);
    });
    it("Record and check timed events", (done) => {
        // initialize SDK
        initMain();
        // send timed event
        Countly.start_event("timed");
        setTimeout(() => {
            Countly.end_event(testUtils.getTimedEventObj());
            // read event queue
            setTimeout(() => {
                var event = hp.readEventQueue()[0];
                hp.eventValidator(testUtils.getTimedEventObj(), event, (hp.mWait / 1000));
                done();
            }, hp.sWait);
        }, hp.mWait);
    });
});
