/* global describe, it, */
var assert = require("assert");
var cc = require("../lib/countly-common");

// Unit tests for truncateSingleValue:
describe("Internal limits single value truncation testing suite", function() {
    it("Check if the string is truncated", function() {
        var string = "123456789";
        var limit = 3;
        var errorLog = "test";
        var newStr = cc.truncateSingleValue(string, limit, errorLog);
        assert.equal(newStr.length, 3);
    });
    it("Check if the number is truncated", function() {
        var number = 123456789;
        var limit = 3;
        var errorLog = "test";
        var newStr = cc.truncateSingleValue(number, limit, errorLog);
        assert.equal(newStr.length, 3);
    });
    it("Check if the object is returned unchanged", function() {
        var object = {"123456789": 5};
        var limit = 3;
        var errorLog = "test";
        var obj = cc.truncateSingleValue(object, limit, errorLog);
        assert.equal(object, obj);
    });
});

// Integration tests for truncateObjectValue:
describe("Internal limits object truncation testing suite", function() {
    it("Check if string key and value is truncated", function() {
        var object = {"123456789": "123456789"};
        var keyLimit = 3;
        var valueLimit = 5;
        var segmentLimit = 2;
        var errorLog = "test";
        var newObj = cc.truncateObject(object, keyLimit, valueLimit, segmentLimit, errorLog);
        assert.equal(newObj['123'], '12345');
    });
    it("Check if number key and value is truncated", function() {
        var object = {123456789: 123456789};
        var keyLimit = 3;
        var valueLimit = 5;
        var segmentLimit = 2;
        var errorLog = "test";
        var newObj = cc.truncateObject(object, keyLimit, valueLimit, segmentLimit, errorLog);
        assert.equal(newObj['123'], '12345');
    });
    it("Check if object value is kept as is", function() {
        var object = {123456789: { 'a': 'aa'}};
        var keyLimit = 3;
        var valueLimit = 5;
        var segmentLimit = 2;
        var errorLog = "test";
        var newObj = cc.truncateObject(object, keyLimit, valueLimit, segmentLimit, errorLog);
        assert.equal(newObj['123'].a, 'aa');
    });
    it("Check if segments are truncated", function() {
        var object = {"a": "aa", "b": "bb", "c": "cc" };
        var keyLimit = 3;
        var valueLimit = 5;
        var segmentLimit = 2;
        var errorLog = "test";
        var newObj = cc.truncateObject(object, keyLimit, valueLimit, segmentLimit, errorLog);
        assert.equal(Object.keys(newObj).length, 1);
    });
});