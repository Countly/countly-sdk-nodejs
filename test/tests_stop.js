/* eslint-disable no-console */
const assert = require("assert");
const path = require("path");
const Countly = require("../lib/countly");
const cc = require("../lib/countly-common");
const hp = require("./helpers/helper_functions");
const { startMockServer } = require("./helpers/mock_server");
const { makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");

const firstKey = "FIRST_APP_KEY";
const secondKey = "SECOND_APP_KEY";

/**
 * Initializes the SDK so that nothing is sent during a test unless it asks for it: no heartbeat within the test,
 * no SDK behavior settings fetch and no health check
 * @param {Object} config - init options to add or replace
 */
function initQuiet(config) {
    Countly.init({
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
        disable_sdk_behavior_settings_updates: true,
        disable_health_check: true,
        ...config,
    });
}

/**
 * Reads the request queue stored in a storage folder, also while the SDK is stopped
 * @param {String} dir - storage folder
 * @returns {Array} stored requests
 */
function storedQueue(dir) {
    return readStoredFile(path.join(dir, "__cly_queue.json"), "cly_queue") || [];
}

/**
 * Names what a request carries: the keys of its events, or what kind of request it is
 * @param {Object} request - stored request, or the parameters the server received
 * @returns {String} event keys separated by commas, or begin_session, end_session, user_details or consent
 */
function contentOf(request) {
    if (request.events) {
        return JSON.parse(request.events).map((event) => event.key).join(",");
    }
    return ["begin_session", "end_session", "user_details", "consent"].find((key) => key in request) || "other";
}

describe("Stop and init again tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- after stop, init with another app key sends the earlier data under the earlier key and the new data under the new key", async() => {
        const server = await startMockServer();
        const dir = makeTempDir("stop-switch");
        Countly.halt(false);
        initQuiet({ app_key: firstKey, url: server.url, device_id: "stop-user", storage_path: dir });
        Countly.begin_session();
        Countly.add_event({ key: "first_app_event" });
        Countly.stop();
        initQuiet({ app_key: secondKey, url: server.url, storage_path: dir });
        Countly.begin_session();
        Countly.add_event({ key: "second_app_event" });
        const delivered = await Countly.flush(10);
        await server.close();
        assert.strictEqual(delivered, true);
        const sent = server.requests.filter((r) => r.path === "/i").map((r) => [r.params.app_key, r.params.device_id, contentOf(r.params)]);
        assert.deepStrictEqual(sent, [
            [firstKey, "stop-user", "begin_session"],
            [firstKey, "stop-user", "first_app_event"],
            [firstKey, "stop-user", "end_session"],
            [secondKey, "stop-user", "begin_session"],
            [secondKey, "stop-user", "second_app_event"],
        ]);
    });

    it("2- stop queues the open view's duration, unsaved custom properties, recorded events and the session's end under the current app key", () => {
        const dir = makeTempDir("stop-open");
        initQuiet({ app_key: firstKey, device_id: "open-user", storage_path: dir });
        Countly.begin_session();
        Countly.track_view("Settings");
        Countly.userData.set("plan", "pro");
        Countly.add_event({ key: "recorded" });
        Countly.stop();
        const queue = storedQueue(dir);
        assert.deepStrictEqual(queue.map(contentOf), ["begin_session", "user_details", "[CLY]_view,recorded,[CLY]_view", "end_session"]);
        queue.forEach((request) => {
            assert.equal(request.app_key, firstKey);
            assert.equal(request.device_id, "open-user");
        });
        assert.equal(JSON.parse(queue[1].user_details).custom.plan, "pro");
        const viewEnd = JSON.parse(queue[2].events)[2];
        assert.equal(viewEnd.segmentation.name, "Settings");
        assert.equal(typeof viewEnd.dur, "number");
        assert.deepStrictEqual(readStoredFile(path.join(dir, "__cly_event.json"), "cly_event"), []);
    });

    it("3- a consent change still waiting to be sent when stop is called is queued under the current app key", () => {
        const dir = makeTempDir("stop-consent");
        initQuiet({ app_key: firstKey, device_id: "consent-user", require_consent: true, storage_path: dir });
        Countly.add_consent(["sessions", "events"]);
        Countly.stop();
        const consents = storedQueue(dir).filter((r) => r.consent);
        assert.equal(consents.length, 1);
        assert.equal(consents[0].app_key, firstKey);
        assert.equal(consents[0].device_id, "consent-user");
        assert.equal(JSON.parse(consents[0].consent).events, true);
        assert.equal(JSON.parse(consents[0].consent).views, false);
    });

    it("4- init without stop is still ignored, and logs that stop has to be called first", () => {
        initQuiet({ app_key: firstKey, device_id: "once-user", storage_path: makeTempDir("stop-once") });
        const logged = [];
        const originalInfo = console.info;
        console.info = (...args) => {
            logged.push(args.join(" "));
        };
        cc.debug = true;
        try {
            initQuiet({ app_key: secondKey, device_id: "twice-user", storage_path: makeTempDir("stop-twice") });
        }
        finally {
            cc.debug = false;
            console.info = originalInfo;
        }
        assert.equal(Countly.app_key, firstKey);
        assert.equal(Countly.get_device_id(), "once-user");
        assert.ok(logged.some((line) => line.indexOf("init,") !== -1 && line.indexOf("stop") !== -1), "no log line tells that init was ignored and stop is needed");
    });

    it("5- stop before init and a second stop do nothing", () => {
        const dir = makeTempDir("stop-repeat");
        Countly.stop();
        initQuiet({ app_key: firstKey, device_id: "repeat-user", storage_path: dir });
        Countly.begin_session();
        Countly.stop();
        Countly.stop();
        assert.deepStrictEqual(storedQueue(dir).map((r) => [r.app_key, contentOf(r)]), [[firstKey, "begin_session"], [firstKey, "end_session"]]);
    });

    it("6- calls between stop and the next init are ignored without an error, and the next init starts clean", () => {
        const dir = makeTempDir("stop-between");
        initQuiet({ app_key: firstKey, device_id: "between-user", storage_path: dir });
        Countly.stop();
        Countly.begin_session();
        Countly.track_view("While stopped");
        Countly.add_event({ key: "while_stopped" });
        Countly.start_event("timed_while_stopped");
        Countly.end_event("timed_while_stopped");
        Countly.request({ app_key: firstKey, device_id: "between-user", begin_session: 1 });
        Countly.change_id("someone-else", false);
        Countly.user_details({ name: "while stopped" });
        initQuiet({ app_key: secondKey, storage_path: dir });
        Countly.begin_session();
        Countly.end_session();
        assert.equal(Countly.get_device_id(), "between-user");
        assert.deepStrictEqual(hp.readEventQueue(), []);
        assert.deepStrictEqual(hp.readRequestQueue().map((r) => [r.app_key, contentOf(r)]), [[secondKey, "begin_session"], [secondKey, "end_session"]]);
    });

    it("7- calls before the first init are ignored without an error", () => {
        Countly.begin_session();
        Countly.track_view("Too early");
        Countly.add_event({ key: "too_early" });
        Countly.end_event("too_early_timed");
        Countly.request({ app_key: firstKey, device_id: "early-user", begin_session: 1 });
        Countly.change_id("early-user", false);
        initQuiet({ app_key: firstKey, device_id: "first-user", storage_path: makeTempDir("before-init") });
        Countly.begin_session();
        assert.equal(Countly.get_device_id(), "first-user");
        assert.deepStrictEqual(hp.readEventQueue(), []);
        assert.deepStrictEqual(hp.readRequestQueue().map(contentOf), ["begin_session"]);
    });

    it("8- with memory storage, init after stop uses the new app key, and the data queued before stop is not kept", () => {
        initQuiet({ app_key: firstKey, device_id: "memory-user", storage_type: Countly.StorageTypes.MEMORY });
        Countly.begin_session();
        Countly.stop();
        initQuiet({ app_key: secondKey, device_id: "next-memory-user", storage_type: Countly.StorageTypes.MEMORY });
        Countly.begin_session();
        assert.equal(Countly.get_device_id(), "next-memory-user");
        assert.deepStrictEqual(hp.readRequestQueue(false, false, true).map((r) => [r.app_key, contentOf(r)]), [[secondKey, "begin_session"]]);
    });

    it("9- after stop, nothing is sent until the next init, and what was not sent stays stored", async() => {
        const server = await startMockServer();
        const dir = makeTempDir("stop-quiet");
        Countly.halt(false);
        initQuiet({ app_key: firstKey, url: server.url, interval: 50, device_id: "quiet-user", storage_path: dir });
        Countly.begin_session();
        assert.strictEqual(await Countly.flush(5), true);
        Countly.add_event({ key: "kept_for_later" });
        Countly.stop();
        const sentMore = await server.waitFor((reqs) => reqs.length > 1, 500);
        await server.close();
        assert.strictEqual(sentMore, false, "a request was sent after stop");
        assert.deepStrictEqual(server.requests.map((r) => contentOf(r.params)), ["begin_session"]);
        assert.deepStrictEqual(storedQueue(dir).map((r) => [r.app_key, contentOf(r)]), [[firstKey, "kept_for_later"], [firstKey, "end_session"]]);
    });
});
