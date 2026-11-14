// In each request scenario the SDK sends the requests api/requests/<scenario>.json records, with the values that change
// from run to run masked. A deliberate change is recorded with npm run requests:update and needs a CHANGELOG.md line.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const hp = require("./helpers/helper_functions");
const { SCENARIOS, RECORDS, requestsReport, scenarioRequests } = require("./helpers/request_scenarios");

describe("Request records", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(async() => {
        await hp.clearStorage();
    });

    Object.keys(SCENARIOS).forEach((name) => {
        it(`sends the requests api/requests/${name}.json records in the ${name} scenario`, async() => {
            const file = path.join(RECORDS, `${name}.json`);
            const current = requestsReport(await scenarioRequests(name));
            const committed = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
            assert.strictEqual(current, committed, `The requests of the ${name} scenario differ from api/requests/${name}.json. If that is deliberate, run npm run requests:update, check the difference and add a CHANGELOG.md line.`);
        });
    });
});
