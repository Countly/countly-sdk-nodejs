const assert = require("assert");

describe("A suite with an asynchronous hook", () => {
    beforeEach(async() => {
        await new Promise((resolve) => {
            setTimeout(resolve, 1);
        });
    });

    it("fails", () => {
        assert.equal(1, 2);
    });

    it("passes after the failure", () => {
        assert.ok(true);
    });
});
