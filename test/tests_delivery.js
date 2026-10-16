const assert = require("assert");
const crypto = require("crypto");
const path = require("path");
const Countly = require("../lib/countly");
const hp = require("./helpers/helper_functions");
const { startMockServer, receivedEvents } = require("./helpers/mock_server");
const { runScript, makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");

const appKey = "YOUR_APP_KEY";

function answerSuccess(res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"result":"Success"}');
}

// the checksum check of 26.01 servers: the query is rebuilt with the WHATWG URL parser before hashing
function passesServerChecksum(entry, salt) {
    const parsed = new URL(entry.url, "http://localhost");
    const checksum = parsed.searchParams.get("checksum256");
    let payload = (parsed.pathname + parsed.search).substring(parsed.pathname.length + 1);
    payload = payload.replace(`&checksum256=${checksum}`, "").replace(`checksum256=${checksum}`, "");
    const expected = crypto.createHash("sha256").update(payload + salt).digest("hex").toUpperCase();
    return expected === String(checksum).toUpperCase();
}

function initSending(config) {
    Countly.halt(false);
    Countly.init({ app_key: appKey, storage_path: `${makeTempDir("delivery")}${path.sep}`, ...config });
}

describe("Delivery tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- retries a request that gets no answer after request_timeout, and later data still arrives", async() => {
        const server = await startMockServer((req, res, entry, count) => {
            if (count > 1) {
                answerSuccess(res);
            }
        });
        initSending({ url: server.url, device_id: "timeout-user", interval: 100, fail_timeout: 1, request_timeout: 1 });
        Countly.user_details({ name: "first" });
        Countly.user_details({ name: "second" });
        const delivered = await server.waitFor((reqs) => reqs.some((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "second"), 10000);
        await server.close();
        assert.ok(delivered, "the queue stopped after the unanswered request");
        const firstAttempts = server.requests.filter((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "first");
        assert.equal(firstAttempts.length, 2);
    });

    it("2- treats a response that is cut off midway as failed and sends the request again", async() => {
        const server = await startMockServer((req, res, entry, count) => {
            if (count === 1) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write('{"res');
                setTimeout(() => req.socket.destroy(), 50);
                return;
            }
            answerSuccess(res);
        });
        initSending({ url: server.url, device_id: "cutoff-user", interval: 100, fail_timeout: 1 });
        Countly.user_details({ name: "cut" });
        const resent = await server.waitFor((reqs) => reqs.length >= 2, 10000);
        await server.close();
        assert.ok(resent, "the queue stopped after the cut-off response");
        assert.equal(JSON.parse(server.requests[1].params.user_details).name, "cut");
    });

    it("3- lets http_options add a header to every request, including GET requests", async() => {
        const server = await startMockServer();
        initSending({
            url: server.url,
            device_id: "header-user",
            interval: 100,
            http_options: (options) => {
                options.headers["x-api-gateway"] = "gw-1";
            },
        });
        Countly.user_details({ name: "header-check" });
        const delivered = await server.waitFor((reqs) => reqs.some((r) => r.params.user_details), 5000);
        await server.close();
        assert.ok(delivered, "no request reached the server");
        const request = server.requests.find((r) => r.params.user_details);
        assert.equal(request.method, "GET");
        assert.equal(request.headers["x-api-gateway"], "gw-1");
    });

    it("4- signs requests containing apostrophes so 26.01 servers accept the checksum", async() => {
        const salt = "e2e-salt";
        const server = await startMockServer();
        initSending({ url: server.url, device_id: "salt-user", interval: 100, salt: salt });
        Countly.add_event({ key: "profile_saved", segmentation: { owner: "O'Neil", note: "it's (fine)!*" } });
        const delivered = await server.waitFor((reqs) => reqs.some((r) => r.params.events), 5000);
        await server.close();
        assert.ok(delivered, "the event was not sent");
        const request = server.requests.find((r) => r.params.events);
        assert.equal(request.method, "GET");
        assert.ok(passesServerChecksum(request, salt), "the checksum does not match the server's check");
        const event = JSON.parse(request.params.events)[0];
        assert.equal(event.segmentation.owner, "O'Neil");
        assert.equal(event.segmentation.note, "it's (fine)!*");
    });

    it("5- flush sends every queued request one after another, without waiting for heartbeats", async() => {
        const server = await startMockServer();
        initSending({ url: server.url, device_id: "flush-user", interval: 10000 });
        for (let i = 0; i < 5; i++) {
            Countly.user_details({ name: `user ${i}` });
        }
        Countly.add_event({ key: "flush_event" });
        const started = Date.now();
        const result = await Countly.flush();
        const elapsed = Date.now() - started;
        await server.close();
        assert.strictEqual(result, true);
        assert.ok(elapsed < 5000, `flush took ${elapsed} ms`);
        assert.equal(server.requests.filter((r) => r.params.user_details).length, 5);
        assert.deepStrictEqual(receivedEvents(server.requests).map((e) => e.key), ["flush_event"]);
        assert.equal(hp.readRequestQueue().length, 0);
    });

    it("6- flush resolves false when the server cannot be reached, and the data stays queued", async() => {
        initSending({ url: "http://127.0.0.1:1", device_id: "offline-user", interval: 10000 });
        Countly.user_details({ name: "kept" });
        const result = await Countly.flush();
        assert.strictEqual(result, false);
        const queue = hp.readRequestQueue();
        assert.equal(queue.length, 1);
        assert.equal(JSON.parse(queue[0].user_details).name, "kept");
    });

    it("7- a script that records data exits by itself after the data is delivered", async() => {
        const server = await startMockServer();
        const dir = makeTempDir("script");
        const run = await runScript("script_exits.js", { COUNTLY_URL: server.url, STORAGE_DIR: dir }, 20000);
        await server.close();
        assert.equal(run.timedOut, false, "the script did not exit by itself");
        assert.equal(run.code, 0);
        assert.deepStrictEqual(receivedEvents(server.requests).map((e) => e.key), ["backup_finished"]);
    });

    it("8- a script exits even when the server cannot be reached, and the next run delivers the stored data", async() => {
        const dir = makeTempDir("script-offline");
        const offline = await runScript("script_exits.js", { COUNTLY_URL: "http://127.0.0.1:1", STORAGE_DIR: dir }, 20000);
        assert.equal(offline.timedOut, false, "the script did not exit while the server was unreachable");
        const stored = readStoredFile(path.join(dir, "__cly_queue.json"), "cly_queue");
        assert.ok(Array.isArray(stored) && stored.length === 1, "the undelivered event was not kept on disk");

        const server = await startMockServer();
        const online = await runScript("script_exits.js", { COUNTLY_URL: server.url, STORAGE_DIR: dir, EVENT_KEY: "second_run" }, 20000);
        await server.close();
        assert.equal(online.timedOut, false);
        const events = receivedEvents(server.requests);
        assert.deepStrictEqual(events.map((e) => e.key), ["backup_finished", "second_run"]);
        assert.ok(events.every((e) => e.device_id === "script-user"));
    });

    it("9- flush resolves false when one of its requests is dropped because the queue is full", async() => {
        const server = await startMockServer((req, res) => {
            setTimeout(() => answerSuccess(res), 300);
        });
        initSending({ url: server.url, device_id: "overflow-user", interval: 10000, queue_size: 1 });
        Countly.user_details({ name: "A" });
        Countly.user_details({ name: "B" });
        const flushed = Countly.flush();
        Countly.user_details({ name: "C" });
        Countly.user_details({ name: "D" });
        const result = await flushed;
        await server.close();
        assert.strictEqual(result, false);
        const names = server.requests.filter((r) => r.params.user_details).map((r) => JSON.parse(r.params.user_details).name);
        assert.equal(names.indexOf("B"), -1);
    });

    it("10- an error thrown in the flush callback surfaces like in any other callback, not as an unhandled rejection", async() => {
        const run = await runScript("flush_callback_throws.js", { STORAGE_DIR: makeTempDir("flush-callback") }, 20000);
        assert.ok(run.stdout.indexOf("uncaught exception: thrown in flush callback") !== -1, run.stdout + run.stderr);
    });
});
