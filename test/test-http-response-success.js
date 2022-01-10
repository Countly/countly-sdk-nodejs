/* global describe, it, */
var assert = require("assert");
var cc = require("../lib/countly-common");

//unit tests for isResponseValid
describe("Response success suite", ()=>{
    it("Check if correct response parameters returns true", ()=>{
        var res = {"statusCode": 200};
        var str = {"result": "Success"};
        var result = cc.isResponseValid(res, str);
        assert.ok(result);
    });
    it("Check if wrong response that includes result in it returns false", ()=>{
        var res = {"statusCode": 200};
        var str = {"endResult": "Success"};
        var result = cc.isResponseValid(res, str);
        assert.equal(result, false);
    });
    it("Check if wrong statusCode returns false", ()=>{
        var res = {"statusCode": 400};
        var str = {"result": "Success"};
        var result = cc.isResponseValid(res, str);
        assert.equal(result, false);
    });
    it("Check if non Success value at result field returns true", ()=>{
        var res = {"statusCode": 200};
        var str = {"result": "Sth"};
        var result = cc.isResponseValid(res, str);
        assert.equal(result, true);
    });
    it("Check if can parse JSON and returns true", ()=>{
        var res = {"statusCode": 200};
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(res, str);
        assert.equal(result, true);
    });
    it("Check if there is no statusCode it returns false", ()=>{
        var res = {"a": 200};
        var str = {"result": "Success"};
        var result = cc.isResponseValid(res, str);
        assert.equal(result, false);
    });
    it("Check if just string/ non object returns false", ()=>{
        var res = {"statusCode": 200};
        var str = "RESULT";
        var result = cc.isResponseValid(res, str);
        assert.equal(result, false);
    });
    it("Check if empty response returns false", ()=>{
        var res = {};
        var str = "";
        var result = cc.isResponseValid(res, str);
        assert.equal(result, false);
    });
});