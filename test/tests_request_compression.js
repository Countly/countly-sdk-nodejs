const assert = require("assert");
const crypto = require("crypto");
const zlib = require("zlib");
const Countly = require("../lib/countly");
const CountlyStorage = require("../lib/countly-storage");
const behavior = require("../lib/countly-behavior");
const hp = require("./helpers/helper_functions");
const { startMockServer } = require("./helpers/mock_server");
const { makeTempDir, removeTempDirs } = require("./helpers/run_script");
const { appKey, settingsServer, settingsRequests, startSdk, storedValue, waitUntil } = require("./helpers/behavior_settings");

const DEVICE_ID = "gzip-user";
const MARKER_QUERY = "?content_encoding=gzip";

/**
 * Reads a recorded request the way the server does: the parameters of the URL and of the form body, the body
 * decompressed when the URL carries the compression marker as its only query
 * @param {Object} entry - request recorded by the mock server
 * @returns {Object} compressed, params, body (the form body as text), bodyBytes (its size on the wire) and headers
 */
function read(entry) {
    const url = new URL(entry.url, "http://localhost");
    const compressed = url.search === MARKER_QUERY;
    const params = Object.fromEntries(url.searchParams);
    delete params.content_encoding;
    let body = "";
    if (entry.method === "POST") {
        body = (compressed ? zlib.gunzipSync(entry.body) : entry.body).toString("utf8");
        Object.assign(params, Object.fromEntries(new URLSearchParams(body)));
    }
    return { compressed: compressed, params: params, body: body, bodyBytes: entry.body.length, headers: entry.headers };
}

/**
 * The requests with the given marker parameter the server received, read with read()
 * @param {Object} server - mock server
 * @param {String} marker - value of the marker parameter
 * @returns {Array} the requests
 */
function withMarker(server, marker) {
    return server.requests.map(read).filter((r) => r.params.marker === marker);
}

/**
 * Queues a raw request with a payload of the given length, told apart by its marker parameter
 * @param {String} marker - value of the marker parameter
 * @param {Number} payloadLength - length of the payload parameter
 */
function queueRequest(marker, payloadLength) {
    Countly.request({ app_key: appKey, device_id: DEVICE_ID, marker: marker, payload: "a".repeat(payloadLength) });
}

/**
 * A settings answer, with "gzip": true when the server reads compressed bodies. Each answer carries its own "lkl"
 * value, so the test can wait until the SDK has read it.
 * @param {Number} lkl - key length limit that tells the answer apart
 * @param {Boolean} gzip - whether the answer says the server reads compressed bodies
 * @returns {Object} the answer
 */
function settingsAnswer(lkl, gzip) {
    const answer = { v: 2, t: 1, c: { lkl: lkl } };
    if (gzip) {
        answer.gzip = true;
    }
    return answer;
}

/**
 * Starts a mock server that answers settings requests with state.body, refuses the next state.refuse compressed
 * requests with 400, drops the connection of the next state.drop compressed requests, answers remote config
 * downloads with state.remoteConfig, and every other request with Success
 * @param {Object} state - the answers
 * @returns {Promise<Object>} the mock server
 */
function compressionServer(state) {
    return settingsServer(state, (req, res, entry) => {
        const request = read(entry);
        if (request.compressed && state.refuse > 0) {
            state.refuse--;
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end('{"result":"Invalid request body"}');
            return;
        }
        if (request.compressed && state.drop > 0) {
            state.drop--;
            req.socket.destroy();
            return;
        }
        if (request.params.method === "fetch_remote_config") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(state.remoteConfig);
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"result":"Success"}');
    });
}

/**
 * Starts the SDK against the server and waits until it has read the first settings answer
 * @param {Object} server - mock server
 * @param {Object} state - its answers; state.body must carry "lkl"
 * @param {Object} config - init options
 */
async function startAndReadSettings(server, state, config) {
    startSdk(server, makeTempDir("gzip"), { device_id: DEVICE_ID, disable_health_check: true, ...config });
    assert.ok(await storedValue("cly_sbs", state.body.c), "the settings answer was not read");
}

/**
 * Makes the SDK fetch the settings again, by a device ID change without merge, and waits until it has read the answer
 * @param {Object} state - the server's answers
 * @param {Object} answer - the next settings answer
 * @param {String} deviceId - the new device ID
 */
async function fetchSettingsAgain(state, answer, deviceId) {
    state.body = answer;
    Countly.change_id(deviceId, false);
    assert.ok(await storedValue("cly_sbs", answer.c), "the new settings answer was not read");
}

