/* eslint-disable no-console */
const assert = require("assert");
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");
var testUtils = require("./helpers/test_utils");

describe("User details tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("Record and validate all user details - Legacy", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        var userDetailObj = testUtils.getUserDetailsObj();
        Countly.user_details(userDetailObj);
        // read request queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = req.user_details;
            const isValid = hp.validateUserDetails(actualUserDetails, userDetailObj);
            assert.equal(true, isValid);
            done();
        }, hp.sWait);
    });

    it("Record and validate all user details", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        var userDetailObj = testUtils.getUserDetailsObj();
        Countly.userProfile.set_properties(userDetailObj);
        Countly.userProfile.save();
        // read request queue
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = req.user_details;
            const isValid = hp.validateUserDetails(actualUserDetails, userDetailObj);
            assert.equal(true, isValid);
            done();
        }, hp.sWait);
    });

    it("set_property", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.set_property("name", "John Doe");
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.name, "John Doe");
            done();
        }, hp.sWait);
    });

    it("set_once", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.set_once("name", "John Doe");
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.name.$setOnce, "John Doe");
            done();
        }, hp.sWait);
    });

    it("increment", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.increment("visits");
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.visits.$inc, 1);
            done();
        }, hp.sWait);
    });

    it("increment_by", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.increment_by("visits", 5);
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.visits.$inc, 5);
            done();
        }, hp.sWait);
    });

    it("multiply", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.multiply("visits", 2);
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.visits.$mul, 2);
            done();
        }, hp.sWait);
    });

    it("max", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.max("score", 100);
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.score.$max, 100);
            done();
        }, hp.sWait);
    });

    it("min", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.min("score", 10);
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.score.$min, 10);
            done();
        }, hp.sWait);
    });

    it("push", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.push("tags", "new");
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.tags.$push, "new");
            done();
        }, hp.sWait);
    });

    it("push_unique", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.push_unique("tags", "unique");
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.tags.$addToSet, "unique");
            done();
        }, hp.sWait);
    });

    it("pull", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.pull("tags", "old");
        Countly.userProfile.save();
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.tags.$pull, "old");
            done();
        }, hp.sWait);
    });

    it("unset", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.set_property("keep", "value");
        Countly.userProfile.set_property("remove", "value");
        Countly.userProfile.unset("remove");
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.keep, "value");
            assert.equal(actualUserDetails.custom.remove, undefined);
            done();
        }, hp.sWait);
    });
});
