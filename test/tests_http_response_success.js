/* global describe, it, */
var assert = require("assert");
var cc = require("../lib/countly-common");

//unit tests for isResponseValid
describe("Response success suite", ()=>{
    it("Check if correct response parameters returns true", ()=>{
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(200, str);
        assert.ok(result);
    });
    it("Check if wrong response that includes result in it returns false", ()=>{
        var str = '{"endResult": "Success"}';
        var result = cc.isResponseValid(200, str);
        assert.equal(result, false);
    });
    it("Check if wrong response that does not include result in it returns false", ()=>{
        var str = '{"end": "Success"}';
        var result = cc.isResponseValid(200, str);
        assert.equal(result, false);
    });
    it("Check if wrong statusCode greater than 300 returns false", ()=>{
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(400, str);
        assert.equal(result, false);
    });
    it("Check if wrong statusCode less than 200 returns false", ()=>{
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(100, str);
        assert.equal(result, false);
    });
    it("Check if wrong statusCode 300 returns false", ()=>{
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(300, str);
        assert.equal(result, false);
    });
    it("Check if non Success value at result field returns true", ()=>{
        var str = '{"result": "Sth"}';
        var result = cc.isResponseValid(200, str);
        assert.equal(result, true);
    });
    it("Check if there is no statusCode it returns false", ()=>{
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid({}.a, str);
        assert.equal(result, false);
    });
    it("Check if just string/non-object returns false", ()=>{
        var str = "RESULT";
        var result = cc.isResponseValid(200, str);
        assert.equal(result, false);
    });
    it("Check if empty response returns false", ()=>{
        var res = {};
        var str = "";
        var result = cc.isResponseValid(res, str);
        assert.equal(result, false);
    });
});