describe("Request compression tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    afterEach(() => {
        Countly.halt(true);
    });
    after(() => {
        removeTempDirs();
    });

    it("1- without enable_request_compression does not ask for gzip and sends plain bodies", async() => {
        const state = { body: settingsAnswer(101, true) };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, {});
        queueRequest("big", 5000);
        const delivered = await Countly.flush(5);
        await server.close();
        assert.strictEqual(delivered, true);
        assert.strictEqual(settingsRequests(server)[0].params.gzip, undefined);
        const sent = withMarker(server, "big");
        assert.equal(sent.length, 1);
        assert.strictEqual(sent[0].compressed, false);
        assert.equal(sent[0].params.payload.length, 5000);
    });

    it("2- sends a body of at least 1 KB gzip-compressed to the marked URL once the server says it reads gzip, with the checksum of the plain body", async() => {
        const state = { body: settingsAnswer(101, true) };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true, salt: "gzip-salt" });
        queueRequest("big", 5000);
        const delivered = await Countly.flush(5);
        await server.close();
        assert.strictEqual(delivered, true);
        assert.strictEqual(settingsRequests(server)[0].params.gzip, "1");
        const sent = withMarker(server, "big");
        assert.equal(sent.length, 1);
        assert.strictEqual(sent[0].compressed, true);
        assert.ok(sent[0].bodyBytes < 1000, `the compressed body has ${sent[0].bodyBytes} bytes`);
        assert.equal(sent[0].headers["content-type"], "application/x-www-form-urlencoded");
        assert.strictEqual(sent[0].headers["content-encoding"], undefined);
        assert.equal(sent[0].params.payload, "a".repeat(5000));
        const [signed, checksum] = sent[0].body.split("&checksum256=");
        assert.equal(crypto.createHash("sha256").update(`${signed}gzip-salt`).digest("hex"), checksum);
        assert.deepStrictEqual(CountlyStorage.storeGet("cly_sbs", null), { lkl: 101 }, "the gzip key was stored with the settings");
    });

    it("3- keeps a body under 1 KB plain and compresses a bigger one after it", async() => {
        const state = { body: settingsAnswer(101, true) };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true, force_post: true });
        queueRequest("small", 300);
        queueRequest("big", 5000);
        const delivered = await Countly.flush(5);
        await server.close();
        assert.strictEqual(delivered, true);
        const small = withMarker(server, "small");
        assert.equal(small.length, 1);
        assert.strictEqual(small[0].compressed, false);
        assert.ok(small[0].bodyBytes < 1024 && small[0].body.length > 0, "the small request was not sent as a POST body");
        assert.strictEqual(withMarker(server, "big")[0].compressed, true);
    });

    it("4- sends plain bodies when the settings answer has no gzip key", async() => {
        const state = { body: settingsAnswer(101, false) };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true });
        queueRequest("big", 5000);
        const delivered = await Countly.flush(5);
        await server.close();
        assert.strictEqual(delivered, true);
        assert.strictEqual(settingsRequests(server)[0].params.gzip, "1");
        assert.strictEqual(withMarker(server, "big")[0].compressed, false);
    });

    it("5- keeps a body over 1 MB plain and keeps compressing the requests after it", async() => {
        const state = { body: settingsAnswer(101, true) };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true });
        queueRequest("huge", 1048576);
        queueRequest("big", 5000);
        const delivered = await Countly.flush(10);
        await server.close();
        assert.strictEqual(delivered, true);
        const huge = withMarker(server, "huge");
        assert.equal(huge.length, 1);
        assert.strictEqual(huge[0].compressed, false);
        assert.ok(huge[0].bodyBytes > 1048576);
        assert.strictEqual(withMarker(server, "big")[0].compressed, true);
    });

    it("6- sends a refused compressed request again plain, and the requests after it plain", async() => {
        const state = { body: settingsAnswer(101, true), refuse: 1 };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true });
        queueRequest("refused", 5000);
        const first = await Countly.flush(5);
        const second = await Countly.flush(5);
        queueRequest("after", 5000);
        const third = await Countly.flush(5);
        await server.close();
        assert.deepStrictEqual([first, second, third], [false, true, true]);
        const refused = withMarker(server, "refused");
        assert.deepStrictEqual(refused.map((r) => r.compressed), [true, false]);
        assert.deepStrictEqual(refused[0].params, refused[1].params);
        assert.deepStrictEqual(withMarker(server, "after").map((r) => r.compressed), [false]);
    });

    it("7- compresses again once a later settings answer says gzip, after a refusal stopped compression", async() => {
        const state = { body: settingsAnswer(101, true), refuse: 1 };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true });
        queueRequest("refused", 5000);
        await Countly.flush(5);
        await Countly.flush(5);

        await fetchSettingsAgain(state, settingsAnswer(102, false), "gzip-user-2");
        queueRequest("without_gzip_answer", 5000);
        await Countly.flush(5);

        await fetchSettingsAgain(state, settingsAnswer(103, true), "gzip-user-3");
        queueRequest("with_gzip_answer", 5000);
        const delivered = await Countly.flush(5);
        await server.close();
        assert.strictEqual(delivered, true);
        assert.deepStrictEqual(settingsRequests(server).map((r) => r.params.gzip), ["1", "1", "1"]);
        assert.deepStrictEqual(withMarker(server, "refused").map((r) => r.compressed), [true, false]);
        assert.deepStrictEqual(withMarker(server, "without_gzip_answer").map((r) => r.compressed), [false]);
        assert.deepStrictEqual(withMarker(server, "with_gzip_answer").map((r) => r.compressed), [true]);
    });

    [["JSON", '{"flag":"on"}', true], ["a page", "<html><body>Bad gateway</body></html>", false], ["nothing", "", false]].forEach(([kind, answer, staysOn], index) => {
        it(`${8 + index}- ${staysOn ? "keeps" : "stops"} compression when a compressed remote config download is answered with ${kind}`, async() => {
            const state = { body: settingsAnswer(101, true), remoteConfig: answer };
            const server = await compressionServer(state);
            await startAndReadSettings(server, state, { enable_request_compression: true, force_post: true });
            const keys = Array.from({ length: 120 }, (_, i) => `remote_config_key_${i}`);
            await new Promise((resolve) => {
                Countly.fetch_remote_config(keys, resolve);
            });
            queueRequest("after_download", 5000);
            const delivered = await Countly.flush(5);
            await server.close();
            assert.strictEqual(delivered, true);
            const download = server.requests.map(read).filter((r) => r.params.method === "fetch_remote_config");
            assert.equal(download.length, 1);
            assert.strictEqual(download[0].compressed, true);
            assert.equal(JSON.parse(download[0].params.keys).length, 120);
            assert.deepStrictEqual(withMarker(server, "after_download").map((r) => r.compressed), [staysOn]);
        });
    });

    it("11- keeps compressing after a compressed request failed without an answer", async() => {
        const state = { body: settingsAnswer(101, true), drop: 1 };
        const server = await compressionServer(state);
        await startAndReadSettings(server, state, { enable_request_compression: true });
        queueRequest("dropped", 5000);
        const first = await Countly.flush(5);
        const second = await Countly.flush(5);
        await server.close();
        assert.deepStrictEqual([first, second], [false, true]);
        assert.deepStrictEqual(withMarker(server, "dropped").map((r) => r.compressed), [true, true]);
    });

    it("12- sends plain bodies after change_server_url until the new server says it reads gzip", async() => {
        const state = { body: settingsAnswer(101, true) };
        const first = await compressionServer(state);
        const held = [];
        const second = await startMockServer((req, res, entry) => {
            if (entry.params.method === "sc") {
                held.push(res);
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"result":"Success"}');
        });
        await startAndReadSettings(first, state, { enable_request_compression: true });
        Countly.change_server_url(second.url);
        assert.ok(await waitUntil(() => held.length === 1, 5000), "the new server was not asked for its settings");
        queueRequest("new_server", 5000);
        const delivered = await Countly.flush(5);
        held[0].writeHead(200, { "Content-Type": "application/json" });
        held[0].end(JSON.stringify(settingsAnswer(102, true)));
        assert.ok(await storedValue("cly_sbs", { lkl: 102 }), "the new server's settings answer was not read");
        queueRequest("after_new_answer", 5000);
        const deliveredAfter = await Countly.flush(5);
        await first.close();
        await second.close();
        assert.deepStrictEqual([delivered, deliveredAfter], [true, true]);
        assert.equal(withMarker(first, "new_server").length, 0);
        assert.deepStrictEqual(withMarker(second, "new_server").map((r) => r.compressed), [false]);
        assert.deepStrictEqual(withMarker(second, "after_new_answer").map((r) => r.compressed), [true]);
    });

    it("13- reads the gzip key of a settings answer only when it is true", () => {
        assert.strictEqual(behavior.readsCompressedBodies(JSON.stringify({ v: 2, t: 1, c: {}, gzip: true })), true);
        [JSON.stringify({ c: {}, gzip: "true" }), JSON.stringify({ c: {}, gzip: 1 }), JSON.stringify({ c: {}, gzip: false }), JSON.stringify({ c: { gzip: true } }), JSON.stringify([{ gzip: true }]), "null", "", "not json"].forEach((answer) => {
            assert.strictEqual(behavior.readsCompressedBodies(answer), false, answer);
        });
    });
});
