const fs = require("fs");
const path = require("path");
const Countly = require("../../lib/countly");
const CountlyStorage = require("../../lib/countly-storage");
const { startMockServer } = require("./mock_server");

const appKey = "YOUR_APP_KEY";

/**
 * Starts a mock server that answers settings requests with state.body (and state.status), health checks with
 * state.hcStatus (Success by default), and every other request with Success unless "other" answers it. Each
 * recorded request gets the time it arrived as receivedAt.
 * @param {Object} state - the answers: body (object or text), optional status and hcStatus
 * @param {Function=} other - (req, res, entry, count) answers the other requests
 * @returns {Promise<Object>} the mock server
 */
function settingsServer(state, other) {
    return startMockServer((req, res, entry, count) => {
        entry.receivedAt = Date.now();
        if (entry.path === "/o/sdk" && entry.params.method === "sc") {
            res.writeHead(state.status || 200, { "Content-Type": "application/json" });
            res.end(typeof state.body === "string" ? state.body : JSON.stringify(state.body));
            return;
        }
        if (typeof entry.params.hc !== "undefined" && state.hcStatus) {
            res.writeHead(state.hcStatus, { "Content-Type": "application/json" });
            res.end('{"result":"Internal server error"}');
            return;
        }
        if (other) {
            other(req, res, entry, count);
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"result":"Success"}');
    });
}

/**
 * Settings requests the server received
 * @param {Object} server - mock server
 * @returns {Array} the requests
 */
function settingsRequests(server) {
    return server.requests.filter((r) => r.path === "/o/sdk" && r.params.method === "sc");
}

/**
 * Health checks the server received
 * @param {Object} server - mock server
 * @returns {Array} the requests
 */
function healthChecks(server) {
    return server.requests.filter((r) => r.path === "/i" && typeof r.params.hc !== "undefined");
}

/**
 * Data requests (not settings requests, not health checks) the server received
 * @param {Object} server - mock server
 * @returns {Array} the requests
 */
function dataRequests(server) {
    return server.requests.filter((r) => r.path === "/i" && typeof r.params.hc === "undefined");
}

/**
 * Writes a value into the storage folder the way the SDK stores it, before the SDK starts
 * @param {String} dir - storage folder
 * @param {String} key - storage key
 * @param {*} value - value to store
 */
function seed(dir, key, value) {
    fs.writeFileSync(path.join(dir, `__${key}.json`), JSON.stringify({ [key]: value }));
}

/**
 * Starts the SDK against a mock server, with its own storage folder
 * @param {Object} server - mock server the SDK sends to
 * @param {String} dir - storage folder
 * @param {Object} config - init options
 */
function startSdk(server, dir, config) {
    Countly.halt(false);
    Countly.init({ app_key: appKey, url: server.url, storage_path: `${dir}${path.sep}`, interval: 100, ...config });
}

/**
 * Waits until a condition is true, or until the time is up
 * @param {Function} condition - returns true when the wait is over
 * @param {Number} timeoutMs - longest time to wait
 * @returns {Promise<Boolean>} true if the condition became true
 */
function waitUntil(condition, timeoutMs) {
    return new Promise((resolve) => {
        const started = Date.now();
        const check = () => {
            if (condition()) {
                resolve(true);
                return;
            }
            if (Date.now() - started > timeoutMs) {
                resolve(false);
                return;
            }
            setTimeout(check, 20);
        };
        check();
    });
}

/**
 * Waits until the SDK holds the given value for a storage key
 * @param {String} key - storage key
 * @param {*} expected - value in the stored format
 * @returns {Promise<Boolean>} true when the SDK holds it
 */
function storedValue(key, expected) {
    return waitUntil(() => JSON.stringify(CountlyStorage.storeGet(key, null)) === JSON.stringify(expected), 5000);
}

/**
 * Waits until a key is written to the storage folder with the given value
 * @param {String} dir - storage folder
 * @param {String} key - storage key
 * @param {*} expected - value the file must hold
 * @returns {Promise<Boolean>} true when the file holds the value
 */
function storedOnDisk(dir, key, expected) {
    return waitUntil(() => {
        try {
            return JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, `__${key}.json`), "utf8"))[key]) === JSON.stringify(expected);
        }
        catch (ex) {
            return false;
        }
    }, 5000);
}

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

module.exports = { appKey, settingsServer, settingsRequests, healthChecks, dataRequests, seed, startSdk, waitUntil, storedValue, storedOnDisk, sleep };
