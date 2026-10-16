/* global runthis */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Countly = require("../lib/countly");
const hp = require("./helpers/helper_functions");
const { startMockServer } = require("./helpers/mock_server");
const { makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function initMain(config) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
        storage_path: `${makeTempDir("switch")}${path.sep}`,
        ...config,
    });
}

function queuedEvents() {
    const events = [];
    hp.readRequestQueue().forEach((request) => {
        if (request.events) {
            JSON.parse(request.events).forEach((event) => {
                event.device_id = request.device_id;
                events.push(event);
            });
        }
    });
    return events;
}

describe("User switch and consent tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- removing consent tells the server", async() => {
        initMain({ require_consent: true, device_id: "consent-user" });
        Countly.add_consent(["events", "users"]);
        await sleep(1200);
        Countly.remove_consent("events");
        await sleep(1200);
        const consents = hp.readRequestQueue().filter((r) => r.consent).map((r) => JSON.parse(r.consent));
        assert.equal(consents.length, 2);
        assert.equal(consents[0].events, true);
        assert.equal(consents[1].events, false);
        assert.equal(consents[1].users, true);
    });

    it("2- removing consent for a feature group clears the group as well", () => {
        initMain({ require_consent: true, device_id: "group-user" });
        Countly.group_features({ activity: ["sessions", "events"] });
        Countly.add_consent("activity");
        assert.equal(Countly.check_consent("activity"), true);
        Countly.remove_consent("activity");
        assert.equal(Countly.check_consent("activity"), false);
        assert.equal(Countly.check_consent("events"), false);
    });

    it("3- change_id ignores empty IDs and keeps tracking under the current one", () => {
        initMain({ device_id: "alice" });
        Countly.change_id(undefined);
        Countly.change_id(null);
        Countly.change_id("");
        Countly.change_id(NaN);
        Countly.change_id(Infinity);
        assert.equal(Countly.get_device_id(), "alice");
        Countly.user_details({ name: "still alice" });
        assert.equal(hp.readRequestQueue()[0].device_id, "alice");
        Countly.change_id(12345);
        assert.equal(Countly.get_device_id(), "12345");
    });

    it("4- an empty device ID stored by an older version is ignored at start", () => {
        const dir = makeTempDir("empty-id");
        fs.writeFileSync(path.join(dir, "__cly_id.json"), JSON.stringify({ cly_id: "" }));
        initMain({ device_id: "carol", storage_path: `${dir}${path.sep}` });
        assert.equal(Countly.get_device_id(), "carol");
    });

    it("5- switching users without merge keeps the previous user's view, profile changes and breadcrumbs with that user", async() => {
        initMain({ device_id: "alice" });
        Countly.begin_session();
        Countly.track_view("Alice invoices");
        Countly.userData.set("plan", "pro");
        Countly.add_log("alice opened invoice 4711");
        await sleep(100);
        Countly.change_id("bob", false);
        try {
            runthis();
        }
        catch (ex) {
            Countly.log_error(ex);
        }
        await sleep(100);

        const durationEvents = queuedEvents().filter((e) => e.key === "[CLY]_view" && typeof e.dur !== "undefined");
        assert.equal(durationEvents.length, 1);
        assert.equal(durationEvents[0].device_id, "alice");
        assert.equal(durationEvents[0].segmentation.name, "Alice invoices");
        assert.equal(hp.readEventQueue().length, 0, "an event recorded for alice is still waiting to be sent under bob");

        const profiles = hp.readRequestQueue().filter((r) => r.user_details);
        assert.equal(profiles.length, 1);
        assert.equal(profiles[0].device_id, "alice");
        assert.equal(JSON.parse(profiles[0].user_details).custom.plan, "pro");

        const crash = hp.readRequestQueue().find((r) => r.crash);
        assert.equal(crash.device_id, "bob");
        assert.equal(typeof JSON.parse(crash.crash)._logs, "undefined");
    });

    it("6- a view held back for missing consent is not replayed for the next user", async() => {
        initMain({ device_id: "alice", require_consent: true });
        Countly.track_view("Alice secret page");
        Countly.change_id("bob", false);
        Countly.add_consent(["views", "events"]);
        await sleep(100);
        const views = queuedEvents().concat(hp.readEventQueue()).filter((e) => e.key === "[CLY]_view");
        assert.equal(views.length, 0);
    });

    it("7- remote config values of the previous user are cleared on a switch without merge, and kept on a merge", async() => {
        const server = await startMockServer((req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ flag: "alice-variant" }));
        });
        initMain({ device_id: "alice", url: server.url });
        await new Promise((resolve) => {
            Countly.fetch_remote_config(() => resolve());
        });
        assert.equal(Countly.get_remote_config("flag"), "alice-variant");
        Countly.change_id("alice-login", true);
        assert.equal(Countly.get_remote_config("flag"), "alice-variant");
        Countly.change_id("bob", false);
        assert.deepStrictEqual(Countly.get_remote_config(), {});
        await server.close();
    });

    it("8- remote config downloaded for the previous user is not used when it arrives after a switch", async() => {
        const server = await startMockServer((req, res, entry) => {
            setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ discount: `${entry.params.device_id}-only-discount` }));
            }, 400);
        });
        const dir = makeTempDir("rc-race");
        initMain({ device_id: "alice", url: server.url, storage_path: `${dir}${path.sep}` });
        const callbackResult = new Promise((resolve) => {
            Countly.fetch_remote_config((err, values) => resolve({ err, values }));
        });
        await sleep(100);
        Countly.change_id("bob", false);
        const result = await callbackResult;
        await sleep(100);
        await server.close();
        assert.ok(result.err instanceof Error, "the callback did not report that the values were not used");
        assert.deepStrictEqual(Countly.get_remote_config(), {});
        assert.deepStrictEqual(readStoredFile(path.join(dir, "__cly_remote_configs.json"), "cly_remote_configs"), {});
    });

    it("9- with automatic remote config, a slower answer for the previous user does not replace the new user's values", async() => {
        const server = await startMockServer((req, res, entry) => {
            setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ discount: `${entry.params.device_id}-only-discount` }));
            }, entry.params.device_id === "alice" ? 500 : 50);
        });
        initMain({ device_id: "alice", url: server.url, remote_config: true });
        await sleep(100);
        Countly.change_id("bob", false);
        await sleep(900);
        await server.close();
        assert.deepStrictEqual(Countly.get_remote_config(), { discount: "bob-only-discount" });
    });
});
