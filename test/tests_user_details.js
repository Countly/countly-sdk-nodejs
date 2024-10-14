/* eslint-disable no-console */
const assert = require("assert");
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");
var testUtils = require("./helpers/test_utils");

describe("User details tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("Record and validate all user details", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        var userDetailObj = testUtils.getUserDetailsObj();
        Countly.user_details(userDetailObj);
        // read event queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = req.user_details;
            const isValid = hp.validateUserDetails(actualUserDetails, userDetailObj);
            assert.equal(true, isValid);
            done();
        }, hp.sWait);
    });
});
