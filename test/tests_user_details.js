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

describe("User details tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("Record and validate all user details", (done) => {
        // initialize SDK
        initMain();
        // send user details
        Countly.user_details(testUtils.getUserDetailsObj());
        // read event queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.userDetailRequestValidator(testUtils.getUserDetailsObj(), req);
            done();
        }, hp.sWait);
    });
});
