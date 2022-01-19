/* global describe, it, */
var fs = require("fs"),
    assert = require("assert"),
    hp = require("./helpers/helper-functions"),
    cc = require("../lib/countly-common");


// Unit tests for truncateSingleValue:
describe("Internal limits single value truncation testing suite", function() {
    it("Check if the string is truncated", function() {
        var newStr = cc.truncateSingleValue("123456789", 3, "test");
        assert.equal(newStr.length, 3);
    });
    it("Check if the number is truncated", function() {
        var newStr = cc.truncateSingleValue(123456789, 3, "test");
        assert.equal(newStr.length, 3);
    });
    it("Check if the object is returned unchanged", function() {
        var object = {"123456789": 5};
        var obj = cc.truncateSingleValue(object, 3, "test");
        assert.equal(object, obj);
    });
});

// Integration tests for truncateObjectValue:
describe("Internal limits object truncation testing suite", function() {
    it("Check if string key and value is truncated", function() {
        var newObj = cc.truncateObject({"123456789": "123456789"}, 3, 5, 2, "test");
        assert.equal(newObj['123'], '12345');
    });
    it("Check if number key and value is truncated", function() {
        var newObj = cc.truncateObject({123456789: 123456789}, 3, 5, 2, "test");
        assert.equal(newObj['123'], '12345');
    });
    it("Check if object value is kept as is", function() {
        var newObj = cc.truncateObject({123456789: { 'a': 'aa'}}, 3, 5, 2, "test");
        assert.equal(newObj['123'].a, 'aa');
    });
    it("Check if segments are truncated", function() {
        var newObj = cc.truncateObject({"a": "aa", "b": "bb", "c": "cc" }, 3, 5, 2, "test");
        assert.equal(Object.keys(newObj).length, 2);
    });
});



//Integration tests with countly initialized
describe("1. Check custom event truncation", function() {
    //clear storage
    hp.clearStorage();
    setTimeout(() => {
    }, hp.span);
    //init Countly
    hp.initLimitsMain();
    //send event
    hp.customLimitsEvent();
    //test
    it("Test", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"key":"Enter yo"'));
        assert.ok(!event.includes('"key":"Enter your key here"'));
        assert.ok(event.includes('"key of 3":"Value of"'));
        assert.ok(!event.includes('"key of 4":"Value of"'));
    });
});
describe("2. Check countly view event truncation", function() {
    //clear storage
    hp.clearStorage();
    setTimeout(() => {
    }, hp.span);
    //init Countly
    hp.initLimitsMain();
    //page view
    hp.trackLimitsPageView();
    //test
    it("Test", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"key":"[CLY]_vi"'));
        assert.ok(!event.includes('"key":"[CLY]_view"'));
        assert.ok(event.includes('"name":"a very l"'));
        assert.ok(!event.includes('"name":"a very long page name"'));
    });
});
describe("3. Check breadcrumbs truncation", function() {
    //clear storage
    hp.clearStorage();
    setTimeout(() => {
    }, hp.span);
    //init Countly
    hp.initLimitsMain();
    //add log
    hp.addLog();
    //test
    it("Test", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        //overflown breadcrumbs
        assert.ok(!req.includes('log1'));
        assert.ok(!req.includes('log2'));
        assert.ok(!req.includes('log3'));
        assert.ok(!req.includes('log4'));
        //logged breadcrumbs
        assert.ok(req.includes('log5 too'));
        assert.ok(req.includes('log6'));
        assert.ok(req.includes('log7'));
    });
});
describe("4. Check error logs truncation", function() {
    //clear storage
    hp.clearStorage();
    setTimeout(() => {
    }, hp.span);
    //init Countly
    hp.initLimitsMain();
    //add log
    hp.trackError();
    hp.errorLog();
    //test
    it("Test", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"Lorem ipsu\\\\n consectet\\\\n incididun\\"'));
        assert.ok(!req.includes('"Lorem ipsu\\\\n consectet\\\\n incididun\\\\n aliqua. U\\\\n Duis aute\\"'));
    });
});
describe("5. Check user details truncation", function() {
    //clear storage
    hp.clearStorage();
    setTimeout(() => {
    }, hp.span);
    //init Countly
    hp.initLimitsMain();
    //add log
    hp.userLimitsDetails();
    //test
    it("Test", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('Gottlob'));
        assert.ok(!req.includes('Gottlob Frege'));
        assert.ok(req.includes('Grundges'));
        assert.ok(!req.includes('Grundgesetze'));
        assert.ok(req.includes('test@isa'));
        assert.ok(!req.includes('test@isatest.com'));
        assert.ok(req.includes('Biallobl'));
        assert.ok(!req.includes('Bialloblotzsky'));
        assert.ok(req.includes('+4555999'));
        assert.ok(!req.includes('+4555999423'));
        //picture urls are kept intact with  an over 4000 chars threshold
        assert.ok(req.includes('https://ih0.redbubble.net/image.276305970.7419/flat,550x550,075,f.u3.jpg'));
        assert.ok(!req.includes('"https://"'));
        assert.ok(req.includes('"gender\\":\\"M\\"'));
        assert.ok(req.includes('"byear\\":1848'));
        //segmentation
        assert.ok(req.includes('"SEGkey 3\\":\\"SEGVal 3\\"'));
        assert.ok(!req.includes('"SEGkey 4\\":\\"SEGVal 4\\"'));
    });
});
describe("6. Check custom properties truncation", function() {
    //clear storage
    hp.clearStorage();
    setTimeout(() => {
    }, hp.span);
    //init Countly
    hp.initLimitsMain();
    //add log
    hp.userLimitsData();
    //test
    it("Test", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        //set
        assert.ok(!req.includes('name of a character'));
        assert.ok(!req.includes('Bertrand Arthur William Russell'));
        assert.ok(req.includes('"name of \\":\\"Bertrand\\"'));
        //set_once
        assert.ok(!req.includes('A galaxy far far away'));
        assert.ok(!req.includes('Called B48FF'));
        assert.ok(req.includes('"A galaxy\\"'));
        assert.ok(req.includes('"Called B\\"'));
        //increment_by
        assert.ok(!req.includes('"123456789012345\\"'));
        assert.ok(req.includes('"12345678\\"'));
        //multiply
        assert.ok(!req.includes('"234567890123456\\"'));
        assert.ok(req.includes('"23456789\\"'));
        //max
        assert.ok(!req.includes('"345678901234567\\"'));
        assert.ok(req.includes('"34567890\\"'));
        //min
        assert.ok(!req.includes('"456789012345678\\"'));
        assert.ok(req.includes('"45678901\\"'));
        //push
        assert.ok(!req.includes('"II Fernando Valdez\\"'));
        assert.ok(req.includes('"II Ferna\\"'));
        //push_unique
        assert.ok(!req.includes('"III Fernando Valdez\\"'));
        assert.ok(req.includes('"III Fern\\"'));
        //pull
        assert.ok(!req.includes('"III Fernando Valdez\\"'));
        assert.ok(req.includes('"III Fern\\"'));
    });
});

describe("End it all", function() {
    it("Seal the deal", function(done) {
        setTimeout(done, 5000);
        process.exit(0);
    });
});
