/* eslint-disable no-console */
/* global runthis */
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");

// init function
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
    });
}

describe("Crash tests", () => {
    it("Validate handled error logic", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        // error logic
        Countly.track_errors();
        try {
            runthis();
        }
        catch (ex) {
            Countly.log_error(ex);
        }
        // read event queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.crashRequestValidator(req, true);
            done();
        }, hp.sWait);
    });
    // This needs two steps, first creating an error and second checking the logs without erasing, otherwise error would halt the test
    describe("Unhandled Error logic", () => {
        it("Create unhandled rejection", () => {
            // clear previous data
            hp.clearStorage();
            // initialize SDK
            initMain();
            // send emitter
            Countly.track_errors();
            process.emit('unhandledRejection');
        });
        it("Validate unhandled rejection recording", (done) => {
            setTimeout(() => {
                var req = hp.readRequestQueue()[0];
                hp.crashRequestValidator(req, false);
                done();
            }, hp.mWait);
        });
    });
});
