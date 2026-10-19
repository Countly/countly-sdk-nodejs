/**
 * Compatibility check for the oldest supported Node.js versions, which the mocha test suite cannot run on.
 * It needs no installed packages: run it with "node test/compat/compat_check.js". It records data the way an app
 * does against a local mock server, prints one result line and exits with code 1 when a check fails.
 * Keep this file in syntax that Node.js 10 understands.
 */
/* global BigInt */
var http = require("http");
var fs = require("fs");
var os = require("os");
var path = require("path");
var querystring = require("querystring");
var Countly = require("../../lib/countly");
var CountlyBulk = require("../../lib/countly-bulk");

var workDir = fs.mkdtempSync(path.join(os.tmpdir(), "countly-compat-"));
var results = { node: process.version, passed: [], failed: [] };

/**
 * Records the outcome of one check
 * @param {String} name - what was checked
 * @param {Boolean} condition - true if the check passed
 * @param {String=} detail - extra information shown when the check failed
 */
function check(name, condition, detail) {
    if (condition) {
        results.passed.push(name);
    }
    else {
        results.failed.push(detail ? `${name} (${detail})` : name);
    }
}

/**
 * Waits for the given time
 * @param {Number} ms - milliseconds to wait
 * @returns {Promise} resolves after the time passed
 */
function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Creates a new folder inside the work folder
 * @param {String} name - name of the folder
 * @returns {String} path of the folder
 */
function newFolder(name) {
    var folder = path.join(workDir, name);
    fs.mkdirSync(folder);
    return folder;
}

/**
 * Deletes a folder with everything in it, in a way that works on Node.js 10
 * @param {String} folder - folder to delete
 */
function removeFolder(folder) {
    if (!fs.existsSync(folder)) {
        return;
    }
    fs.readdirSync(folder).forEach((name) => {
        var item = path.join(folder, name);
        if (fs.lstatSync(item).isDirectory()) {
            removeFolder(item);
        }
        else {
            fs.unlinkSync(item);
        }
    });
    fs.rmdirSync(folder);
}

/**
 * Starts a mock Countly server that records every request. Settings requests are answered with the given
 * settings, every other request with Success.
 * @param {Boolean} ignoreFirst - true to leave the first data request (not a settings request or health check) unanswered
 * @param {Object=} settings - the "c" object of the settings answer, none by default
 * @returns {Promise<Object>} server url, received requests and a close function
 */
function startServer(ignoreFirst, settings) {
    return new Promise((resolve) => {
        var requests = [];
        var ignored = false;
        var sockets = [];
        var server = http.createServer((req, res) => {
            var body = "";
            req.on("data", (chunk) => {
                body += chunk;
            });
            req.on("end", () => {
                var params = querystring.parse(req.url.split("?")[1] || "");
                var fromBody = querystring.parse(body);
                Object.keys(fromBody).forEach((key) => {
                    params[key] = fromBody[key];
                });
                var request = { path: req.url.split("?")[0], params: params };
                requests.push(request);
                res.writeHead(200, { "Content-Type": "application/json" });
                if (request.path === "/o/sdk" && params.method === "sc") {
                    res.end(JSON.stringify({ v: 2, t: 1, c: settings || {} }));
                    return;
                }
                if (ignoreFirst && !ignored && typeof params.hc === "undefined") {
                    ignored = true;
                    return;
                }
                res.end("{\"result\":\"Success\"}");
            });
        });
        server.on("connection", (socket) => {
            sockets.push(socket);
        });
        server.listen(0, "127.0.0.1", () => {
            resolve({
                url: `http://127.0.0.1:${server.address().port}`,
                requests: requests,
                close: function() {
                    sockets.forEach((socket) => {
                        socket.destroy();
                    });
                    return new Promise((done) => {
                        server.close(done);
                    });
                },
            });
        });
    });
}

/**
 * Lists the events of the received requests, including events inside bulk requests
 * @param {Array} requests - requests received by the mock server
 * @returns {Array} events, each with the device ID it was sent with
 */
function receivedEvents(requests) {
    var events = [];
    var collect = (list, deviceId) => {
        var parsed = typeof list === "string" ? JSON.parse(list) : list;
        parsed.forEach((event) => {
            event.device_id = deviceId;
            events.push(event);
        });
    };
    requests.forEach((request) => {
        if (request.params.events) {
            collect(request.params.events, request.params.device_id);
        }
        if (request.params.requests) {
            JSON.parse(request.params.requests).forEach((inner) => {
                if (inner.events) {
                    collect(inner.events, inner.device_id);
                }
            });
        }
    });
    return events;
}

