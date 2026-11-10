const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Countly = require("../lib/countly");
const CountlyStorage = require("../lib/countly-storage");
const hp = require("./helpers/helper_functions");
const { startMockServer } = require("./helpers/mock_server");
const { makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");

const KEY_A = "app-key-a";
const KEY_B = "app-key-b";

/**
 * Waits for a time
 * @param {Number} ms - milliseconds
 * @returns {Promise} resolves after the time
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Answers a request of a mock server with JSON
 * @param {Object} res - response
 * @param {Number} status - HTTP status code
 * @param {String} body - response body
 */
function answer(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body);
}

/**
 * Starts a mock server that answers settings fetches with empty settings, remote config with a value named after
 * the app key, and every other request with Success, or with 503 while state.down is set. Each recorded request
 * gets the status it was answered with.
 * @returns {Promise<Object>} the mock server, with a state object
 */
async function countlyServer() {
    const state = { down: false };
    const server = await startMockServer((req, res, entry) => {
        entry.status = state.down ? 503 : 200;
        if (state.down) {
            answer(res, 503, '{"result":"down"}');
        }
        else if (entry.params.method === "sc") {
            answer(res, 200, '{"c":{}}');
        }
        else if (entry.params.method === "fetch_remote_config") {
            answer(res, 200, JSON.stringify({ flag: `${entry.params.app_key}-value` }));
        }
        else {
            answer(res, 200, '{"result":"Success"}');
        }
    });
    server.state = state;
    return server;
}

/**
 * Starts the SDK against a mock server with request processing on, its own storage folder and app key A
 * @param {Object} server - mock server the SDK sends to
 * @param {Object} config - init options to add or override
 */
function startSdk(server, config) {
    Countly.halt(false);
    Countly.init({
        app_key: KEY_A,
        url: server.url,
        device_id: "switch-user",
        interval: 100,
        max_events: -1,
        storage_path: `${makeTempDir("app-key-url")}${path.sep}`,
        disable_health_check: true,
        ...config,
    });
}

/**
 * Initializes the SDK with app key A while request processing is off, so the queue can be read as it is
 */
function initWithoutSending() {
    Countly.init({
        app_key: KEY_A,
        url: "https://try.count.ly",
        device_id: "queue-user",
        max_events: -1,
        storage_path: `${makeTempDir("app-key-queue")}${path.sep}`,
    });
}

/**
 * Names an event for the assertions: the key, or "view:<name>" and "view-end:<name>" for views
 * @param {Object} event - event of a request
 * @returns {String} the name
 */
function eventName(event) {
    if (event.key === "[CLY]_view") {
        return typeof event.dur === "undefined" ? `view:${event.segmentation.name}` : `view-end:${event.segmentation.name}`;
    }
    return event.key;
}

/**
 * Describes each data request in one line: the app key and what the request carries
 * @param {Array} requests - requests recorded by a mock server, or queued request objects
 * @returns {Array} one line per request
 */
function kinds(requests) {
    return requests.filter((r) => typeof r.path === "undefined" || r.path === "/i").map((r) => {
        const p = r.params || r;
        const parts = [p.app_key];
        if (p.begin_session) {
            parts.push("begin_session");
        }
        if (p.end_session) {
            parts.push("end_session");
        }
        if (p.consent) {
            parts.push("consent");
        }
        if (p.user_details) {
            parts.push(`user_details:${Object.keys(JSON.parse(p.user_details).custom || {}).join(",")}`);
        }
        if (p.events) {
            parts.push(`events:${JSON.parse(p.events).map(eventName).join(",")}`);
        }
        return parts.join(" ");
    });
}

/**
 * Data requests a mock server answered with 200
 * @param {Object} server - mock server
 * @returns {Array} the requests
 */
function delivered(server) {
    return server.requests.filter((r) => r.path === "/i" && r.status === 200);
}

/**
 * Direct requests of one method a mock server received
 * @param {Object} server - mock server, or an object with its requests
 * @param {String} method - "sc" or "fetch_remote_config"
 * @returns {Array} the requests
 */
function fetches(server, method) {
    return server.requests.filter((r) => r.path === "/o/sdk" && r.params.method === method);
}

