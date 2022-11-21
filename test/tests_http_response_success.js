var assert = require("assert");
var cc = require("../lib/countly-common");

// unit tests for isResponseValid
describe("Response success suite", () => {
    it("Check if correct response parameters returns true", () => {
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.ok(result);
        assert.ok(resultB);
    });
    it("Check if wrong response that includes result in it returns false", () => {
        var str = '{"endResult": "Success"}';
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, false);
        assert.equal(resultB, true);
    });
    it("Check if wrong response that does not include result in it returns false", () => {
        var str = '{"end": "Success"}';
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, false);
        assert.equal(resultB, true);
    });
    it("Check if wrong statusCode greater than 300 returns false", () => {
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(400, str);
        var resultB = cc.isResponseValidBroad(400, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
    it("Check if wrong statusCode less than 200 returns false", () => {
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(100, str);
        var resultB = cc.isResponseValidBroad(100, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
    it("Check if wrong statusCode 300 returns false", () => {
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid(300, str);
        var resultB = cc.isResponseValidBroad(300, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
    it("Check if non Success value at result field returns true", () => {
        var str = '{"result": "Sth"}';
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, true);
        assert.equal(resultB, true);
    });
    it("Check if there is no statusCode it returns false", () => {
        var str = '{"result": "Success"}';
        var result = cc.isResponseValid({}.a, str);
        var resultB = cc.isResponseValidBroad({}.a, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
    it("Check if just string/non-object returns false", () => {
        var str = "RESULT";
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
    it("Check if empty response returns false", () => {
        var res = {};
        var str = "";
        var result = cc.isResponseValid(res, str);
        var resultB = cc.isResponseValidBroad(res, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
    it("Check if JSON array returns true", () => {
        var str = '["result", "Success"]';
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, false);
        assert.equal(resultB, true);
    });
    it("Check if empty JSON arrays returns true", () => {
        var str = '[]';
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, false);
        assert.equal(resultB, true);
    });
    it("Check if just an array returns false", () => {
        var str = [];
        var result = cc.isResponseValid(200, str);
        var resultB = cc.isResponseValidBroad(200, str);
        assert.equal(result, false);
        assert.equal(resultB, false);
    });
});