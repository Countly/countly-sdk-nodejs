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

    it("8- a bulk request that gets no answer is given up after request_timeout and sent again", async() => {
        const server = await startMockServer((req, res, entry, count) => {
            if (count > 1) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"result":"Success"}');
            }
        });
        const bulk = new CountlyBulk({ app_key: appKey, url: server.url, interval: 100, fail_timeout: 1, request_timeout: 1 });
        bulk.add_request({ device_id: "bulk-timeout-user", begin_session: 1 });
        bulk.start();
        const resent = await server.waitFor((reqs) => bulkInnerRequests(reqs).filter((r) => r.device_id === "bulk-timeout-user").length >= 2, 10000);
        bulk.stop();
        await server.close();
        assert.ok(resent, "the bulk queue stopped after the unanswered request");
    });

    it("9- a bulk request whose answer is cut off midway is sent again", async() => {
        const server = await startMockServer((req, res, entry, count) => {
            if (count === 1) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write('{"res');
                setTimeout(() => req.socket.destroy(), 50);
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"result":"Success"}');
        });
        const bulk = new CountlyBulk({ app_key: appKey, url: server.url, interval: 100, fail_timeout: 1 });
        bulk.add_request({ device_id: "bulk-cutoff-user", begin_session: 1 });
        bulk.start();
        const resent = await server.waitFor((reqs) => bulkInnerRequests(reqs).filter((r) => r.device_id === "bulk-cutoff-user").length >= 2, 10000);
        bulk.stop();
        await server.close();
        assert.ok(resent, "the bulk queue stopped after the cut-off response");
    });

    it("10- events reach the server cut to the internal limits set on the bulk instance", async() => {
        const server = await startMockServer();
        const bulk = new CountlyBulk({ app_key: appKey, url: server.url, interval: 100, max_key_length: 4, max_value_size: 5, max_segmentation_values: 2 });
        bulk.add_event("limits-user", { key: "checkout_completed", segmentation: { category: "overlong-value", plan: "pro", coupon: "dropped" } });
        bulk.start();
        const sent = await server.waitFor((reqs) => bulkInnerRequests(reqs).some((r) => r.device_id === "limits-user"), 10000);
        bulk.stop();
        await server.close();
        assert.ok(sent, "the event was not sent");
        const { events } = bulkInnerRequests(server.requests).filter((r) => r.device_id === "limits-user")[0];
        assert.equal(events.length, 1);
        assert.equal(events[0].key, "chec");
        assert.deepStrictEqual(events[0].segmentation, { cate: "overl", plan: "pro" });
    });

    it("11- events added to the bulk instance keep to the default internal limits", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1" });
        const segmentation = {};
        for (let i = 0; i < 101; i++) {
            segmentation[`${i}-${"k".repeat(200)}`] = "v".repeat(300);
        }
        bulk.add_event("default-limits-user", { key: "e".repeat(200), segmentation: segmentation });
        const event = bulk._getBulkEventQueue()["default-limits-user"][0];
        assert.equal(event.key, "e".repeat(128));
        const keys = Object.keys(event.segmentation);
        assert.equal(keys.length, 100);
        keys.forEach((key, i) => {
            assert.equal(key, `${i}-${"k".repeat(200)}`.substring(0, 128));
            assert.equal(event.segmentation[key], "v".repeat(256));
        });
    });

    it("12- events of a bulk user keep to the internal limits set on the bulk instance", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_key_length: 4, max_value_size: 5 });
        bulk.add_user({ device_id: "limits-bulk-user" }).add_event({ key: "checkout_completed", segmentation: { category: "overlong-value" } });
        const events = bulk._getBulkEventQueue()["limits-bulk-user"];
        assert.equal(events.length, 1);
        assert.equal(events[0].key, "chec");
        assert.deepStrictEqual(events[0].segmentation, { cate: "overl" });
    });

    it("13- events that a cluster worker hands to the main process keep to the main process's internal limits", async() => {
        const server = await startMockServer();
        const run = runScript("bulk_cluster_limits.js", { COUNTLY_URL: server.url, RUN_MS: "8000" }, 30000);
        const sent = await server.waitFor((reqs) => bulkInnerRequests(reqs).some((r) => r.device_id === "cluster-limits-user"), 20000);
        const result = await run;
        await server.close();
        assert.ok(sent, `the worker's event was not sent: ${result.stderr}`);
        const { events } = bulkInnerRequests(server.requests).filter((r) => r.device_id === "cluster-limits-user")[0];
        assert.equal(events.length, 1);
        assert.equal(events[0].key, "chec");
        assert.deepStrictEqual(events[0].segmentation, { cate: "overl" });
    });

    it("14- a bulk user keeps its settings whole when the bulk instance has low internal limits", () => {
        // the limits are shorter than the setting names and values, and allow one setting only
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_key_length: 8, max_value_size: 5, max_segmentation_values: 1 });
        const settings = { ip_address: "203.0.113.7", country_code: "TR", city: "Istanbul", require_consent: true };
        const withoutConsent = bulk.add_user({ device_id: "settings-user-without-consent", ...settings });
        withoutConsent.begin_session();
        withoutConsent.add_event({ key: "purchase" });
        const withConsent = bulk.add_user({ device_id: "settings-user-with-consent", ...settings });
        withConsent.add_consent(["sessions", "location", "events"]);
        withConsent.begin_session();
        withConsent.add_event({ key: "purchase" });

        const requests = bulk._getBulkRequestQueue();
        assert.equal(requests.filter((r) => r.device_id === "settings-user-without-consent").length, 0, "a request of the user without consent was queued");
        assert.equal(bulk._getBulkEventQueue()["settings-user-without-consent"], undefined, "an event of the user without consent was queued");
        const session = requests.find((r) => r.device_id === "settings-user-with-consent" && r.begin_session === 1);
        assert.ok(session, "the session of the user with consent was not queued");
        assert.equal(session.ip_address, "203.0.113.7");
        assert.equal(session.country_code, "TR");
        assert.equal(session.city, "Istanbul");
        assert.equal(bulk._getBulkEventQueue()["settings-user-with-consent"].length, 1);
    });

    it("15- a bulk user's profile, custom properties, views and traces keep to the internal limits set on the bulk instance", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_key_length: 4, max_value_size: 5, max_segmentation_values: 1 });
        const user = bulk.add_user({ device_id: "instance-limits-user" });
        user.user_details({ name: "Long name", custom: { plan: "enterprise", team: "dropped" } });
        user.custom_set("department", "engineering").custom_save();
        user.report_view("Checkout page", 1700000000, 5);
        user.report_trace({ type: "device", name: "app_start", stz: 1700000000000, etz: 1700000001000, apm_metrics: { duration: 1000 } });

        const requests = bulk._getBulkRequestQueue().filter((r) => r.device_id === "instance-limits-user");
        assert.equal(requests.length, 4);
        assert.deepStrictEqual(requests.find((r) => r.user_details && r.user_details.name).user_details, { name: "Long ", custom: { plan: "enter" } });
        assert.deepStrictEqual(requests.find((r) => r.user_details && !r.user_details.name).user_details, { custom: { depa: "engin" } });
        assert.equal(requests.find((r) => r.events).events[0].segmentation.name, "Check");
        assert.equal(JSON.parse(requests.find((r) => r.apm).apm).name, "app_");
    });

    it("16- a bulk user's own limits take precedence over the ones set on the bulk instance", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_value_size: 5 });
        bulk.add_user({ device_id: "own-limits-user", max_value_size: 8 }).user_details({ name: "Long name here" });
        const request = bulk._getBulkRequestQueue().find((r) => r.device_id === "own-limits-user");
        assert.deepStrictEqual(request.user_details, { name: "Long nam", custom: {} });
    });

    it("17- custom APM metrics of a bulk user keep to the internal limits, and the reserved metrics stay whole", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_key_length: 8, max_segmentation_values: 2 });
        const user = bulk.add_user({ device_id: "apm-limits-user" });
        user.report_trace({
            type: "network",
            name: "/checkout",
            stz: 1700000000000,
            etz: 1700000001330,
            apm_metrics: { response_time: 1330, response_payload_size: 120, response_code: 200, request_payload_size: 70, cpu_usage_percent: 45, memory_used_mb: 512, disk_reads_count: 7 },
        });
        assert.strictEqual(user.report_trace({ type: "device", name: "no_metrics", stz: 1700000000000, etz: 1700000001000 }), user);
        const traces = bulk._getBulkRequestQueue().filter((r) => r.device_id === "apm-limits-user" && r.apm).map((r) => JSON.parse(r.apm));
        assert.equal(traces.length, 1, "a trace without metrics was queued");
        assert.equal(traces[0].name, "/checkou");
        assert.deepStrictEqual(traces[0].apm_metrics, { response_time: 1330, response_payload_size: 120, response_code: 200, request_payload_size: 70, cpu_usag: 45, memory_u: 512 });
    });

    it("18- crash reports of a bulk user keep to the stack trace, breadcrumb and crash segmentation limits", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_key_length: 4, max_value_size: 5, max_segmentation_values: 1, max_breadcrumb_count: 2, max_stack_trace_lines_per_thread: 2, max_stack_trace_line_length: 10 });
        const error = "Error: something failed\n    at first (a.js:1:1)\n    at second (a.js:2:2)\n\nThread 2 started\n    at third (b.js:3:3)\n    at fourth (b.js:4:4)";
        const logs = "first step\nsecond step\nthird step";
        const crash = { _os: "Linux", _os_version: "6", _app_version: "1.0", _error: error, _logs: logs, _custom: { library: "version-1.2.3", other: "dropped" }, _nonfatal: true };
        bulk.add_user({ device_id: "crash-limits-user" }).report_crash(crash, 1700000000);
        const request = bulk._getBulkRequestQueue().find((r) => r.device_id === "crash-limits-user");
        assert.equal(request.timestamp, 1700000000);
        assert.deepStrictEqual(request.crash, {
            _os: "Linux",
            _os_version: "6",
            _app_version: "1.0",
            _error: "Error: som\n    at fir\n\nThread 2 s\n    at thi",
            _logs: "secon\nthird",
            _custom: { libr: "versi" },
            _nonfatal: true,
        });
        assert.equal(crash._error, error, "the reported crash object was changed");
        assert.equal(crash._logs, logs, "the reported crash object was changed");
    });

    it("19- a native crash dump of a bulk user is sent whole, while the same text in a JavaScript crash is cut", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1", max_stack_trace_lines_per_thread: 2, max_stack_trace_line_length: 10 });
        const dump = "A".repeat(30000);
        const user = bulk.add_user({ device_id: "native-crash-user" });
        user.report_crash({ _os: "Android", _os_version: "14", _app_version: "1.0", _error: dump, _native_cpp: true });
        user.report_crash({ _os: "Android", _os_version: "14", _app_version: "1.0", _error: dump });
        const errors = bulk._getBulkRequestQueue().filter((r) => r.device_id === "native-crash-user").map((r) => r.crash._error);
        assert.equal(errors.length, 2);
        assert.equal(errors[0], dump);
        assert.equal(errors[1], "AAAAAAAAAA");
    });

    it("20- without set limits, a bulk crash keeps 50 threads of 30 lines of 200 characters, 20,000 characters in all, and 100 breadcrumbs", () => {
        const bulk = new CountlyBulk({ app_key: appKey, url: "http://127.0.0.1:1" });
        const user = bulk.add_user({ device_id: "default-crash-user" });
        const threads = [];
        for (let i = 0; i < 60; i++) {
            threads.push(`Thread ${i}`);
        }
        const lines = [];
        for (let i = 0; i < 40; i++) {
            lines.push(`line ${i} ${"x".repeat(250)}`);
        }
        const fullThreads = [];
        for (let i = 0; i < 5; i++) {
            fullThreads.push(new Array(30).fill("y".repeat(200)).join("\n"));
        }
        const breadcrumbs = [];
        for (let i = 0; i < 101; i++) {
            breadcrumbs.push(`crumb ${i} ${"z".repeat(300)}`);
        }
        const base = { _os: "Linux", _os_version: "6", _app_version: "1.0" };
        user.report_crash({ ...base, _error: threads.join("\n\n") });
        user.report_crash({ ...base, _error: lines.join("\n") });
        user.report_crash({ ...base, _error: fullThreads.join("\n\n"), _logs: breadcrumbs.join("\n") });
        const crashes = bulk._getBulkRequestQueue().filter((r) => r.device_id === "default-crash-user").map((r) => r.crash);
        assert.equal(crashes.length, 3);
        assert.equal(crashes[0]._error, threads.slice(0, 50).join("\n\n"));
        assert.equal(crashes[1]._error, lines.slice(0, 30).map((line) => line.substring(0, 200)).join("\n"));
        assert.equal(crashes[2]._error, fullThreads.join("\n\n").substring(0, 20000));
        assert.equal(crashes[2]._logs, breadcrumbs.slice(1).map((crumb) => crumb.substring(0, 256)).join("\n"));
    });
});
