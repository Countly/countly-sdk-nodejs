const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Countly = require("../lib/countly");
const CountlyStorage = require("../lib/countly-storage");
const behavior = require("../lib/countly-behavior");
const hp = require("./helpers/helper_functions");
const { receivedEvents } = require("./helpers/mock_server");
const { makeTempDir, removeTempDirs } = require("./helpers/run_script");
const { appKey, settingsServer, settingsRequests, dataRequests, seed, startSdk, storedValue, storedOnDisk, sleep } = require("./helpers/behavior_settings");

describe("SDK behavior settings tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- reads the server's answer in both formats, ignores unknown keys and keeps only usable values", () => {
        const warnings = [];
        const v2 = behavior.parseAnswer(JSON.stringify({
            v: 2, t: 1, lg: { e: false }, ct: 1, c: { tracking: false, rqs: 50, bom_preset: "Default", filter_preset: "Blacklisting", jte: ["a"], lkl: "64", ltl: 0, eqs: 2.5, bom_rqp: 1.5, scui: 100000 },
        }), (message) => warnings.push(message));
        assert.deepStrictEqual(v2, { tracking: false, rqs: 50, scui: behavior.MAX_REFRESH_HOURS });
        assert.equal(warnings.length, 4, warnings.join("\n"));
        assert.deepStrictEqual(behavior.parseAnswer(JSON.stringify({ v: 1, t: 1, c: { networking: true } })), { networking: true });
        assert.deepStrictEqual(behavior.parseAnswer(JSON.stringify({ c: {} })), {});
        [JSON.stringify({ result: "Request does not match checksum" }), "[]", "\"text\"", "not json", JSON.stringify({ c: [] }), JSON.stringify({ c: null })].forEach((answer) => {
            assert.strictEqual(behavior.parseAnswer(answer), null, answer);
        });
        assert.strictEqual(behavior.parseProvided({ tracking: false }), null);
        assert.deepStrictEqual(behavior.parseProvided({ c: { tracking: false } }), { tracking: false });
    });

    it("2- uses the server's value, else the developer's, else the default, and pauses only when all three backoff conditions hold", () => {
        assert.equal(behavior.valueOf({ rqs: 5 }, "rqs", 100), 5);
        assert.equal(behavior.valueOf({}, "rqs", 100), 100);
        assert.equal(behavior.valueOf({}, "bom_d"), 60);
        assert.equal(behavior.valueOf({}, "tracking"), true);
        const base = { durationSeconds: 10, queueLength: 50, queueSize: 100, ageHours: 24, bom_at: 10, bom_rqp: 0.5, bom_ra: 24 };
        assert.equal(behavior.shouldBackOff(base), true);
        assert.equal(behavior.shouldBackOff({ ...base, durationSeconds: 9.9 }), false);
        assert.equal(behavior.shouldBackOff({ ...base, queueLength: 51 }), false);
        assert.equal(behavior.shouldBackOff({ ...base, ageHours: 24.1 }), false);
    });

    it("3- fetches the settings at start with the app's identity, stores them and puts them into effect", async() => {
        const server = await settingsServer({ body: { v: 2, t: 1, c: { lkl: 7, rqs: 300 } } });
        const dir = makeTempDir("sbs-fetch");
        startSdk(server, dir, { device_id: "settings-user", app_version: "3.1" });
        const inUse = await storedValue("cly_sbs", { lkl: 7, rqs: 300 });
        await server.close();
        assert.ok(inUse, "the fetched settings were not put into effect");
        const request = settingsRequests(server)[0];
        assert.equal(request.params.app_key, appKey);
        assert.equal(request.params.device_id, "settings-user");
        assert.equal(request.params.sdk_name, "javascript_native_nodejs");
        assert.equal(request.params.av, "3.1");
        assert.ok(request.params.sdk_version);
        assert.equal(Countly.maxKeyLength, 7);
        assert.ok(await storedOnDisk(dir, "cly_sbs", { lkl: 7, rqs: 300 }), "the settings were not stored");
    });

    it("4- with tracking off nothing new is recorded, data recorded before is still delivered, and turning it on resumes recording", async() => {
        const state = { body: { c: { tracking: false } } };
        const server = await settingsServer(state);
        startSdk(server, makeTempDir("sbs-tracking"), { device_id: "tracking-user", interval: 10000 });
        Countly.add_event({ key: "before_switch" });
        await storedValue("cly_sbs", { tracking: false });
        Countly.add_event({ key: "while_off" });
        Countly.user_details({ name: "while off" });
        Countly.request({ app_key: appKey, device_id: "tracking-user", begin_session: 1 });
        await Countly.flush(5);
        assert.deepStrictEqual(receivedEvents(dataRequests(server)).map((e) => e.key), ["before_switch"]);
        assert.equal(dataRequests(server).filter((r) => r.params.user_details || r.params.begin_session).length, 0);

        state.body = { c: { tracking: true } };
        Countly.change_id("tracking-user-2", false);
        await storedValue("cly_sbs", { tracking: true });
        Countly.add_event({ key: "after_switch" });
        await Countly.flush(5);
        await server.close();
        assert.deepStrictEqual(receivedEvents(dataRequests(server)).map((e) => e.key), ["before_switch", "after_switch"]);
    });

    it("5- with networking off data is kept but only the settings are fetched, and turning it on delivers the backlog", async() => {
        const state = { body: { c: { networking: false } } };
        const server = await settingsServer(state);
        startSdk(server, makeTempDir("sbs-networking"), { device_id: "network-user" });
        await storedValue("cly_sbs", { networking: false });
        Countly.add_event({ key: "kept_event" });
        Countly.user_details({ name: "kept" });
        const started = Date.now();
        const flushed = await Countly.flush(5);
        assert.strictEqual(flushed, false);
        assert.ok(Date.now() - started < 1000, "flush waited although nothing can be sent");
        await sleep(500);
        assert.equal(dataRequests(server).length, 0, "data was sent while networking was off");
        assert.equal(server.requests.filter((r) => r.params.hc).length, 0, "the health check was sent while networking was off");
        let remoteConfigError = null;
        Countly.fetch_remote_config((err) => {
            remoteConfigError = err;
        });
        assert.ok(remoteConfigError instanceof Error, "remote config did not report that networking is off");

        state.body = { c: { networking: true } };
        Countly.change_id("network-user-2", false);
        await storedValue("cly_sbs", { networking: true });
        const delivered = await Countly.flush(5);
        Countly.fetch_remote_config();
        const remoteConfigSent = await server.waitFor((reqs) => reqs.some((r) => r.params.method === "fetch_remote_config"), 5000);
        await server.close();
        assert.strictEqual(delivered, true);
        assert.ok(remoteConfigSent, "remote config was not fetched after networking was turned on");
        assert.equal(server.requests.filter((r) => r.params.method === "fetch_remote_config" && r.params.device_id === "network-user").length, 0, "remote config was fetched while networking was off");
        assert.deepStrictEqual(receivedEvents(dataRequests(server)).map((e) => e.key), ["kept_event"]);
        assert.equal(dataRequests(server).filter((r) => r.params.user_details).length, 1);
    });

    it("6- each feature switch turns off only its own feature", async() => {
        const switches = { st: false, vt: false, cet: false, crt: false, lt: false };
        const server = await settingsServer({ body: { c: switches } });
        const dir = makeTempDir("sbs-features");
        seed(dir, "cly_sbs", switches);
        startSdk(server, dir, { device_id: "feature-user", country_code: "TR", city: "Izmir" });
        Countly.begin_session();
        Countly.track_view("Home");
        Countly.add_event({ key: "custom_event" });
        Countly.add_event({ key: "[CLY]_star_rating", segmentation: { rating: 5 } });
        Countly.log_error(new Error("not recorded"));
        Countly.user_details({ name: "Feature User" });
        Countly.end_session();
        await Countly.flush(5);
        await server.close();
        const requests = dataRequests(server);
        assert.equal(requests.filter((r) => r.params.begin_session || r.params.end_session || r.params.crash).length, 0);
        assert.deepStrictEqual(receivedEvents(requests).map((e) => e.key), ["[CLY]_star_rating"]);
        const details = requests.find((r) => r.params.user_details);
        assert.ok(details, "user details were not sent");
        assert.equal(details.params.location, "");
        assert.equal(details.params.country_code, undefined);
        assert.equal(details.params.city, undefined);
    });

    it("7- key, value, segmentation and batch limits from the server apply to custom events recorded afterwards, and internal events keep their key and segmentation", async() => {
        const limits = { lkl: 5, lvs: 3, lsv: 1, eqs: 1 };
        const server = await settingsServer({ body: { c: limits } });
        const dir = makeTempDir("sbs-limits");
        seed(dir, "cly_sbs", limits);
        startSdk(server, dir, { device_id: "limit-user", max_key_length: 50, max_value_size: 50, max_segmentation_values: 10, max_events: 10 });
        Countly.add_event({ key: "abcdefghij", segmentation: { plan: "premium", tier: "gold" } });
        Countly.add_event({ key: "second" });
        Countly.track_view("Home");
        Countly.add_event({ key: "[CLY]_star_rating", segmentation: { rating: 5, widget_id: "w1", platform: "node" } });
        await Countly.flush(5);
        await server.close();
        const withEvents = dataRequests(server).filter((r) => r.params.events);
        assert.equal(withEvents.length, 4, "events were not sent one per request");
        const events = receivedEvents(withEvents);
        assert.deepStrictEqual(events.map((e) => e.key), ["abcde", "secon", "[CLY]_view", "[CLY]_star_rating"]);
        assert.deepStrictEqual(events[0].segmentation, { plan: "pre" });
        assert.equal(events[2].segmentation.name, "Hom");
        assert.equal(events[2].segmentation.visit, 1);
        assert.deepStrictEqual(events[3].segmentation, { rating: 5, widget_id: "w1", platform: "node" });
    });

    it("8- the server can require consent and lift the developer's consent requirement, and without cr the developer's requirement applies", async() => {
        const state = { body: { c: { cr: true } } };
        const server = await settingsServer(state);
        const required = makeTempDir("sbs-cr-on");
        seed(required, "cly_sbs", { cr: true });
        startSdk(server, required, { device_id: "cr-user" });
        Countly.add_event({ key: "without_consent" });
        Countly.add_consent("events");
        Countly.add_event({ key: "with_consent" });
        await Countly.flush(5);
        assert.deepStrictEqual(receivedEvents(dataRequests(server)).map((e) => e.key), ["with_consent"]);

        state.body = { c: { cr: false } };
        const lifted = makeTempDir("sbs-cr-off");
        seed(lifted, "cly_sbs", { cr: false });
        startSdk(server, lifted, { device_id: "cr-user-2", require_consent: true });
        Countly.add_event({ key: "recorded_without_consent" });
        await Countly.flush(5);

        state.body = { c: {} };
        const developers = makeTempDir("sbs-cr-developer");
        seed(developers, "cly_sbs", {});
        startSdk(server, developers, { device_id: "cr-user-3", require_consent: true });
        Countly.add_event({ key: "still_needs_consent" });
        await Countly.flush(5);
        await server.close();
        const keys = receivedEvents(dataRequests(server)).map((e) => e.key);
        assert.deepStrictEqual(keys, ["with_consent", "recorded_without_consent"]);
    });

    it("9- a setting the server stops sending goes back to the developer's value", async() => {
        const server = await settingsServer({ body: { c: {} } });
        const dir = makeTempDir("sbs-removed");
        seed(dir, "cly_sbs", { lkl: 5 });
        startSdk(server, dir, { device_id: "removed-user", max_key_length: 50 });
        assert.equal(Countly.maxKeyLength, 5, "the stored settings were not used at start");
        const replaced = await storedValue("cly_sbs", {});
        await server.close();
        assert.ok(replaced, "the empty answer did not replace the stored settings");
        assert.equal(Countly.maxKeyLength, 50);
    });

    it("10- a failed request or an unusable answer keeps the settings in use", async() => {
        const state = { status: 400, body: { result: "Invalid method" } };
        const server = await settingsServer(state);
        const dir = makeTempDir("sbs-keep");
        seed(dir, "cly_sbs", { lkl: 5 });
        startSdk(server, dir, { device_id: "keep-user" });
        const answers = [
            { status: 400, body: { result: "Invalid method" } },
            { status: 429, body: "Too Many Requests" },
            { status: 200, body: { result: "Request does not match checksum" } },
            { status: 200, body: "not json" },
            { status: 200, body: { c: [] } },
        ];
        for (let i = 0; i < answers.length; i++) {
            state.status = answers[i].status;
            state.body = answers[i].body;
            if (i > 0) {
                Countly.change_id(`keep-user-${i}`, false);
            }
            // eslint-disable-next-line no-await-in-loop
            await server.waitFor((reqs) => reqs.filter((r) => r.params.method === "sc").length > i, 5000);
            // eslint-disable-next-line no-await-in-loop
            await sleep(100);
            assert.equal(Countly.maxKeyLength, 5, `answer ${i} changed the settings`);
        }
        await server.close();
        assert.deepStrictEqual(CountlyStorage.storeGet("cly_sbs", null), { lkl: 5 });
    });

    it("11- settings stored by an earlier run are used at the next start before the first request", async() => {
        const firstServer = await settingsServer({ body: { c: { networking: false } } });
        const dir = makeTempDir("sbs-restart");
        startSdk(firstServer, dir, { device_id: "restart-user" });
        await storedValue("cly_sbs", { networking: false });
        await firstServer.close();
        Countly.halt(false);

        const secondServer = await settingsServer({ status: 500, body: "down" });
        startSdk(secondServer, dir, { device_id: "restart-user" });
        Countly.add_event({ key: "recorded_offline" });
        const flushed = await Countly.flush(5);
        await secondServer.waitFor((reqs) => reqs.some((r) => r.params.method === "sc"), 5000);
        await sleep(300);
        await secondServer.close();
        assert.strictEqual(flushed, false);
        assert.equal(dataRequests(secondServer).length, 0, "data was sent although the stored settings turned networking off");
    });

    it("12- settings provided at init are used until the server's settings have been fetched once", async() => {
        const server = await settingsServer({ status: 500, body: "down" });
        const dir = makeTempDir("sbs-provided");
        startSdk(server, dir, { device_id: "provided-user", behavior_settings: { c: { lkl: 6 } } });
        assert.equal(Countly.maxKeyLength, 6);
        await server.waitFor((reqs) => reqs.some((r) => r.params.method === "sc"), 5000);
        await server.close();
        assert.equal(fs.existsSync(path.join(dir, "__cly_sbs.json")), false, "provided settings must not be stored as the server's");
    });

    it("13- a device ID change without merge fetches the settings again with the new ID", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("sbs-id-change"), { device_id: "first-id" });
        await server.waitFor((reqs) => reqs.some((r) => r.params.hc), 5000);
        Countly.change_id("second-id", false);
        const refetched = await server.waitFor((reqs) => reqs.filter((r) => r.params.method === "sc").length === 2, 5000);
        await server.close();
        assert.ok(refetched, "the settings were not fetched again");
        assert.deepStrictEqual(settingsRequests(server).map((r) => r.params.device_id), ["first-id", "second-id"]);
    });

    it("14- a device ID change with merge fetches the settings after the merge request was delivered", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("sbs-merge"), { device_id: "merge-from" });
        await server.waitFor((reqs) => reqs.some((r) => r.params.hc), 5000);
        Countly.change_id("merge-to", true);
        await server.waitFor((reqs) => reqs.filter((r) => r.params.method === "sc").length === 2, 5000);
        await server.close();
        const mergeIndex = server.requests.findIndex((r) => r.params.old_device_id === "merge-from");
        const fetchIndex = server.requests.findIndex((r) => r.params.method === "sc" && r.params.device_id === "merge-to");
        assert.ok(mergeIndex !== -1, "the merge request was not sent");
        assert.ok(fetchIndex > mergeIndex, "the settings were fetched before the merge request was delivered");
    });

    it("15- a device ID change with merge fetches the settings right away when the merge request cannot be queued", async() => {
        const server = await settingsServer({ body: { c: { tracking: false } } });
        startSdk(server, makeTempDir("sbs-merge-off"), { device_id: "merge-off-from" });
        await storedValue("cly_sbs", { tracking: false });
        Countly.change_id("merge-off-to", true);
        const fetched = await server.waitFor((reqs) => reqs.some((r) => r.params.method === "sc" && r.params.device_id === "merge-off-to"), 5000);
        await server.close();
        assert.ok(fetched, "the settings were not fetched after the device ID change");
        assert.equal(server.requests.filter((r) => r.params.old_device_id).length, 0);
    });

    it("16- without consent only the settings fetch and the health check are sent", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("sbs-no-consent"), { device_id: "no-consent-user", require_consent: true });
        Countly.begin_session();
        Countly.add_event({ key: "no_consent_event" });
        const checked = await server.waitFor((reqs) => reqs.some((r) => r.params.hc), 5000);
        await sleep(300);
        await server.close();
        assert.ok(checked, "the health check was not sent");
        assert.equal(settingsRequests(server).length, 1);
        assert.equal(dataRequests(server).length, 0);
    });

    it("17- a device ID change without merge removes consent without telling the server", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("sbs-consent-reset"), { device_id: "consent-user", require_consent: true });
        Countly.add_consent("events");
        await server.waitFor((reqs) => reqs.some((r) => r.params.consent), 5000);
        Countly.change_id("consent-user-2", false);
        await sleep(1500);
        await server.close();
        assert.equal(server.requests.filter((r) => r.params.consent).length, 1);
        assert.equal(Countly.check_consent("events"), false);
    });

    it("18- consent changes are not sent while tracking is off", async() => {
        const server = await settingsServer({ body: { c: { tracking: false } } });
        const dir = makeTempDir("sbs-consent-tracking");
        seed(dir, "cly_sbs", { tracking: false });
        startSdk(server, dir, { device_id: "consent-off-user", require_consent: true });
        Countly.add_consent("events");
        await sleep(1500);
        await server.close();
        assert.equal(server.requests.filter((r) => r.params.consent).length, 0);
        assert.equal(Countly.check_consent("events"), true);
    });

    it("19- pauses sending for bom_d seconds after a slow answer", async() => {
        const server = await settingsServer({ body: { c: { bom_at: 1, bom_d: 2, bom_rqp: 1 } } }, (req, res, entry) => {
            const delay = entry.params.user_details && JSON.parse(entry.params.user_details).name === "slow" ? 1100 : 0;
            setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"result":"Success"}');
            }, delay);
        });
        const dir = makeTempDir("sbs-backoff");
        seed(dir, "cly_sbs", { bom_at: 1, bom_d: 2, bom_rqp: 1 });
        startSdk(server, dir, { device_id: "backoff-user", disable_health_check: true });
        Countly.user_details({ name: "slow" });
        Countly.user_details({ name: "next" });
        const delivered = await server.waitFor((reqs) => reqs.some((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "next"), 10000);
        await server.close();
        assert.ok(delivered, "the next request was not sent after the pause");
        const slow = server.requests.find((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "slow");
        const next = server.requests.find((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "next");
        assert.ok(next.receivedAt - slow.receivedAt >= 2900, `the next request came ${next.receivedAt - slow.receivedAt} ms after the slow one`);
        const counters = CountlyStorage.storeGet("cly_hc", null);
        assert.deepStrictEqual([counters.bom, counters.cbom], [1, 1]);
    });

    it("20- the developer's backoff opt-out wins over the server's backoff settings", async() => {
        const server = await settingsServer({ body: { c: { bom: true, bom_at: 1, bom_d: 2, bom_rqp: 1 } } }, (req, res, entry) => {
            const delay = entry.params.user_details && JSON.parse(entry.params.user_details).name === "slow" ? 1100 : 0;
            setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"result":"Success"}');
            }, delay);
        });
        const dir = makeTempDir("sbs-backoff-off");
        seed(dir, "cly_sbs", { bom: true, bom_at: 1, bom_d: 2, bom_rqp: 1 });
        startSdk(server, dir, { device_id: "backoff-off-user", disable_health_check: true, disable_backoff_mechanism: true });
        Countly.user_details({ name: "slow" });
        Countly.user_details({ name: "next" });
        await server.waitFor((reqs) => reqs.some((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "next"), 10000);
        await server.close();
        const slow = server.requests.find((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "slow");
        const next = server.requests.find((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "next");
        assert.ok(next.receivedAt - slow.receivedAt < 2000, `the next request waited ${next.receivedAt - slow.receivedAt} ms`);
    });

    it("21- drops queued requests recorded more than dort hours ago, also while flush waits for them", async() => {
        const server = await settingsServer({ body: { c: { dort: 1 } } }, (req, res, entry) => {
            const delay = entry.params.user_details && JSON.parse(entry.params.user_details).name === "slow" ? 2000 : 0;
            setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"result":"Success"}');
            }, delay);
        });
        const dir = makeTempDir("sbs-dort");
        const now = Date.now();
        seed(dir, "cly_sbs", { dort: 1 });
        seed(dir, "cly_queue", [
            { app_key: appKey, device_id: "dort-user", user_details: JSON.stringify({ name: "too old" }), timestamp: now - (2 * 3600000) },
            { app_key: appKey, device_id: "dort-user", user_details: JSON.stringify({ name: "slow" }), timestamp: now - 60000 },
            { app_key: appKey, device_id: "dort-user", user_details: JSON.stringify({ name: "turns old" }), timestamp: now - 3600000 + 1000 },
        ]);
        startSdk(server, dir, { device_id: "dort-user" });
        const started = Date.now();
        const delivered = await Countly.flush(10);
        const elapsed = Date.now() - started;
        await server.close();
        assert.strictEqual(delivered, false, "flush must report that a request it waited for was dropped");
        assert.ok(elapsed < 5000, `flush resolved after ${elapsed} ms instead of when the request was dropped`);
        assert.deepStrictEqual(dataRequests(server).filter((r) => r.params.user_details).map((r) => JSON.parse(r.params.user_details).name), ["slow"]);
        assert.ok(await storedOnDisk(dir, "cly_queue", []), "the dropped requests are still stored");
    });

    it("22- flush sends right away during a backoff pause", async() => {
        const backoff = { bom_at: 1, bom_d: 30, bom_rqp: 1 };
        const server = await settingsServer({ body: { c: backoff } }, (req, res, entry) => {
            const delay = entry.params.user_details && JSON.parse(entry.params.user_details).name === "slow" ? 1100 : 0;
            setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"result":"Success"}');
            }, delay);
        });
        const dir = makeTempDir("sbs-backoff-flush");
        seed(dir, "cly_sbs", backoff);
        startSdk(server, dir, { device_id: "backoff-flush-user", disable_health_check: true });
        Countly.user_details({ name: "slow" });
        await server.waitFor((reqs) => reqs.some((r) => r.params.user_details), 5000);
        await storedValue("cly_hc", { el: 0, wl: 0, sc: -1, em: "", bom: 1, cbom: 1 });
        Countly.user_details({ name: "urgent" });
        await sleep(500);
        const sentBeforeFlush = server.requests.some((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "urgent");
        const started = Date.now();
        const delivered = await Countly.flush(5);
        const elapsed = Date.now() - started;
        await server.close();
        assert.equal(sentBeforeFlush, false, "the request was sent during the pause");
        assert.strictEqual(delivered, true);
        assert.ok(elapsed < 2000, `flush waited ${elapsed} ms`);
    });

    it("23- the queue size from the server applies, dropping the oldest requests", async() => {
        const limits = { rqs: 2, networking: false };
        const server = await settingsServer({ body: { c: limits } });
        const dir = makeTempDir("sbs-queue-size");
        seed(dir, "cly_sbs", limits);
        startSdk(server, dir, { device_id: "queue-user", queue_size: 100 });
        ["A", "B", "C", "D"].forEach((name) => {
            Countly.user_details({ name: name });
        });
        await server.waitFor((reqs) => reqs.some((r) => r.params.method === "sc"), 5000);
        await server.close();
        const queued = CountlyStorage.storeGet("cly_queue", []).filter((r) => r.user_details).map((r) => JSON.parse(r.user_details).name);
        assert.deepStrictEqual(queued, ["B", "C", "D"]);
    });

    it("24- the session update interval from the server applies", async() => {
        const server = await settingsServer({ body: { c: { sui: 1 } } });
        const dir = makeTempDir("sbs-session-update");
        seed(dir, "cly_sbs", { sui: 1 });
        startSdk(server, dir, { device_id: "session-update-user", session_update: 60 });
        Countly.begin_session();
        const extended = await server.waitFor((reqs) => reqs.some((r) => r.params.session_duration && !r.params.end_session), 4000);
        await server.close();
        assert.ok(extended, "the session was not extended after one second");
    });

    it("25- breadcrumb and stack trace limits from the server apply to crashes", async() => {
        const limits = { lbc: 2, ltlpt: 2, ltl: 10 };
        const server = await settingsServer({ body: { c: limits } });
        const dir = makeTempDir("sbs-crash-limits");
        seed(dir, "cly_sbs", limits);
        startSdk(server, dir, { device_id: "crash-limit-user" });
        ["one", "two", "three", "four"].forEach((record) => {
            Countly.add_log(record);
        });
        Countly.log_error(new Error("limits"));
        await Countly.flush(5);
        await server.close();
        const crash = JSON.parse(dataRequests(server).find((r) => r.params.crash).params.crash);
        assert.equal(crash._logs, "two\nthree\nfour");
        const lines = crash._error.split("\n");
        assert.equal(lines.length, 2, crash._error);
        assert.equal(lines[0], "Error: lim");
        assert.ok(lines.every((line) => line.length <= 10), crash._error);
    });

    it("26- a device ID change with merge keeps consent", async() => {
        const server = await settingsServer({ body: { c: {} } });
        startSdk(server, makeTempDir("sbs-merge-consent"), { device_id: "merge-consent-user", require_consent: true });
        Countly.add_consent("events");
        Countly.change_id("merge-consent-user-2", true);
        Countly.add_event({ key: "after_merge" });
        await Countly.flush(5);
        await server.waitFor((reqs) => reqs.some((r) => r.params.consent), 5000);
        await server.close();
        assert.equal(Countly.check_consent("events"), true);
        assert.deepStrictEqual(receivedEvents(dataRequests(server)).map((e) => [e.key, e.device_id]), [["after_merge", "merge-consent-user-2"]]);
        assert.equal(server.requests.filter((r) => r.params.consent).length, 1);
    });
});
