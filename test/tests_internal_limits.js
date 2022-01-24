/* eslint-disable no-console */
var assert = require("assert");
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");
var cc = require("../lib/countly-common");

// standard init for tests
function initLimitsMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
        max_key_length: 8, // set maximum key length here
        max_value_size: 8, // set maximum value length here
        max_segmentation_values: 3, // set maximum segmentation number here
        max_breadcrumb_count: 2, // set maximum number of logs that will be stored before erasing old ones
        max_stack_trace_lines_per_thread: 3, // set maximum number of lines for stack trace
        max_stack_trace_line_length: 10, // set maximum length of a line for stack trace
    });
}

// Integration tests with countly initialized
describe("Testing internal limits", () => {
    describe("Testing truncation functions", () => {
        it("truncateSingleValue: Check if the string is truncated", () => {
            var newStr = cc.truncateSingleValue("123456789", 3, "test");
            assert.equal(newStr, "123");
        });
        it("truncateSingleValue: Check if the number is truncated", () => {
            var newStr = cc.truncateSingleValue(123456789, 3, "test");
            assert.equal(newStr, 123);
        });
        it("truncateSingleValue: Check if the object is returned unchanged", () => {
            var object = { 123456789: 5 };
            var obj = cc.truncateSingleValue(object, 3, "test");
            assert.equal(object, obj);
        });
        // Integration tests for truncateObjectValue:
        it("truncateObject: Check if string key and value is truncated", () => {
            var newObj = cc.truncateObject({ 123456789: "123456789" }, 3, 5, 2, "test");
            assert.equal(newObj['123'], '12345');
        });
        it("truncateObject: Check if number key and value is truncated", () => {
            var newObj = cc.truncateObject({ 123456789: 123456789 }, 3, 5, 2, "test");
            assert.equal(newObj['123'], '12345');
        });
        it("truncateObject: Check if object value is kept as is", () => {
            var newObj = cc.truncateObject({ 123456789: { a: 'aa' } }, 3, 5, 2, "test");
            assert.equal(newObj['123'].a, 'aa');
        });
        it("truncateObject: Check if segments are truncated", () => {
            var newObj = cc.truncateObject({ a: "aa", b: "bb", c: "cc" }, 3, 5, 2, "test");
            assert.equal(Object.keys(newObj).length, 2);
        });
    });

    it("1. Check custom event truncation", (done) => {
    // clear storage
        hp.clearStorage();
        // init Countly
        initLimitsMain();
        // send event
        Countly.add_event({
            key: "Enter your key here",
            count: 1,
            segmentation: {
                "key of 1st seg": "Value of 1st seg",
                "key of 2nd seg": "Value of 2nd seg",
                "key of 3rd seg": "Value of 3rd seg",
                "key of 4th seg": "Value of 4th seg",
                "key of 5th seg": "Value of 5th seg",
            },
        });
        setTimeout(() => {
            // read event queue
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "Enter yo");
            assert.ok(event.segmentation["key of 3"]);
            assert.ok(!event.segmentation["key of 4"]);
            assert.equal(event.segmentation["key of 3"], "Value of");
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            done();
        }, hp.sWait);
    });

    it("2. Check countly view event truncation", (done) => {
        // clear storage
        hp.clearStorage();
        // init Countly
        initLimitsMain();
        // page view
        Countly.track_pageview("a very long page name");
        // test
        setTimeout(() => {
            // read event queue
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "[CLY]_vi");
            assert.equal(event.segmentation.name, "a very l");
            assert.equal(event.segmentation.visit, 1);
            assert.ok(event.segmentation.segment);
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            done();
        }, hp.sWait);
    });
    it("3. Check breadcrumbs and error truncation", (done) => {
        // clear storage
        hp.clearStorage();
        // init Countly
        initLimitsMain();
        // add log
        Countly.add_log("log1");
        Countly.add_log("log2");
        Countly.add_log("log3");
        Countly.add_log("log4");
        Countly.add_log("log5 too many");
        Countly.add_log("log6");
        Countly.add_log("log7");
        // and log error to see them all
        var error = {
            stack: "Lorem ipsum dolor sit amet,\n consectetur adipiscing elit, sed do eiusmod tempor\n incididunt ut labore et dolore magna\n aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n Duis aute irure dolor in reprehenderit in voluptate\n velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia\n deserunt mollit anim id\n est laborum.",
        };
        Countly.log_error(error);
        // test
        setTimeout(() => {
            // read event queue
            var req = hp.readRequestQueue()[0];
            assert.ok(req.crash);
            assert.ok(req.app_key);
            assert.ok(req.device_id);
            assert.ok(req.sdk_name);
            assert.ok(req.sdk_version);
            assert.ok(req.timestamp);
            assert.ok(req.hour);
            assert.ok(req.dow);
            var crash = JSON.parse(req.crash);
            assert.equal(crash._logs, "log5 too\nlog6\nlog7");
            assert.ok(crash._os);
            assert.ok(crash._os_version);
            assert.equal(crash._error, "Lorem ipsu\n consectet\n incididun");
            assert.ok(crash._app_version);
            assert.equal(crash._run, 0);
            assert.ok(crash._javascript);
            assert.ok(crash._nonfatal);
            assert.ok(crash._custom);
            done();
        }, hp.sWait);
    });
    it("4. Check user details truncation", (done) => {
        // clear storage
        hp.clearStorage();
        // init Countly
        initLimitsMain();
        // add user details
        Countly.user_details({
            name: "Gottlob Frege",
            username: "Grundgesetze",
            email: "test@isatest.com",
            organization: "Bialloblotzsky",
            phone: "+4555999423",
            // Web URL pointing to user picture
            picture:
            "https://ih0.redbubble.net/image.276305970.7419/flat,550x550,075,f.u3.jpg",
            gender: "M",
            byear: 1848, // birth year
            custom: {
                "SEGkey 1st one": "SEGVal 1st one",
                "SEGkey 2st one": "SEGVal 2st one",
                "SEGkey 3st one": "SEGVal 3st one",
                "SEGkey 4st one": "SEGVal 4st one",
                "SEGkey 5st one": "SEGVal 5st one",
            },
        });
        // test
        setTimeout(() => {
            // read event queue
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
            assert.equal(details.name, 'Gottlob ');
            assert.equal(details.username, 'Grundges');
            assert.equal(details.email, 'test@isa');
            assert.equal(details.organization, 'Biallobl');
            assert.equal(details.phone, '+4555999');
            assert.equal(details.picture, 'https://ih0.redbubble.net/image.276305970.7419/flat,550x550,075,f.u3.jpg');
            assert.equal(details.gender, 'M');
            assert.equal(details.byear, 1848);
            assert.equal(details.custom['SEGkey 1'], 'SEGVal 1');
            assert.equal(details.custom['SEGkey 2'], 'SEGVal 2');
            assert.equal(details.custom['SEGkey 3'], 'SEGVal 3');
            assert.ok(!details.custom['SEGkey 4']);
            assert.ok(!details.custom['SEGkey 5']);
            done();
        }, hp.sWait);
    });
    it("5. Check custom properties truncation", (done) => {
        // clear storage
        hp.clearStorage();
        // init Countly
        initLimitsMain();
        // add custom properties
        Countly.userData.set("name of a character", "Bertrand Arthur William Russell"); // set custom property
        Countly.userData.set_once("A galaxy far far away", "Called B48FF"); // set custom property only if property does not exist
        Countly.userData.increment_by("byear", 123456789012345); // increment value in key by provided value
        Countly.userData.multiply("byear", 2345678901234567); // multiply value in key by provided value
        Countly.userData.max("byear", 3456789012345678); // save max value between current and provided
        Countly.userData.min("byear", 4567890123456789); // save min value between current and provided
        Countly.userData.push("gender", "II Fernando Valdez"); // add value to key as array element
        Countly.userData.push_unique("gender", "III Fernando Valdez"); // add value to key as array element, but only store unique values in array
        Countly.userData.pull("gender", "III Fernando Valdez"); // remove value from array under property with key as name
        Countly.userData.save();
        // test
        setTimeout(() => {
            // read event queue
            var req = hp.readRequestQueue()[0];
            assert.ok(req.user_details);
            assert.ok(req.app_key);
            assert.ok(req.device_id);
            assert.ok(req.sdk_name);
            assert.ok(req.sdk_version);
            assert.ok(req.timestamp);
            assert.ok(req.hour);
            assert.ok(req.dow);
            var details = JSON.parse(req.user_details).custom;
            // set
            assert.equal(details['name of '], 'Bertrand');
            // set_once
            assert.equal(details['A galaxy'].$setOnce, 'Called B');
            // increment_by
            assert.equal(details.byear.$inc, '12345678');
            // multiply
            assert.equal(details.byear.$mul, '23456789');
            // max
            assert.equal(details.byear.$max, '34567890');
            // min
            assert.equal(details.byear.$min, '45678901');
            // push
            assert.equal(details.gender.$push[0], 'II Ferna');
            // push_unique
            assert.equal(details.gender.$addToSet[0], 'III Fern');
            // pull
            assert.equal(details.gender.$pull[0], 'III Fern');
            done();
        }, hp.sWait);
    });
});
