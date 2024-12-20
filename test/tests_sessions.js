/* eslint-disable no-console */
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");

// init function
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        max_events: -1,
    });
}
describe("Sessions tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("Start session and validate the request queue", (done) => {
        // initialize SDK
        initMain();
        // send session calls
        Countly.begin_session();
        setTimeout(() => {
            var beg = hp.readRequestQueue()[0];
            hp.sessionRequestValidator(beg);
            done();
        }, hp.sWait);
    });
    it("Start and end session and validate the request queue", (done) => {
        // initialize SDK
        initMain();
        // send session calls
        Countly.begin_session();
        setTimeout(() => {
            Countly.end_session();
            setTimeout(() => {
                var beg = hp.readRequestQueue()[0];
                var end = hp.readRequestQueue()[1];
                hp.sessionRequestValidator(beg, end, (hp.mWait / 1000));
                done();
            }, hp.sWait);
        }, hp.mWait);
    });
});
