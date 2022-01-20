/* eslint-disable no-console */
/* global describe, it, */
var assert = require("assert"),
    hp = require("./helpers/helper-functions"),
    cc = require("../lib/countly-common");

//run with: mocha --timeout 20000 .\test\test-internal-limits.js --exit , at your CLI



//Integration tests with countly initialized
describe("Testing internal limits", function() {
    describe("Testing truncation functions", function() {
        it("truncateSingleValue: Check if the string is truncated", function() {
            var newStr = cc.truncateSingleValue("123456789", 3, "test");
            assert.equal(newStr, "123");
        });
        it("truncateSingleValue: Check if the number is truncated", function() {
            var newStr = cc.truncateSingleValue(123456789, 3, "test");
            assert.equal(newStr, 123);
        });
        it("truncateSingleValue: Check if the object is returned unchanged", function() {
            var object = {"123456789": 5};
            var obj = cc.truncateSingleValue(object, 3, "test");
            assert.equal(object, obj);
        });
        // Integration tests for truncateObjectValue:
        it("truncateObject: Check if string key and value is truncated", function() {
            var newObj = cc.truncateObject({"123456789": "123456789"}, 3, 5, 2, "test");
            assert.equal(newObj['123'], '12345');
        });
        it("truncateObject: Check if number key and value is truncated", function() {
            var newObj = cc.truncateObject({123456789: 123456789}, 3, 5, 2, "test");
            assert.equal(newObj['123'], '12345');
        });
        it("truncateObject: Check if object value is kept as is", function() {
            var newObj = cc.truncateObject({123456789: { 'a': 'aa'}}, 3, 5, 2, "test");
            assert.equal(newObj['123'].a, 'aa');
        });
        it("truncateObject: Check if segments are truncated", function() {
            var newObj = cc.truncateObject({"a": "aa", "b": "bb", "c": "cc" }, 3, 5, 2, "test");
            assert.equal(Object.keys(newObj).length, 2);
        });
    });

    it("1. Check custom event truncation", function(done) {
    //clear storage
        hp.clearStorage();
        //init Countly
        hp.initLimitsMain();
        //send event
        hp.customLimitsEvent();
        setTimeout(() => {
            //read event queue
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "Enter yo");
            assert.ok(event.segmentation["key of 3"]);
            assert.ok(!event.segmentation["key of 4"]);
            assert.equal(event.segmentation["key of 3"], "Value of");
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            done();
        }, hp.span);
    });

    it("2. Check countly view event truncation", function(done) {
        //clear storage
        hp.clearStorage();
        //init Countly
        hp.initLimitsMain();
        //page view
        hp.trackLimitsPageView();
        //test
        setTimeout(() => {
            //read event queue
            var event = hp.readEventQueue()[0];
            assert.equal(event.key, "[CLY]_vi");
            assert.equal(event.segmentation.name, "a very l");
            assert.equal(event.segmentation.visit, 1);
            assert.ok(event.segmentation.segment);
            assert.ok(event.timestamp);
            assert.ok(event.hour);
            assert.ok(event.dow);
            done();
        }, hp.span);
    });
    it("3. Check breadcrumbs and error truncation", function(done) {
        //clear storage
        hp.clearStorage();
        //init Countly
        hp.initLimitsMain();
        //add log
        hp.addLog();
        //and log error to see them all
        hp.errorLog();
        //test
        setTimeout(() => {
            //read event queue
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
        }, hp.span);
    });
    it("4. Check user details truncation", function(done) {
        //clear storage
        hp.clearStorage();
        //init Countly
        hp.initLimitsMain();
        //add user details
        hp.userLimitsDetails();
        //test
        setTimeout(() => {
            //read event queue
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
        }, hp.span);
    });
    it("5. Check custom properties truncation", function(done) {
        //clear storage
        hp.clearStorage();
        //init Countly
        hp.initLimitsMain();
        //add custom properties
        hp.userLimitsData();
        //test
        setTimeout(() => {
            //read event queue
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
            //set
            assert.equal(details['name of '], 'Bertrand');
            //set_once
            assert.equal(details['A galaxy'].$setOnce, 'Called B');
            //increment_by
            assert.equal(details.byear.$inc, '12345678');
            //multiply
            assert.equal(details.byear.$mul, '23456789');
            //max
            assert.equal(details.byear.$max, '34567890');
            //min
            assert.equal(details.byear.$min, '45678901');
            //push
            assert.equal(details.gender.$push[0], 'II Ferna');
            //push_unique
            assert.equal(details.gender.$addToSet[0], 'III Fern');
            //pull
            assert.equal(details.gender.$pull[0], 'III Fern');
            done();
        }, hp.span);
    });
});



