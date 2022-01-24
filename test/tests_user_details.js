/* eslint-disable no-console */
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");

var userDetailObj = {
    name: "Barturiana Sosinsiava",
    username: "bar2rawwen",
    email: "test@test.com",
    organization: "Dukely",
    phone: "+123456789",
    picture: "https://ps.timg.com/profile_images/52237/011_n_400x400.jpg",
    gender: "Non-binary",
    byear: 1987, // birth year
    custom: {
        "key1 segment": "value1 segment",
        "key2 segment": "value2 segment",
    },
};
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
    it("Record and validate all user details", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        // send user details
        Countly.user_details(userDetailObj);
        // read event queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.userDetailRequestValidator(userDetailObj, req);
            done();
        }, hp.sWait);
    });
});
