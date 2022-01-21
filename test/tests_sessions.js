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
describe("Sessions tests", function() {
    it("Start and end session and validate the request queue", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send session calls
        Countly.begin_session();
        setTimeout(() => {
            Countly.end_session();
            setTimeout(() => {
                var beg = hp.readRequestQueue()[0];
                var end = hp.readRequestQueue()[1];
                hp.sessionValidator(beg, end, (hp.mpan / 1000));
                done();
            }, hp.span);
        }, hp.mpan);
    });
});

