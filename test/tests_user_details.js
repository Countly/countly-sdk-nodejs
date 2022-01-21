/* eslint-disable no-console */
/* global describe, it, */
var assert = require("assert"),
    Countly = require("../lib/countly"),
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

describe("User details tests", function() {
    it("Record and validate all user details", function(done) {
        //clear previous data
        hp.clearStorage();
        //initialize SDK
        initMain();
        //send user details
        Countly.user_details({
            "name": "Barturiana Sosinsiava",
            "username": "bar2rawwen",
            "email": "test@test.com",
            "organization": "Dukely",
            "phone": "+123456789",
            "picture": "https://ps.timg.com/profile_images/52237/011_n_400x400.jpg",
            "gender": "Non-binary",
            "byear": 1987, //birth year
            "custom": {
                "key1 segment": "value1 segment",
                "key2 segment": "value2 segment",
            }
        });
        //read event queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            assert.ok(req.user_details);
            assert.ok(req.app_key);
            assert.ok(req.device_id);
            assert.ok(req.sdk_name);
            assert.ok(req.sdk_version);
            assert.ok(req.timestamp);
            assert.ok(req.hour);
            assert.ok(req.dow);
            var details = JSON.parse(req.user_details);
            assert.equal(details.name, "Barturiana Sosinsiava");
            assert.equal(details.username, "bar2rawwen");
            assert.equal(details.email, "test@test.com");
            assert.equal(details.organization, "Dukely");
            assert.equal(details.phone, "+123456789");
            assert.equal(details.picture, "https://ps.timg.com/profile_images/52237/011_n_400x400.jpg");
            assert.equal(details.gender, "Non-binary");
            assert.equal(details.byear, 1987);
            assert.equal(details.custom["key1 segment"], "value1 segment");
            assert.equal(details.custom["key2 segment"], "value2 segment");
            done();
        }, hp.span);
    });
});