/**
 * Records sessions, events, a view, user details, a crash and a user switch, then checks what reached the server
 * and what was stored on disk
 */
async function checkTracking() {
    var mock = await startServer(false);
    var storage = newFolder("tracking");
    Countly.init({ app_key: "compat-key", url: mock.url, device_id: "compat-user", storage_path: storage, interval: 100, fail_timeout: 1, request_timeout: 3 });
    Countly.begin_session();
    var segmentation = { plan: "pro" };
    if (typeof BigInt === "function") {
        segmentation.order_id = BigInt("9007199254740993");
    }
    Countly.add_event({ key: "compat_event", count: 1, sum: 2.5, segmentation: segmentation });
    Countly.add_event({ key: "compat_half_emoji", segmentation: { name: "Ali😀".substring(0, 4) } });
    Countly.track_view("Compat Home");
    Countly.user_details({ name: "Compat User", custom: { tier: "gold" } });
    Countly.userData.set("plan", "basic");
    Countly.userData.save();
    Countly.log_error(new Error("compat error"));
    Countly.change_id("compat-user-2", false);
    Countly.add_event({ key: "compat_after_switch" });
    Countly.end_session();
    var delivered = await Countly.flush(20);
    var events = receivedEvents(mock.requests);
    var event = events.filter((e) => e.key === "compat_event")[0];
    check("flush reports delivery", delivered === true);
    check("session sent", mock.requests.some((r) => r.params.begin_session === "1" && r.params.device_id === "compat-user"));
    check("event sent", !!event && event.segmentation.plan === "pro");
    if (typeof BigInt === "function") {
        check("BigInt sent as exact text", !!event && event.segmentation.order_id === "9007199254740993");
    }
    check("event with half an emoji sent", events.some((e) => e.key === "compat_half_emoji"));
    check("view sent", events.some((e) => e.key === "[CLY]_view" && e.segmentation.name === "Compat Home"));
    check("user details sent", mock.requests.some((r) => r.params.user_details && JSON.parse(r.params.user_details).name === "Compat User"));
    check("crash sent", mock.requests.some((r) => r.params.crash && JSON.parse(r.params.crash)._error.indexOf("compat error") !== -1));
    check("new user's event sent with the new device ID", events.some((e) => e.key === "compat_after_switch" && e.device_id === "compat-user-2"));
    var idFile = path.join(storage, "__cly_id.json");
    check("device ID stored on disk", fs.existsSync(idFile) && fs.readFileSync(idFile, "utf8").indexOf("compat-user-2") !== -1);
    Countly.halt();
    await mock.close();
}

/**
 * Leaves the first request unanswered and checks that it is given up after request_timeout and sent again
 */
async function checkUnansweredRequest() {
    var mock = await startServer(true);
    Countly.init({ app_key: "compat-key", url: mock.url, device_id: "compat-timeout", storage_path: newFolder("timeout"), interval: 100, fail_timeout: 1, request_timeout: 1 });
    Countly.add_event({ key: "compat_after_hang" });
    var started = Date.now();
    var first = await Countly.flush(20);
    check("unanswered request given up after request_timeout", first === false && Date.now() - started < 5000, `flush ${first} after ${Date.now() - started} ms`);
    await wait(1500);
    var second = await Countly.flush(20);
    var copies = receivedEvents(mock.requests).filter((e) => e.key === "compat_after_hang").length;
    check("data sent again after an unanswered request", second === true && copies >= 2, `flush ${second}, ${copies} copies`);
    Countly.halt();
    await mock.close();
}

/**
 * Sends a bulk user's session, event and details with file storage in the default folder of the working directory
 */