describe("Server URL and app key change tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- a new server URL is used for every later send, also for the requests queued before the change, and keeps the app key", async() => {
        const serverA = await countlyServer();
        const serverB = await countlyServer();
        serverA.state.down = true;
        startSdk(serverA, { disable_sdk_behavior_settings_updates: true });
        Countly.begin_session();
        Countly.add_event({ key: "recorded_for_a" });
        assert.equal(await Countly.flush(2), false);
        Countly.change_server_url(`${serverB.url}///`);
        assert.equal(Countly.url, serverB.url);
        Countly.add_event({ key: "recorded_after_change" });
        assert.equal(await Countly.flush(5), true);
        await serverA.close();
        await serverB.close();
        assert.ok(serverA.requests.length > 0, "the first server was never tried");
        kinds(serverA.requests).forEach((kind) => assert.equal(kind, `${KEY_A} begin_session`));
        assert.deepStrictEqual(kinds(serverB.requests), [`${KEY_A} begin_session`, `${KEY_A} events:recorded_for_a`, `${KEY_A} events:recorded_after_change`]);
        serverB.requests.forEach((r) => {
            assert.equal(r.path, "/i");
            assert.equal(r.url.indexOf("/i?"), 0);
            assert.equal(r.params.device_id, "switch-user");
        });
    });

    it("2- an invalid server URL is ignored with an error and a log code, the current server stays and nothing is fetched again", async() => {
        const server = await countlyServer();
        startSdk(server, {});
        assert.ok(await server.waitFor((reqs) => reqs.some((r) => r.params.method === "sc"), 5000));
        const invalid = [undefined, null, 42, "", "   ", "not a url", "ftp://example.com", "http://", "http:///", "example.com:8080", "http:example.com", "//example.com", "HTTPS://example.com", " http://example.com", "http://host:3132/countly", "http://host?x=1", "http://u:p@host", "http://[::1]:3132"];
        invalid.forEach((url) => Countly.change_server_url(url));
        assert.equal(Countly.url, server.url);
        Countly.add_event({ key: "after_invalid_urls" });
        assert.equal(await Countly.flush(5), true);
        await server.close();
        assert.deepStrictEqual(kinds(delivered(server)), [`${KEY_A} events:after_invalid_urls`]);
        assert.equal(fetches(server, "sc").length, 1, "an invalid URL caught the server up");
        assert.equal(CountlyStorage.storeGet("cly_hc", null).lc.e102, invalid.length);
    });

    it("3- after a server URL change the new server gets the consent state, and the settings and remote config are fetched from it", async() => {
        const serverA = await countlyServer();
        const serverB = await countlyServer();
        startSdk(serverA, { require_consent: true, remote_config: true });
        Countly.add_consent(["sessions", "remote-config"]);
        assert.equal(await Countly.flush(5), true);
        assert.ok(await serverA.waitFor((reqs) => reqs.some((r) => r.params.method === "sc"), 5000));
        const requestsAtA = serverA.requests.length;
        Countly.change_server_url(serverB.url);
        assert.ok(await serverB.waitFor((reqs) => fetches({ requests: reqs }, "sc").length === 1 && fetches({ requests: reqs }, "fetch_remote_config").length === 1, 5000));
        assert.equal(await Countly.flush(5), true);
        await sleep(100);
        await serverA.close();
        await serverB.close();
        assert.equal(serverA.requests.length, requestsAtA, "the previous server got a request after the change");
        assert.equal(fetches(serverA, "fetch_remote_config").length, 0);
        assert.deepStrictEqual(kinds(delivered(serverB)), [`${KEY_A} consent`]);
        const consent = JSON.parse(delivered(serverB)[0].params.consent);
        assert.deepStrictEqual([consent.sessions, consent["remote-config"], consent.events], [true, true, false]);
        assert.equal(fetches(serverB, "sc")[0].params.app_key, KEY_A);
        assert.equal(fetches(serverB, "fetch_remote_config")[0].params.app_key, KEY_A);
        assert.equal(Countly.get_remote_config("flag"), `${KEY_A}-value`);
    });

    it("4- an app key change sends what belongs to the previous app with its key, begins a session for the new app and catches the new app up", async() => {
        const server = await countlyServer();
        startSdk(server, { remote_config: true });
        assert.ok(await server.waitFor((reqs) => reqs.some((r) => r.params.method === "fetch_remote_config"), 5000));
        await sleep(100);
        assert.equal(Countly.get_remote_config("flag"), `${KEY_A}-value`);
        Countly.begin_session();
        Countly.track_view("Home");
        Countly.userData.set("plan", "pro");
        Countly.add_event({ key: "for_app_a" });
        Countly.start_event("checkout");
        Countly.change_app_key(KEY_B);
        assert.equal(Countly.app_key, KEY_B);
        assert.deepStrictEqual(Countly.get_remote_config(), {});
        assert.deepStrictEqual(CountlyStorage.storeGet("cly_remote_configs", null), {});
        Countly.end_event("checkout");
        Countly.add_event({ key: "for_app_b" });
        assert.equal(await Countly.flush(5), true);
        assert.ok(await server.waitFor((reqs) => fetches({ requests: reqs }, "fetch_remote_config").length === 2, 5000));
        await sleep(100);
        await server.close();
        assert.deepStrictEqual(kinds(delivered(server)), [
            `${KEY_A} begin_session`,
            `${KEY_A} events:view:Home,for_app_a,view-end:Home`,
            `${KEY_A} user_details:plan`,
            `${KEY_A} end_session`,
            `${KEY_B} begin_session`,
            `${KEY_B} events:checkout,for_app_b`,
        ]);
        const checkout = JSON.parse(delivered(server)[5].params.events)[0];
        assert.ok(checkout.dur >= 0, "the timed event started before the change lost its duration");
        delivered(server).forEach((r) => assert.equal(r.params.device_id, "switch-user"));
        assert.deepStrictEqual(fetches(server, "sc").map((r) => r.params.app_key), [KEY_A, KEY_B]);
        assert.deepStrictEqual(fetches(server, "fetch_remote_config").map((r) => r.params.app_key), [KEY_A, KEY_B]);
        assert.equal(Countly.get_remote_config("flag"), `${KEY_B}-value`);
        assert.equal(Countly.url, server.url);
    });

    it("5- an invalid, a placeholder or the current app key is ignored, and nothing is closed or begun", async() => {
        const server = await countlyServer();
        startSdk(server, { disable_sdk_behavior_settings_updates: true });
        Countly.begin_session();
        const invalid = [undefined, null, 42, "", "YOUR_APP_KEY", {}];
        invalid.forEach((key) => Countly.change_app_key(key));
        Countly.change_app_key(KEY_A);
        assert.equal(Countly.app_key, KEY_A);
        Countly.add_event({ key: "still_app_a" });
        assert.equal(await Countly.flush(5), true);
        await server.close();
        assert.deepStrictEqual(kinds(delivered(server)), [`${KEY_A} begin_session`, `${KEY_A} events:still_app_a`]);
        const codes = CountlyStorage.storeGet("cly_hc", null).lc;
        assert.deepStrictEqual([codes.e103, codes.w101], [invalid.length, undefined]);
    });

    it("6- with consent required, a consent change waiting at an app key change goes to the previous app and the new app gets the current state", async() => {
        const server = await countlyServer();
        startSdk(server, { require_consent: true, disable_sdk_behavior_settings_updates: true });
        Countly.add_consent(["sessions", "events"]);
        Countly.change_app_key(KEY_B);
        assert.equal(await Countly.flush(5), true);
        await sleep(1200);
        await server.close();
        const consents = delivered(server).filter((r) => r.params.consent).map((r) => [r.params.app_key, JSON.parse(r.params.consent).events]);
        assert.deepStrictEqual(consents, [[KEY_A, true], [KEY_B, true]]);
        assert.equal(Countly.check_consent("events"), true);
    });

    it("7- requests queued before an app key change keep their key, and replace_all_app_keys_in_queue_with_current_app_key gives them the current key in place", async() => {
        initWithoutSending();
        Countly.begin_session();
        Countly.add_event({ key: "for_app_a" });
        Countly.request({ app_key: "other-app", device_id: "raw-user", begin_session: 1 });
        Countly.change_app_key(KEY_B);
        const queued = hp.readRequestQueue().slice();
        assert.deepStrictEqual(kinds(queued), [`${KEY_A} begin_session`, "other-app begin_session", `${KEY_A} events:for_app_a`, `${KEY_A} end_session`, `${KEY_B} begin_session`]);
        Countly.replace_all_app_keys_in_queue_with_current_app_key();
        const replaced = hp.readRequestQueue();
        assert.deepStrictEqual(replaced.map((r) => r.app_key), [KEY_B, KEY_B, KEY_B, KEY_B, KEY_B]);
        replaced.forEach((r, i) => assert.strictEqual(r, queued[i]));
        assert.equal(replaced[1].device_id, "raw-user");
        await sleep(100);
        const stored = readStoredFile(path.join(CountlyStorage.getStoragePath(), "__cly_queue.json"), "cly_queue");
        assert.deepStrictEqual(stored.map((r) => r.app_key), [KEY_B, KEY_B, KEY_B, KEY_B, KEY_B]);
    });

    it("8- remove_different_app_keys_from_queue removes the queued requests of other app keys and leaves the event queue alone", () => {
        initWithoutSending();
        Countly.begin_session();
        Countly.add_event({ key: "for_app_a" });
        Countly.request({ app_key: "other-app", device_id: "raw-user", begin_session: 1 });
        Countly.change_app_key(KEY_B);
        Countly.add_event({ key: "for_app_b" });
        Countly.remove_different_app_keys_from_queue();
        assert.deepStrictEqual(kinds(hp.readRequestQueue()), [`${KEY_B} begin_session`]);
        assert.deepStrictEqual(hp.readEventQueue().map((e) => e.key), ["for_app_b"]);
    });

    it("9- flush_queues discards queued requests and events, and keeps timed events, the open view, unsaved profile changes and the health check counters", async() => {
        const server = await countlyServer();
        server.state.down = true;
        startSdk(server, { disable_sdk_behavior_settings_updates: true });
        Countly.begin_session();
        Countly.add_event({ key: "discarded" });
        Countly.track_view("Home");
        Countly.start_event("checkout");
        Countly.start_event("checkout");
        Countly.userData.set("plan", "pro");
        assert.equal(await Countly.flush(2), false);
        Countly.flush_queues();
        assert.deepStrictEqual([hp.readRequestQueue().length, hp.readEventQueue().length], [0, 0]);
        server.state.down = false;
        Countly.end_event("checkout");
        Countly.userData.save();
        Countly.track_view("Cart");
        assert.equal(await Countly.flush(5), true);
        await server.close();
        assert.deepStrictEqual(kinds(delivered(server)), [`${KEY_A} user_details:plan`, `${KEY_A} events:checkout,view-end:Home,view:Cart`]);
        assert.equal(CountlyStorage.storeGet("cly_hc", null).lc.w722, 1);
    });

    it("10- the queue methods during a send: the request on its way is not lost or sent twice, and a waiting flush still resolves", async() => {
        let count = 0;
        let failFirst = true;
        const server = await startMockServer((req, res, entry) => {
            count++;
            entry.status = count === 1 && failFirst ? 503 : 200;
            setTimeout(() => answer(res, entry.status, '{"result":"Success"}'), count === 1 ? 300 : 0);
        });
        // replace: the request on its way leaves with the previous key, its retry and the rest with the current one
        startSdk(server, { disable_sdk_behavior_settings_updates: true });
        Countly.begin_session();
        Countly.add_event({ key: "for_app_a" });
        let flushing = Countly.flush();
        await sleep(100);
        Countly.change_app_key(KEY_B);
        Countly.replace_all_app_keys_in_queue_with_current_app_key();
        assert.equal(await flushing, false);
        assert.equal(await Countly.flush(5), true);
        const replaced = server.requests.splice(0);
        assert.deepStrictEqual(kinds(replaced), [`${KEY_A} begin_session`, `${KEY_B} begin_session`, `${KEY_B} events:for_app_a`, `${KEY_B} end_session`, `${KEY_B} begin_session`]);
        assert.equal(replaced[0].params.timestamp, replaced[1].params.timestamp);
        assert.deepStrictEqual([replaced[0].status, replaced[1].status], [503, 200]);

        // remove: the request on its way is still delivered once, a flush without timeout resolves
        count = 0;
        failFirst = false;
        startSdk(server, { disable_sdk_behavior_settings_updates: true });
        Countly.begin_session();
        Countly.add_event({ key: "for_app_a" });
        flushing = Countly.flush();
        await sleep(100);
        Countly.change_app_key(KEY_B);
        Countly.remove_different_app_keys_from_queue();
        assert.equal(await flushing, false);
        assert.equal(await Countly.flush(5), true);
        await sleep(100);
        const removed = server.requests.splice(0);
        assert.deepStrictEqual(kinds(removed), [`${KEY_A} begin_session`, `${KEY_B} begin_session`]);

        // flush_queues: the request on its way is not stopped, the discarded data never arrives
        count = 0;
        startSdk(server, { disable_sdk_behavior_settings_updates: true });
        Countly.begin_session();
        Countly.add_event({ key: "discarded" });
        flushing = Countly.flush();
        await sleep(100);
        Countly.flush_queues();
        assert.equal(await flushing, false);
        Countly.add_event({ key: "after_flush_queues" });
        assert.equal(await Countly.flush(5), true);
        await server.close();
        assert.deepStrictEqual(kinds(server.requests), [`${KEY_A} begin_session`, `${KEY_A} events:after_flush_queues`]);
    });

    it("11- remote config downloaded for the previous app is not used when it arrives after an app key change", async() => {
        const server = await startMockServer((req, res, entry) => {
            if (entry.params.method === "fetch_remote_config") {
                setTimeout(() => answer(res, 200, JSON.stringify({ flag: `${entry.params.app_key}-value` })), entry.params.app_key === KEY_A ? 500 : 50);
                return;
            }
            answer(res, 200, entry.params.method === "sc" ? '{"c":{}}' : '{"result":"Success"}');
        });
        startSdk(server, { remote_config: true });
        await sleep(100);
        Countly.change_app_key(KEY_B);
        assert.deepStrictEqual(Countly.get_remote_config(), {});
        await sleep(900);
        await server.close();
        assert.deepStrictEqual(fetches(server, "fetch_remote_config").map((r) => r.params.app_key), [KEY_A, KEY_B]);
        assert.deepStrictEqual(Countly.get_remote_config(), { flag: `${KEY_B}-value` });
        assert.deepStrictEqual(CountlyStorage.storeGet("cly_remote_configs", null), { flag: `${KEY_B}-value` });
    });

    it("12- before init the calls are ignored with a warning and a log code, and a new init uses the URL and app key of its config again", async() => {
        const serverA = await countlyServer();
        const serverB = await countlyServer();
        Countly.halt(false);
        Countly.change_server_url(serverB.url);
        Countly.change_app_key(KEY_B);
        Countly.flush_queues();
        Countly.replace_all_app_keys_in_queue_with_current_app_key();
        Countly.remove_different_app_keys_from_queue();
        assert.deepStrictEqual([Countly.url, Countly.app_key], [undefined, undefined]);
        const dir = makeTempDir("not-persisted");
        const config = { app_key: KEY_A, url: serverA.url, device_id: "restart-user", interval: 100, storage_path: `${dir}${path.sep}`, disable_health_check: true, disable_sdk_behavior_settings_updates: true };
        Countly.init(config);
        Countly.change_server_url(serverB.url);
        Countly.change_app_key(KEY_B);
        Countly.add_event({ key: "after_both_changes" });
        assert.equal(await Countly.flush(5), true);
        assert.equal(CountlyStorage.storeGet("cly_hc", null).lc.w101, 5);
        Countly.halt(false);
        Countly.init(config);
        assert.deepStrictEqual([Countly.url, Countly.app_key], [serverA.url, KEY_A]);
        Countly.add_event({ key: "after_restart" });
        assert.equal(await Countly.flush(5), true);
        await sleep(100);
        await serverA.close();
        await serverB.close();
        assert.deepStrictEqual(kinds(delivered(serverB)), [`${KEY_B} events:after_both_changes`]);
        assert.deepStrictEqual(kinds(delivered(serverA)), [`${KEY_A} events:after_restart`]);
        fs.readdirSync(dir).forEach((file) => {
            assert.equal(fs.readFileSync(path.join(dir, file), "utf8").indexOf(serverB.url), -1, `${file} holds the changed server URL`);
        });
    });

    it("13- SDK behavior settings downloaded for the previous app are not used when they arrive after an app key change", async() => {
        const server = await startMockServer((req, res, entry) => {
            if (entry.params.method === "sc") {
                const previousApp = entry.params.app_key === KEY_A;
                setTimeout(() => answer(res, 200, JSON.stringify({ c: { cet: !previousApp } })), previousApp ? 500 : 50);
                return;
            }
            answer(res, 200, '{"result":"Success"}');
        });
        startSdk(server, { disable_health_check: false });
        await sleep(100);
        Countly.change_app_key(KEY_B);
        await sleep(900);
        Countly.add_event({ key: "custom_event" });
        const recorded = hp.readEventQueue().map((e) => e.key);
        await server.close();
        assert.deepStrictEqual(fetches(server, "sc").map((r) => r.params.app_key), [KEY_A, KEY_B]);
        assert.deepStrictEqual(CountlyStorage.storeGet("cly_sbs", null), { cet: true });
        assert.deepStrictEqual(recorded, ["custom_event"]);
        assert.deepStrictEqual(server.requests.filter((r) => typeof r.params.hc !== "undefined").map((r) => r.params.app_key), [KEY_B]);
    });
});
