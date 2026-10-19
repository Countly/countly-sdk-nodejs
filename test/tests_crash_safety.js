/* global BigInt */
const assert = require("assert");
const path = require("path");
const Countly = require("../lib/countly");
const hp = require("./helpers/helper_functions");
const cc = require("../lib/countly-common");
const { startMockServer, receivedEvents } = require("./helpers/mock_server");
const { runScript, makeTempDir, removeTempDirs } = require("./helpers/run_script");

async function checkBigIntScript(storageType) {
    const server = await startMockServer();
    const env = { COUNTLY_URL: server.url, STORAGE_DIR: makeTempDir("bigint") };
    if (storageType) {
        env.STORAGE_TYPE = storageType;
    }
    const run = await runScript("bigint_values.js", env, 20000);
    await server.close();
    assert.equal(run.code, 0, run.stderr);
    assert.ok(run.stdout.indexOf("survived") !== -1, "the app crashed");
    const events = receivedEvents(server.requests);
    const order = events.find((e) => e.key === "order_paid");
    assert.ok(order, "the event was not delivered");
    assert.equal(order.segmentation.order_id, "9007199254740993");
    assert.equal(order.segmentation.plan, "pro");
    assert.deepStrictEqual(order.segmentation.loop, { name: "loop" });
    const view = events.find((e) => e.key === "[CLY]_view");
    assert.equal(view.segmentation.cart_id, "12");
}

describe("Crash safety tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- a BigInt or a self-referencing object in event and view data does not crash the app (file storage)", async() => {
        await checkBigIntScript();
    });

    it("2- a BigInt or a self-referencing object in event and view data does not crash the app (memory storage)", async() => {
        await checkBigIntScript("memory");
    });

    it("3- BigInt values in user details and custom user properties are stored as text", () => {
        Countly.init({ app_key: "YOUR_APP_KEY", url: "https://try.count.ly", interval: 10000, storage_path: `${makeTempDir("bigint-user")}${path.sep}`, device_id: "big-user" });
        const loop = { level: 1 };
        loop.self = loop;
        Countly.user_details({ name: "Big", custom: { account_id: BigInt(42), loop: loop } });
        Countly.userData.set("customer_id", BigInt("12345678901234567890"));
        Countly.userData.save();
        Countly.log_error(new Error("with big segments"), { order_id: BigInt(7) });
        const queue = hp.readRequestQueue();
        const details = JSON.parse(queue[0].user_details);
        assert.equal(details.custom.account_id, "42");
        assert.deepStrictEqual(details.custom.loop, { level: 1 });
        assert.equal(JSON.parse(queue[1].user_details).custom.customer_id, "12345678901234567890");
        assert.equal(JSON.parse(queue[2].crash)._custom.order_id, "7");
    });

    it("4- track_errors reports an unhandled promise rejection as non-fatal and the app keeps running", async() => {
        const server = await startMockServer();
        const run = await runScript("rejection.js", { COUNTLY_URL: server.url, STORAGE_DIR: makeTempDir("rejection") }, 20000);
        await server.close();
        assert.ok(run.stdout.indexOf("still running") !== -1, "the app stopped after the rejection");
        const crashes = server.requests.filter((r) => r.params.crash).map((r) => JSON.parse(r.params.crash));
        assert.equal(crashes.length, 1);
        assert.equal(crashes[0]._nonfatal, true);
        assert.ok(crashes[0]._error.indexOf("unhandled payment failure") !== -1);
    });

    it("5- safe copies serialize exactly like the original wherever the original can be serialized", () => {
        /* eslint-disable no-new-wrappers */
        const value = {
            text: new String("boxed"), number: new Number(7), flag: new Boolean(false), when: new Date(0), list: [1, "a", null, undefined], skip: undefined, fn: () => 1, nested: { deep: [{ a: 1 }] },
        };
        /* eslint-enable no-new-wrappers */
        assert.equal(JSON.stringify(cc.makeJsonSafe(value)), JSON.stringify(value));
    });
});
