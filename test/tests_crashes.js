/* eslint-disable no-console */
/* global runthis */
var assert = require("assert");
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
    before(async() => {
        await hp.clearStorage();
    });
    it("Validate handled error logic", (done) => {
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
});
// This needs two steps, first creating an error and second checking the logs without erasing, otherwise error would halt the test
describe("Unhandled Error logic", () => {
    before(async() => {
        await hp.clearStorage();
    });
    it("Create unhandled rejection", (done) => {
        // initialize SDK
        initMain();
        // send emitter
        Countly.track_errors();
        process.emit('unhandledRejection');
        done();
    });
    it("Validate unhandled rejection recording", (done) => {
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.crashRequestValidator(req, false);
            done();
        }, hp.mWait);
    });
});
describe("Error handler registration logic", () => {
    before(async() => {
        await hp.clearStorage();
    });
    it("Repeated track_errors should not stack error handlers", (done) => {
        // initialize SDK
        initMain();
        Countly.track_errors();
        var uncaughtCount = process.listenerCount("uncaughtException");
        var rejectionCount = process.listenerCount("unhandledRejection");
        // repeated calls must replace the previous handlers, not add new ones
        Countly.track_errors();
        Countly.track_errors();
        assert.equal(process.listenerCount("uncaughtException"), uncaughtCount);
        assert.equal(process.listenerCount("unhandledRejection"), rejectionCount);
        // halt must remove the SDK handlers
        Countly.halt(true);
        assert.equal(process.listenerCount("uncaughtException"), uncaughtCount - 1);
        assert.equal(process.listenerCount("unhandledRejection"), rejectionCount - 1);
        done();
    });
});
