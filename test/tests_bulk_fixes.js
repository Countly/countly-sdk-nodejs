/* eslint-disable no-console */
const assert = require("assert");
const cluster = require("cluster");
const CountlyBulk = require("../lib/countly-bulk");
const hp = require("./helpers/helper_functions");
const { startMockServer } = require("./helpers/mock_server");
const { runScript } = require("./helpers/run_script");

const appKey = "YOUR_APP_KEY";

// every CountlyBulk instance registers a cluster "fork" listener and these tests create several instances
cluster.setMaxListeners(60);

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function bulkInnerRequests(requests) {
    const inner = [];
    requests.filter((r) => r.path === "/i/bulk").forEach((r) => {
        JSON.parse(r.params.requests).forEach((request) => {
            inner.push(request);
        });
    });
    return inner;
}

describe("Bulk fix tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });

    it("1- a bulk user created with an IP address can record everything, and every request carries the IP", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1" });
        const user = bulk.add_user({ device_id: "ip-user", ip_address: "8.8.8.8" });
        user.begin_session({ _os: "Linux", _os_version: "6", _app_version: "1.0" }, 90, 1700000000)
            .user_details({ name: "IP user" })
            .report_view("Home", 1700000060, 30)
            .report_conversion("campaign-1", "campaign-user-1")
            .custom_set("plan", "pro")
            .custom_save();
        const forUser = bulk._getBulkRequestQueue().filter((r) => r.device_id === "ip-user");
        assert.ok(forUser.length >= 6, `only ${forUser.length} requests were queued`);
        assert.ok(forUser.some((r) => r.begin_session === 1));
        forUser.forEach((request) => {
            assert.equal(request.ip_address, "8.8.8.8");
        });
    });

    it("2- consent changes of a bulk user reach the queue with the user's device ID", async() => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1" });
        const user = bulk.add_user({ device_id: "consent-user", require_consent: true });
        user.add_consent(["events", "users"]);
        await sleep(1200);
        user.remove_consent("events");
        await sleep(1200);
        const consents = bulk._getBulkRequestQueue().filter((r) => r.consent);
        assert.equal(consents.length, 2);
        consents.forEach((request) => {
            assert.equal(request.device_id, "consent-user");
        });
        assert.equal(JSON.parse(consents[0].consent).events, true);
        assert.equal(JSON.parse(consents[1].consent).events, false);
        assert.equal(JSON.parse(consents[1].consent).users, true);
    });

    it("3- giving consent replays the session and view that were held back, without crashing", async() => {
        const server = await startMockServer();
        const run = await runScript("bulk_consent_replay.js", { COUNTLY_URL: server.url }, 20000);
        await server.close();
        assert.equal(run.code, 0, run.stderr);
        assert.ok(run.stdout.indexOf("survived") !== -1, "the process crashed");
        const inner = bulkInnerRequests(server.requests).filter((r) => r.device_id === "consent-user");
        assert.ok(inner.some((r) => r.begin_session === 1), "the held-back session was not replayed");
        assert.ok(inner.some((r) => r.events && r.events.some((e) => e.key === "[CLY]_view" && e.segmentation.name === "Home")), "the held-back view was not replayed");
    });

    it("4- the queue-empty callback waits until data waiting for a retry is delivered", async() => {
        let delivered = 0;
        const server = await startMockServer((req, res, entry, count) => {
            if (count === 1) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end('{"result":"Error"}');
                return;
            }
            delivered++;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"result":"Success"}');
        });
        const bulk = new CountlyBulk({ app_key: appKey, url: server.url, interval: 100, fail_timeout: 1 });
        bulk.add_request({ device_id: "retry-user", begin_session: 1 });
        const deliveredWhenEmpty = await new Promise((resolve) => {
            let reported = false;
            bulk.start(() => {
                if (!reported) {
                    reported = true;
                    resolve(delivered);
                }
            });
            setTimeout(() => resolve(-1), 10000);
        });
        bulk.stop();
        await server.close();
        assert.equal(deliveredWhenEmpty, 1, "the callback reported an empty queue while data was still waiting");
    });

    it("5- queued bulk requests are sent one after another without waiting for the next heartbeat", async() => {
        const server = await startMockServer();
        const bulk = new CountlyBulk({ app_key: appKey, url: server.url, interval: 10000 });
        for (let i = 0; i < 120; i++) {
            bulk.add_request({ device_id: `user-${i}`, begin_session: 1 });
        }
        bulk.start();
        const allSent = await server.waitFor((reqs) => bulkInnerRequests(reqs).length === 120, 3000);
        bulk.stop();
        await server.close();
        assert.ok(allSent, `only ${bulkInnerRequests(server.requests).length} of 120 requests were sent within 3 s`);
        assert.equal(server.requests.length, 3);
    });

    it("6- users whose events were all sent no longer stay in memory", async() => {
        const server = await startMockServer();
        const bulk = new CountlyBulk({ app_key: appKey, url: server.url, interval: 100 });
        for (let i = 0; i < 3; i++) {
            bulk.add_event(`device-${i}`, { key: "visit" });
        }
        bulk.start();
        await server.waitFor((reqs) => bulkInnerRequests(reqs).length === 3, 3000);
        bulk.stop();
        await server.close();
        assert.deepStrictEqual(Object.keys(bulk._getBulkEventQueue()), []);
    });

    it("7- warns that tamper protection (salt) cannot be used with bulk requests", () => {
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (...args) => {
            warnings.push(args.join(" "));
        };
        let bulk;
        try {
            bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", salt: "secret" });
        }
        finally {
            console.warn = originalWarn;
        }
        assert.ok(bulk);
        assert.ok(warnings.some((w) => w.indexOf("salt") !== -1), "no warning about salt was printed");
    });
});
