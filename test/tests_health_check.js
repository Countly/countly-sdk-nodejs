const assert = require("assert");
const path = require("path");
const Countly = require("../lib/countly");
const CountlyStorage = require("../lib/countly-storage");
const HealthCounters = require("../lib/countly-health");
const hp = require("./helpers/helper_functions");
const { passesServerChecksum } = require("./helpers/mock_server");
const { runScript, makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");
const { appKey, settingsServer, settingsRequests, healthChecks, dataRequests, seed, startSdk, storedValue, storedOnDisk, sleep } = require("./helpers/behavior_settings");

const cleared = { el: 0, wl: 0, sc: -1, em: "", bom: 0, cbom: 0, fu: {}, lc: {} };

/**
 * Tells whether a recorded request is a health check
 * @param {Object} request - request recorded by the mock server
 * @returns {Boolean} true for a health check
 */
function isHealthCheck(request) {
    return typeof request.params.hc !== "undefined";
}

/**
 * Answers a request of the mock server with Success
 * @param {Object} res - response
 */
function answerSuccess(res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"result":"Success"}');
}

describe("Health check tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- sends one health check per start, after the settings fetch, with the counters, the app version and the app's identity", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("hc-payload"), { device_id: "hc-user", app_version: "2.5" });
        const sent = await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        Countly.change_id("hc-user-2", false);
        await server.waitFor((reqs) => reqs.filter((r) => r.params.method === "sc").length === 2, 5000);
        Countly.begin_session();
        await Countly.flush(5);
        await server.close();
        assert.ok(sent, "the health check was not sent");
        const checks = healthChecks(server);
        assert.equal(checks.length, 1, "more than one health check was sent in one run");
        const check = checks[0];
        assert.ok(server.requests.indexOf(check) > server.requests.indexOf(settingsRequests(server)[0]), "the health check was sent before the settings were fetched");
        assert.equal(check.path, "/i");
        assert.deepStrictEqual(JSON.parse(check.params.hc), cleared);
        assert.deepStrictEqual(JSON.parse(check.params.metrics), { _app_version: "2.5" });
        assert.equal(check.params.app_key, appKey);
        assert.equal(check.params.device_id, "hc-user");
        assert.equal(check.params.sdk_name, "javascript_native_nodejs");
        assert.ok(check.params.sdk_version);
        assert.equal(hp.readRequestQueue().filter(isHealthCheck).length, 0, "the health check was queued");
    });

    it("2- a queued request the server refuses is reported in the next start's health check without counting as an error, and the counters are cleared once the server confirms it", async() => {
        const refusal = JSON.stringify({ result: "Internal server error", detail: "x".repeat(1500) });
        const refusing = await settingsServer({ body: { c: {} } }, (req, res) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(refusal);
        });
        const dir = makeTempDir("hc-failure");
        startSdk(refusing, dir, { device_id: "hc-failure-user", disable_health_check: true, session_update: 1 });
        Countly.user_details({ name: "refused" });
        const flushed = await Countly.flush(5);
        const failure = { el: 0, wl: 0, sc: 500, em: refusal.substring(0, 1000), bom: 0, cbom: 0, fu: {}, lc: {} };
        const stored = await storedOnDisk(dir, "cly_hc", failure);
        await refusing.close();
        assert.strictEqual(flushed, false);
        assert.ok(stored, "the refused request was not stored for the health check by the update timer");

        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, dir, { device_id: "hc-failure-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        const reset = await storedValue("cly_hc", cleared);
        const delivered = await Countly.flush(5);
        await server.close();
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), failure);
        assert.ok(reset, "the counters were not cleared after the server confirmed the health check");
        assert.strictEqual(delivered, true);
        assert.equal(dataRequests(server).filter((r) => r.params.user_details).length, 1);
    });

    it("3- the counters stay stored when the server does not confirm the health check, which counts as nothing, and the next start sends them again", async() => {
        const stored = { el: 3, wl: 2, sc: 503, em: "busy", bom: 1, cbom: 1, fu: { events: { record: 2 } }, lc: { w701: 1 } };
        const dir = makeTempDir("hc-unconfirmed");
        seed(dir, "cly_hc", stored);
        const refusing = await settingsServer({ body: { c: {} }, hcStatus: 500 });
        startSdk(refusing, dir, { device_id: "hc-unconfirmed-user", session_update: 1 });
        await refusing.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await sleep(1500);
        await refusing.close();
        assert.equal(healthChecks(refusing).length, 1, "the health check was sent again in the same run");
        assert.deepStrictEqual(JSON.parse(healthChecks(refusing)[0].params.hc), stored);

        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, dir, { device_id: "hc-unconfirmed-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        const reset = await storedValue("cly_hc", cleared);
        await server.close();
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), stored, "the refused health check changed the counters");
        assert.ok(reset, "the counters were not cleared after the server confirmed the health check");
    });

    it("4- no health check when it is turned off, while networking is off or in test mode, but turning off settings updates keeps it", async() => {
        const state = { body: { c: {} } };
        const server = await settingsServer(state);
        const fromDevice = (deviceId) => server.requests.filter((r) => r.params.device_id === deviceId);

        startSdk(server, makeTempDir("hc-disabled"), { device_id: "hc-disabled-user", disable_health_check: true });
        await server.waitFor((reqs) => reqs.some((r) => r.params.method === "sc" && r.params.device_id === "hc-disabled-user"), 5000);
        await sleep(300);

        state.body = { c: { networking: false } };
        const offline = makeTempDir("hc-networking-off");
        seed(offline, "cly_sbs", { networking: false });
        startSdk(server, offline, { device_id: "hc-offline-user" });
        await server.waitFor((reqs) => reqs.some((r) => r.params.method === "sc" && r.params.device_id === "hc-offline-user"), 5000);
        await sleep(300);

        state.body = { c: {} };
        startSdk(server, makeTempDir("hc-test-mode"), { device_id: "hc-test-mode-user", test_mode: true });
        await sleep(300);

        startSdk(server, makeTempDir("hc-no-updates"), { device_id: "hc-no-updates-user", disable_sdk_behavior_settings_updates: true });
        const sent = await server.waitFor((reqs) => reqs.some((r) => isHealthCheck(r) && r.params.device_id === "hc-no-updates-user"), 5000);
        await server.close();
        assert.equal(fromDevice("hc-disabled-user").filter(isHealthCheck).length, 0, "the health check was sent although it is turned off");
        assert.equal(fromDevice("hc-offline-user").filter(isHealthCheck).length, 0, "the health check was sent while networking was off");
        assert.equal(fromDevice("hc-test-mode-user").length, 0, "a request was sent in test mode");
        assert.ok(sent, "turning off settings updates also turned off the health check");
        assert.equal(fromDevice("hc-no-updates-user").filter((r) => r.params.method === "sc").length, 0, "the settings were fetched although updates are turned off");
    });

    it("5- counts warnings and their log codes while logging is off, including the ones logged during init", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("hc-logs"), { device_id: "hc-log-user", request_timeout: "soon" });
        Countly.end_event("never_started");
        Countly.change_id("");
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        const check = JSON.parse(healthChecks(server)[0].params.hc);
        assert.deepStrictEqual(check, { ...cleared, wl: 3, fu: { events: { end: 1 } }, lc: { w121: 1, w720: 1, w601: 1 } });
    });

    it("6- is still sent when the settings cannot be fetched, and the failed fetch counts as nothing", async() => {
        const server = await settingsServer({ status: 500, body: { result: "Internal server error" } });
        startSdk(server, makeTempDir("hc-no-settings"), { device_id: "hc-no-settings-user" });
        const sent = await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        assert.ok(sent, "the health check was not sent after the failed settings fetch");
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), cleared);
    });

    it("7- with a salt, the settings request and the health check carry a checksum that 26.01 servers accept", async() => {
        const salt = "hc-salt";
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("hc-salt"), { device_id: "hc-salt-user", salt: salt });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        const check = healthChecks(server)[0];
        assert.ok(passesServerChecksum(settingsRequests(server)[0], salt), "the settings request checksum does not match");
        assert.ok(passesServerChecksum(check, salt), "the health check checksum does not match");
        assert.equal(passesServerChecksum(check, "another-salt"), false);
    });

    it("8- the stored counters survive a damaged value and start from zero for the damaged part", async() => {
        const server = await settingsServer({ body: { c: {} } });
        const dir = makeTempDir("hc-damaged");
        seed(dir, "cly_hc", { el: "many", wl: 4, sc: null, em: 7, bom: 2, cbom: 1, fu: { events: { record: "x", start: 2 }, payments: { pay: 1 } }, lc: { w701: -1, w720: 3 } });
        startSdk(server, dir, { device_id: "hc-damaged-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        const reset = await storedValue("cly_hc", cleared);
        await server.close();
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), { el: 0, wl: 4, sc: -1, em: "", bom: 2, cbom: 1, fu: { events: { start: 2 } }, lc: { w720: 3 } });
        assert.ok(reset, "the damaged counters were not replaced after the server confirmed the health check");
    });

    it("9- counters that change shortly before the process exits are still stored", async() => {
        const dir = makeTempDir("hc-exit");
        const run = await runScript("health_on_exit.js", { STORAGE_DIR: dir }, 20000);
        assert.equal(run.code, 0, run.stdout + run.stderr);
        assert.deepStrictEqual(readStoredFile(path.join(dir, "__cly_hc.json"), "cly_hc"), { ...cleared, wl: 2, lc: { w601: 2 } });
    });

    it("10- counts the session, event, view and crash calls of the app and of the SDK, and the problems they run into", async() => {
        const server = await settingsServer({ body: { c: {} } });
        const dir = makeTempDir("hc-usage");
        startSdk(server, dir, { device_id: "hc-usage-user", disable_health_check: true, session_update: 1 });
        Countly.begin_session();
        Countly.begin_session();
        await sleep(2500);
        Countly.session_duration(5);
        Countly.add_event({ key: "purchase" });
        Countly.start_event("checkout");
        Countly.start_event("checkout");
        Countly.end_event("checkout");
        Countly.end_event("never_started");
        Countly.report_feedback({ widget_id: "widget", rating: 3 });
        Countly.track_view("home");
        Countly.track_pageview("about");
        Countly.log_error(new Error("handled"));
        Countly.add_log("opened the cart");
        Countly.change_id("hc-usage-user-2", false);
        Countly.end_session();
        Countly.end_session();
        Countly.session_duration(1);
        await Countly.flush(5);
        const usage = {
            sessions: { begin: 2, "update:a": 1, update: 2, "end:a": 1, "begin:a": 1, end: 2 },
            events: { record: 1, start: 2, end: 2 },
            views: { start: 2 },
            crashes: { record: 1, log: 1 },
        };
        const codes = { w760: 3, w722: 1, w720: 1 };
        const counters = CountlyStorage.storeGet("cly_hc", null);
        assert.deepStrictEqual([counters.fu, counters.lc], [usage, codes]);

        startSdk(server, dir, { device_id: "hc-usage-user-2" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        const check = JSON.parse(healthChecks(server)[0].params.hc);
        assert.deepStrictEqual([check.fu, check.lc], [usage, codes]);
    });

    it("11- counts the calls of a feature and the problems they run into only while the feature has consent", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("hc-consent"), { device_id: "hc-consent-user", require_consent: true, disable_health_check: true });
        Countly.begin_session();
        Countly.add_event({ key: "before_consent" });
        Countly.end_event("never_started");
        Countly.add_consent("sessions");
        Countly.add_consent("events");
        await sleep(100);
        Countly.add_event({ key: "with_consent" });
        Countly.end_event("never_started");
        Countly.remove_consent("events");
        Countly.add_event({ key: "withdrawn" });
        Countly.end_event("never_started");
        await Countly.flush(5);
        await server.close();
        const counters = CountlyStorage.storeGet("cly_hc", null);
        assert.deepStrictEqual([counters.fu, counters.lc], [{ sessions: { begin: 1 }, events: { record: 1, end: 1 } }, { w720: 1 }]);
    });

    it("12- a method usage or log code count stops growing at 65535 until it is reported", async() => {
        const dir = makeTempDir("hc-cap");
        seed(dir, "cly_hc", { ...cleared, fu: { events: { record: 65535 } }, lc: { w701: 65535 } });
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, dir, { device_id: "hc-cap-user", disable_health_check: true });
        Countly.add_event({ key: "capped" });
        Countly.add_event({});
        await Countly.flush(5);
        await server.close();
        const counters = CountlyStorage.storeGet("cly_hc", null);
        assert.deepStrictEqual([counters.fu.events.record, counters.lc.w701], [65535, 65535]);
    });

    it("13- what is counted while the health check is on its way, and a request refused meanwhile, are kept for the next health check", async() => {
        const dir = makeTempDir("hc-in-flight");
        seed(dir, "cly_hc", { el: 0, wl: 2, sc: 503, em: "busy", bom: 0, cbom: 0, fu: { events: { record: 3 } }, lc: { w701: 2 } });
        let answerHealthCheck = null;
        const server = await settingsServer({ body: { c: {} } }, (req, res, entry) => {
            if (isHealthCheck(entry)) {
                answerHealthCheck = () => answerSuccess(res);
                return;
            }
            if (entry.params.user_details) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end('{"result":"refused"}');
                return;
            }
            answerSuccess(res);
        });
        startSdk(server, dir, { device_id: "hc-in-flight-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        Countly.add_event({ key: "during" });
        Countly.add_event({});
        Countly.user_details({ name: "refused" });
        await server.waitFor((reqs) => reqs.some((r) => r.params.user_details), 5000);
        await sleep(300);
        answerHealthCheck();
        const kept = { el: 0, wl: 1, sc: 500, em: '{"result":"refused"}', bom: 0, cbom: 0, fu: { events: { record: 2 } }, lc: { w701: 1 } };
        const stored = await storedValue("cly_hc", kept);
        await server.close();
        assert.ok(stored, `the counters are ${JSON.stringify(CountlyStorage.storeGet("cly_hc", null))}`);
    });

    it("14- counts each backoff with log code w320, and w321 when it continues a run of backoffs; a request answered in time ends the run", async() => {
        const backoff = { bom_at: 1, bom_d: 1, bom_rqp: 1 };
        const slow = ["slow1", "slow2", "slow3"];
        const nameOf = (entry) => entry.params.user_details && JSON.parse(entry.params.user_details).name;
        const server = await settingsServer({ body: { c: backoff } }, (req, res, entry) => {
            setTimeout(() => answerSuccess(res), slow.indexOf(nameOf(entry)) !== -1 ? 1100 : 0);
        });
        const dir = makeTempDir("hc-backoff");
        seed(dir, "cly_sbs", backoff);
        startSdk(server, dir, { device_id: "hc-backoff-user", disable_health_check: true });
        ["slow1", "slow2", "fast", "slow3"].forEach((name) => {
            Countly.user_details({ name: name });
        });
        const sent = await server.waitFor((reqs) => reqs.some((r) => nameOf(r) === "slow3"), 15000);
        await sleep(1400);
        await Countly.flush(1);
        await server.close();
        assert.ok(sent, "the last request was not sent");
        const counters = CountlyStorage.storeGet("cly_hc", null);
        assert.deepStrictEqual([counters.bom, counters.cbom, counters.wl, counters.lc], [3, 2, 3, { w320: 3, w321: 1 }]);
    });

    it("15- counts the crashes the SDK detected by itself at the next start, and keeps counting after an unhandled rejection", async() => {
        const dir = makeTempDir("hc-crash");
        const run = await runScript("health_crash.js", { STORAGE_DIR: dir }, 20000);
        assert.equal(run.code, 1, run.stdout + run.stderr);
        assert.equal(readStoredFile(path.join(dir, "__cly_hc_crashes.json"), "cly_hc_crashes"), 2);

        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, dir, { device_id: "crash-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        const check = JSON.parse(healthChecks(server)[0].params.hc);
        assert.deepStrictEqual(check.fu, { crashes: { "record:a": 2 }, events: { record: 1 } });
        assert.equal(dataRequests(server).filter((r) => r.params.crash).length, 2);
        assert.strictEqual(CountlyStorage.storeGet("cly_hc_crashes", null), 0);
    });

    it("16- stored counters that can not be read are reported with log code e503 and start from zero", async() => {
        const dir = makeTempDir("hc-unreadable");
        seed(dir, "cly_hc", "not an object");
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, dir, { device_id: "hc-unreadable-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), { ...cleared, el: 1, lc: { e503: 1 } });
    });

    it("17- calls without their required value are ignored with a warning and a log code instead of throwing", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("hc-missing-values"), { device_id: "hc-missing-user", disable_health_check: true });
        Countly.add_event();
        Countly.end_event();
        Countly.add_consent();
        Countly.remove_consent();
        Countly.init({ app_key: appKey, url: server.url });
        await Countly.flush(5);
        await server.close();
        const counters = CountlyStorage.storeGet("cly_hc", null);
        assert.deepStrictEqual([counters.wl, counters.lc], [5, { w701: 2, w402: 2, w110: 1 }]);
    });

    it("18- the counters take away only what a delivered health check reported, and follow consent and crash reporting", () => {
        const counters = HealthCounters.create(() => true);
        counters.recordUsage("events", "record");
        counters.recordUsage("views", "start");
        counters.recordUsage("payments", "pay");
        counters.recordLogCode("w701", "events");
        counters.logFailedNetworkRequest(503, "x".repeat(1500));
        counters.logFailedNetworkRequest(0, "no answer");
        counters.logBackoffRequest();
        const sent = counters.snapshot();
        assert.equal(sent.em.length, 1000);
        counters.recordUsage("events", "record");
        counters.logBackoffRequest();
        counters.clearSentValues(sent);
        assert.deepStrictEqual(counters.snapshot(), { el: 0, wl: 0, sc: -1, em: "", bom: 1, cbom: 2, fu: { events: { record: 1 } }, lc: { w320: 1, w321: 1 } });

        counters.logConsecutiveBackoffRequest();
        counters.logBackoffRequest();
        assert.deepStrictEqual(counters.snapshot().lc, { w320: 2, w321: 1 });

        counters.stopRecording();
        counters.recordUsage("events", "record");
        counters.recordLogCode("w700");
        counters.logWarning();
        counters.resumeRecording();
        counters.recordLogCode("w700");
        assert.deepStrictEqual([counters.snapshot().fu, counters.snapshot().lc.w700, counters.snapshot().wl], [{ events: { record: 1 } }, 1, 1]);

        const withoutConsent = HealthCounters.create(() => false);
        withoutConsent.recordUsage("sessions", "begin");
        withoutConsent.recordLogCode("w760", "sessions");
        withoutConsent.recordLogCode("w601");
        assert.deepStrictEqual([withoutConsent.snapshot().fu, withoutConsent.snapshot().lc], [{}, { w601: 1 }]);
    });
});
