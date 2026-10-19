const assert = require("assert");
const path = require("path");
const Countly = require("../lib/countly");
const hp = require("./helpers/helper_functions");
const { passesServerChecksum } = require("./helpers/mock_server");
const { runScript, makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");
const { appKey, settingsServer, settingsRequests, healthChecks, dataRequests, seed, startSdk, storedValue, storedOnDisk, sleep } = require("./helpers/behavior_settings");

const cleared = { el: 0, wl: 0, sc: -1, em: "", bom: 0, cbom: 0 };

/**
 * Tells whether a recorded request is a health check
 * @param {Object} request - request recorded by the mock server
 * @returns {Boolean} true for a health check
 */
function isHealthCheck(request) {
    return typeof request.params.hc !== "undefined";
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

    it("2- a request the server refuses is reported in the next start's health check, and the counters are cleared once the server confirms it", async() => {
        const refusal = JSON.stringify({ result: "Internal server error", detail: "x".repeat(1500) });
        const refusing = await settingsServer({ body: { c: {} } }, (req, res) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(refusal);
        });
        const dir = makeTempDir("hc-failure");
        startSdk(refusing, dir, { device_id: "hc-failure-user", disable_health_check: true });
        Countly.user_details({ name: "refused" });
        const flushed = await Countly.flush(5);
        await refusing.close();
        assert.strictEqual(flushed, false);
        const failure = { el: 2, wl: 0, sc: 500, em: refusal.substring(0, 1000), bom: 0, cbom: 0 };
        assert.ok(await storedOnDisk(dir, "cly_hc", failure), "the refused request was not stored for the health check");

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

    it("3- the counters stay stored when the server does not confirm the health check, and the next start sends them again", async() => {
        const stored = { el: 3, wl: 2, sc: 503, em: "busy", bom: 1, cbom: 1 };
        const dir = makeTempDir("hc-unconfirmed");
        seed(dir, "cly_hc", stored);
        const refusing = await settingsServer({ body: { c: {} }, hcStatus: 500 });
        startSdk(refusing, dir, { device_id: "hc-unconfirmed-user" });
        await refusing.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        const withRefusal = { ...stored, el: stored.el + 1 };
        const kept = await storedValue("cly_hc", withRefusal);
        await sleep(300);
        await refusing.close();
        assert.equal(healthChecks(refusing).length, 1, "the health check was sent again in the same run");
        assert.deepStrictEqual(JSON.parse(healthChecks(refusing)[0].params.hc), stored);
        assert.ok(kept, "the counters were not kept, with the refused health check counted as an error");

        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, dir, { device_id: "hc-unconfirmed-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        const reset = await storedValue("cly_hc", cleared);
        await server.close();
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), withRefusal);
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

    it("5- counts errors and warnings while logging is off, including warnings logged during init", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("hc-logs"), { device_id: "hc-log-user", request_timeout: "soon" });
        Countly.end_event("never_started");
        Countly.change_id("");
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        const check = JSON.parse(healthChecks(server)[0].params.hc);
        assert.deepStrictEqual([check.el, check.wl], [1, 2]);
    });

    it("6- is still sent when the settings cannot be fetched, and counts the failed fetch", async() => {
        const server = await settingsServer({ status: 500, body: { result: "Internal server error" } });
        startSdk(server, makeTempDir("hc-no-settings"), { device_id: "hc-no-settings-user" });
        const sent = await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        await server.close();
        assert.ok(sent, "the health check was not sent after the failed settings fetch");
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), { ...cleared, el: 1, wl: 1 });
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
        seed(dir, "cly_hc", { el: "many", wl: 4, sc: null, em: 7, bom: 2, cbom: 1 });
        startSdk(server, dir, { device_id: "hc-damaged-user" });
        await server.waitFor((reqs) => reqs.some(isHealthCheck), 5000);
        const reset = await storedValue("cly_hc", cleared);
        await server.close();
        assert.deepStrictEqual(JSON.parse(healthChecks(server)[0].params.hc), { el: 0, wl: 4, sc: -1, em: "", bom: 2, cbom: 1 });
        assert.ok(reset, "the damaged counters were not replaced after the server confirmed the health check");
    });

    it("9- counters that change shortly before the process exits are still stored", async() => {
        const dir = makeTempDir("hc-exit");
        const run = await runScript("health_on_exit.js", { STORAGE_DIR: dir }, 20000);
        assert.equal(run.code, 0, run.stdout + run.stderr);
        assert.deepStrictEqual(readStoredFile(path.join(dir, "__cly_hc.json"), "cly_hc"), { ...cleared, wl: 2 });
    });
});