async function checkBulk() {
    var previousDir = process.cwd();
    var appDir = newFolder("bulk-app");
    process.chdir(appDir);
    var mock = await startServer(false);
    var server = new CountlyBulk({ app_key: "compat-bulk", url: mock.url, interval: 100, request_timeout: 3, storage_type: CountlyBulk.StorageTypes.FILE });
    var user = server.add_user({ device_id: "compat-bulk-user" });
    user.begin_session({ _os: "Linux" }, 60, Math.floor(Date.now() / 1000) - 120);
    user.add_event({ key: "compat_bulk_event", count: 1 });
    user.user_details({ name: "Bulk Compat" });
    await new Promise((resolve) => {
        var timer = setTimeout(resolve, 15000);
        server.start(() => {
            clearTimeout(timer);
            resolve();
        });
    });
    server.stop();
    check("bulk event sent", receivedEvents(mock.requests).some((e) => e.key === "compat_bulk_event" && e.device_id === "compat-bulk-user"));
    check("bulk default storage folder created", fs.existsSync(path.join(appDir, ".countly-storage", "bulk", "compat-bulk")));
    await mock.close();
    process.chdir(previousDir);
}

/**
 * Waits until a condition is true, or until the time is up
 * @param {Function} condition - returns true when the wait is over
 * @param {Number} timeoutMs - longest time to wait
 * @returns {Promise<Boolean>} true if the condition became true
 */
async function waitFor(condition, timeoutMs) {
    var started = Date.now();
    while (!condition()) {
        if (Date.now() - started > timeoutMs) {
            return false;
        }
        // eslint-disable-next-line no-await-in-loop
        await wait(50);
    }
    return true;
}

/**
 * Fetches the SDK behavior settings, checks that they are applied and stored, that one health check is sent,
 * and that a device ID change fetches the settings again
 */
async function checkBehaviorSettings() {
    var mock = await startServer(false, { lkl: 9, eqs: 1 });
    var storage = newFolder("settings");
    Countly.init({ app_key: "compat-key", url: mock.url, device_id: "compat-settings", app_version: "4.2", storage_path: storage, interval: 100, request_timeout: 3 });
    var settingsRequests = () => mock.requests.filter((r) => r.path === "/o/sdk" && r.params.method === "sc");
    var healthChecks = () => mock.requests.filter((r) => typeof r.params.hc !== "undefined");
    check("settings fetched and applied", await waitFor(() => Countly.maxKeyLength === 9, 5000), `key length ${Countly.maxKeyLength}`);
    check("health check sent", await waitFor(() => healthChecks().length === 1, 5000));
    var sbsFile = path.join(storage, "__cly_sbs.json");
    check("settings stored on disk", await waitFor(() => fs.existsSync(sbsFile) && fs.readFileSync(sbsFile, "utf8").indexOf("\"lkl\":9") !== -1, 5000));
    var health = healthChecks().length ? JSON.parse(healthChecks()[0].params.hc) : {};
    check("health check counters sent", ["el", "wl", "sc", "em", "bom", "cbom"].every((key) => typeof health[key] !== "undefined"), JSON.stringify(health));
    check("health check app version sent", healthChecks().length > 0 && JSON.parse(healthChecks()[0].params.metrics)._app_version === "4.2");
    Countly.change_id("compat-settings-2", false);
    check("settings fetched again after a device ID change", await waitFor(() => settingsRequests().some((r) => r.params.device_id === "compat-settings-2"), 5000));
    Countly.add_event({ key: "compat_limited_key_event" });
    await Countly.flush(10);
    check("server limits applied to new data", receivedEvents(mock.requests).some((e) => e.key === "compat_li"));
    check("one health check per start", healthChecks().length === 1, `${healthChecks().length} health checks`);
    Countly.halt();
    await mock.close();
}

/**
 * Runs one group of checks and records it as failed if it throws
 * @param {String} name - name of the group
 * @param {Function} run - async function with the checks
 */
async function runGroup(name, run) {
    try {
        await run();
    }
    catch (ex) {
        results.failed.push(`${name} threw: ${ex && ex.stack ? ex.stack.split("\n").slice(0, 2).join(" ") : ex}`);
    }
}

(async() => {
    await runGroup("tracking", checkTracking);
    await runGroup("unanswered request", checkUnansweredRequest);
    await runGroup("bulk", checkBulk);
    await runGroup("behavior settings", checkBehaviorSettings);
    try {
        removeFolder(workDir);
    }
    catch (ex) {
        results.cleanup = `could not remove ${workDir}: ${ex.message}`;
    }
    process.stdout.write(`${JSON.stringify(results)}\n`);
    process.exitCode = results.failed.length === 0 ? 0 : 1;
})();
