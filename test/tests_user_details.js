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

    it("Multiple save operations", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });

        // First save
        Countly.userProfile.set_property("name", "John Doe");
        Countly.userProfile.save();

        // Second save
        Countly.userProfile.set_property("email", "john@example.com");
        Countly.userProfile.save();

        setTimeout(() => {
            var queue = hp.readRequestQueue();
            assert.equal(queue.length, 2);

            const firstSave = JSON.parse(queue[0].user_details);
            assert.equal(firstSave.custom.name, "John Doe");
            assert.equal(firstSave.custom.email, undefined);

            const secondSave = JSON.parse(queue[1].user_details);
            assert.equal(secondSave.custom.name, undefined);
            assert.equal(secondSave.custom.email, "john@example.com");
            done();
        }, hp.sWait);
    });

    it("Array operations", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });

        Countly.userProfile.push("interests", "coding");
        Countly.userProfile.push("interests", "music");
        Countly.userProfile.push_unique("skills", "javascript");
        Countly.userProfile.push_unique("skills", "nodejs");
        Countly.userProfile.pull("old_tags", "deprecated");
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            // Multiple operations on same key create an array
            assert.deepEqual(actualUserDetails.custom.interests.$push, ["coding", "music"]);
            assert.deepEqual(actualUserDetails.custom.skills.$addToSet, ["javascript", "nodejs"]);
            assert.equal(actualUserDetails.custom.old_tags.$pull, "deprecated");
            done();
        }, hp.sWait);
    });

    it("Numeric operations", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });

        Countly.userProfile.increment("counter");
        Countly.userProfile.increment("counter");
        Countly.userProfile.increment_by("score", 50);
        Countly.userProfile.multiply("multiplier", 2);
        Countly.userProfile.max("high_score", 1000);
        Countly.userProfile.min("low_score", 10);
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            // Last operation wins for same key
            assert.equal(actualUserDetails.custom.counter.$inc, 1);
            assert.equal(actualUserDetails.custom.score.$inc, 50);
            assert.equal(actualUserDetails.custom.multiplier.$mul, 2);
            assert.equal(actualUserDetails.custom.high_score.$max, 1000);
            assert.equal(actualUserDetails.custom.low_score.$min, 10);
            done();
        }, hp.sWait);
    });

    it("unset", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });

        Countly.userProfile.set_property("temp1", "value1");
        Countly.userProfile.set_property("temp2", "value2");
        Countly.userProfile.set_property("keep", "important");
        Countly.userProfile.unset("temp1");
        Countly.userProfile.unset("temp2");
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.keep, "important");
            assert.equal(actualUserDetails.custom.temp1, undefined);
            assert.equal(actualUserDetails.custom.temp2, undefined);
            done();
        }, hp.sWait);
    });

    it("set_once", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });

        Countly.userProfile.set_once("first_login", "2024-01-01");
        Countly.userProfile.set_once("registration_source", "mobile_app");
        Countly.userProfile.set_property("last_login", "2024-12-03");
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.custom.first_login.$setOnce, "2024-01-01");
            assert.equal(actualUserDetails.custom.registration_source.$setOnce, "mobile_app");
            assert.equal(actualUserDetails.custom.last_login, "2024-12-03");
            done();
        }, hp.sWait);
    });

    it("Full user profile with all property types", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });

        Countly.userProfile.set_properties({
            name: "Alex Johnson",
            username: "alex_j",
            email: "alex@example.com",
            organization: "TechCorp",
            phone: "+1234567890",
            picture: "https://example.com/alex.jpg",
            gender: "M",
            byear: 1990,
            custom: {
                subscription: "premium",
                account_type: "business",
            },
        });

        Countly.userProfile.increment("total_purchases");
        Countly.userProfile.increment_by("lifetime_value", 500);
        Countly.userProfile.push_unique("purchased_products", "product_123");
        Countly.userProfile.max("max_order_value", 250);
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);

            // Standard properties
            assert.equal(actualUserDetails.name, "Alex Johnson");
            assert.equal(actualUserDetails.username, "alex_j");
            assert.equal(actualUserDetails.email, "alex@example.com");
            assert.equal(actualUserDetails.organization, "TechCorp");
            assert.equal(actualUserDetails.phone, "+1234567890");
            assert.equal(actualUserDetails.picture, "https://example.com/alex.jpg");
            assert.equal(actualUserDetails.gender, "M");
            assert.equal(actualUserDetails.byear, 1990);

            // Custom properties
            assert.equal(actualUserDetails.custom.subscription, "premium");
            assert.equal(actualUserDetails.custom.account_type, "business");
            assert.equal(actualUserDetails.custom.total_purchases.$inc, 1);
            assert.equal(actualUserDetails.custom.lifetime_value.$inc, 500);
            assert.equal(actualUserDetails.custom.purchased_products.$addToSet, "product_123");
            assert.equal(actualUserDetails.custom.max_order_value.$max, 250);
            done();
        }, hp.sWait);
    });

    it("set_properties - No custom", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.set_properties({
            name: "Alexandrina Jovovich",
            username: "alex_jov",
            email: "alex@example.com",
            organization: "TechNova",
            phone: "+987654321",
            picture: "https://example.com/images/profile_alex.jpg",
            picturePath: "/test/file/path.jpg",
        });
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            const actualUserDetails = JSON.parse(req.user_details);
            assert.equal(actualUserDetails.name, "Alexandrina Jovovich");
            assert.equal(actualUserDetails.username, "alex_jov");
            assert.equal(actualUserDetails.email, "alex@example.com");
            assert.equal(actualUserDetails.organization, "TechNova");
            assert.equal(actualUserDetails.phone, "+987654321");
            assert.equal(actualUserDetails.picture, "https://example.com/images/profile_alex.jpg");
            assert.equal(actualUserDetails.picturePath, "/test/file/path.jpg");
            assert.equal(actualUserDetails.custom, undefined);
            done();
        }, hp.sWait);
    });

    it("save - Nothing to save", (done) => {
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
        });
        Countly.userProfile.save();

        setTimeout(() => {
            var req = hp.readRequestQueue();
            assert.deepEqual(req.length, 0);
            done();
        }, hp.sWait);
    });
});
