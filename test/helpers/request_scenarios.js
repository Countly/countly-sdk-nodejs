// The request scenarios of the SDK: each makes the calls the other Countly SDKs make in their own request tests and
// collects the requests the SDK sends, with the values that change from run to run masked. api/requests/ keeps the
// result of each scenario, tests_requests.js fails when the SDK no longer sends those requests, and
// npm run requests:update writes the records again.
const fs = require("fs");
const path = require("path");
const Countly = require("../../lib/countly");
const CountlyStorage = require("../../lib/countly-storage");
const hp = require("./helper_functions");
const { startMockServer } = require("./mock_server");

const MASK = "<masked>";
const MASKED_PARAMS = ["timestamp", "hour", "dow", "tz", "sdk_version", "av", "rr", "checksum", "checksum256", "session_duration"];
const JSON_PARAMS = ["events", "metrics", "user_details", "crash", "consent", "hc"];
const MASKED_EVENT_FIELDS = ["timestamp", "hour", "dow", "id", "pvid", "cvid", "peid"];
const MASKED_CRASH_FIELDS = ["_error", "_run", "_os", "_os_version"];
// a view's "segment" is the operating system the SDK runs on
const MASKED_VIEW_SEGMENTS = ["segment"];
const MAX_INT = 2147483647;
const RECORDS = path.resolve(__dirname, "../../api/requests");
const SEQUENCE_HEADER = "x-scenario-sequence";

/**
 * The scenarios by name: the init config each adds to the common one, and the calls it makes. A scenario that awaits
 * settle lets the SDK send everything the calls before it queued, so that what they sent stays apart from what follows.
 */
const SCENARIOS = {
    parity: {
        config: {},
        run: () => {
            Countly.begin_session();
            Countly.add_event({
                key: "purchase",
                count: 2,
                sum: 9.99,
                dur: 5,
                segmentation: {
                    nar: "uto",
                    sasuke: MAX_INT,
                    sakura: false,
                    itachi: Number.MAX_VALUE,
                    kakaski: Number.MIN_VALUE,
                    hashirama: -MAX_INT,
                    tobi: { obito: "uchiha", zetsu: "white" },
                    stringList: ["value1", "value2", "value3"],
                    intList: [1, 2, 3],
                    doubleList: [1.1, 2.2, 3.3],
                    boolList: [true, false, true],
                    mixedList: ["value1", 2, 3.3, true],
                    mapList: [{ key1: "value1", key2: 2 }, { key1: "value2", key2: 3 }, { key1: "value3", key2: 4 }],
                },
            });
            Countly.user_details({
                name: "John Doe",
                username: "john_d",
                email: "john@example.com",
                organization: "Countly",
                phone: "1234567890",
                picture: "https://example.com/picture.jpg",
                gender: "M",
                byear: 1980,
                custom: { tier: "gold", age: 30 },
            });
            Countly.session_duration(60);
            Countly.end_session();
        },
    },
    views: {
        config: {},
        run: () => {
            Countly.begin_session();
            Countly.track_view("Home", { source: "scenario" });
            Countly.track_view("Settings");
            Countly.end_session();
        },
    },
    crash: {
        config: {},
        run: () => {
            Countly.add_log("breadcrumb one");
            Countly.log_error(new Error("parity crash"), { tier: "gold" });
        },
    },
    consent: {
        config: { require_consent: true },
        run: async(settle) => {
            Countly.add_consent(["sessions", "events"]);
            Countly.begin_session();
            Countly.add_event({ key: "consented" });
            await settle();
            Countly.remove_consent("events");
            Countly.add_event({ key: "not_consented" });
            Countly.end_session();
        },
    },
    "device-id": {
        config: {},
        run: async(settle) => {
            Countly.begin_session();
            Countly.change_id("parity-device-002", true);
            Countly.add_event({ key: "after_merge" });
            await settle();
            Countly.change_id("parity-device-003", false);
            Countly.add_event({ key: "after_new_id" });
            Countly.end_session();
        },
    },
};

/**
 * A copy of a JSON value with the keys of every object sorted, so that the order the SDK writes them in does not count
 * @param {*} value - parsed JSON
 * @returns {*} the sorted copy
 */
function sorted(value) {
    if (Array.isArray(value)) {
        return value.map(sorted);
    }
    if (value && typeof value === "object") {
        return Object.keys(value).sort().reduce((copy, key) => {
            copy[key] = sorted(value[key]);
            return copy;
        }, {});
    }
    return value;
}

/**
 * A copy of an object with the values of the given keys masked
 * @param {Object} value - object
 * @param {string[]} keys - keys to mask
 * @returns {Object} the masked copy
 */
function masked(value, keys) {
    return Object.keys(value).reduce((copy, key) => {
        copy[key] = keys.indexOf(key) === -1 ? value[key] : MASK;
        return copy;
    }, {});
}

/**
 * The value of a JSON parameter with the values that change from run to run masked
 * @param {string} name - parameter name
 * @param {*} value - parsed parameter value
 * @returns {*} the masked value
 */
function maskedJson(name, value) {
    if ((name === "metrics" || name === "hc") && value && typeof value === "object") {
        return masked(value, Object.keys(value));
    }
    if (name === "events" && Array.isArray(value)) {
        return value.map((event) => {
            if (event.key !== "[CLY]_view") {
                return masked(event, MASKED_EVENT_FIELDS);
            }
            const view = masked(event, MASKED_EVENT_FIELDS.concat("dur"));
            if (view.segmentation && typeof view.segmentation === "object") {
                view.segmentation = masked(view.segmentation, MASKED_VIEW_SEGMENTS);
            }
            return view;
        });
    }
    if (name === "crash" && value && typeof value === "object") {
        return masked(value, MASKED_CRASH_FIELDS);
    }
    return value;
}

/**
 * A request as the scenario files record it: the path and the parameters, with the values that change from run to run
 * masked and the JSON parameters parsed
 * @param {Object} entry - request recorded by the mock server
 * @returns {Object} path and params
 */
function recordedRequest(entry) {
    const recorded = {};
    Object.keys(entry.params).forEach((name) => {
        let value = entry.params[name];
        if (MASKED_PARAMS.indexOf(name) !== -1) {
            value = MASK;
        }
        else if (JSON_PARAMS.indexOf(name) !== -1) {
            value = maskedJson(name, JSON.parse(value));
        }
        recorded[name] = value;
    });
    return { path: entry.path, params: sorted(recorded) };
}

/**
 * Waits until the SDK has sent everything it queued: both queues are empty and no request came for longer than the
 * SDK's own delays, such as the one second it waits before sending a consent change
 * @param {Object} server - the mock server the SDK sends to
 * @returns {Promise<void>} resolves when the SDK is idle, rejects after 15 seconds
 */
function idle(server) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let count = -1;
        let quietSince = started;
        const check = () => {
            const queued = CountlyStorage.storeGet("cly_queue", []).length + CountlyStorage.storeGet("cly_event", []).length;
            if (queued || server.requests.length !== count) {
                count = server.requests.length;
                quietSince = Date.now();
            }
            else if (Date.now() - quietSince > 1500) {
                resolve();
                return;
            }
            if (Date.now() - started > 15000) {
                reject(new Error("the SDK still had requests to send after 15 seconds"));
                return;
            }
            setTimeout(check, 50);
        };
        check();
    });
}

/**
 * Runs a scenario on an SDK that is not initialized and gives back the requests it sent, in the order the SDK started
 * them, halting the SDK afterwards
 * @param {string} name - scenario name, a key of SCENARIOS
 * @returns {Promise<Object[]>} the requests, as recordedRequest gives them
 */
async function scenarioRequests(name) {
    const scenario = SCENARIOS[name];
    const server = await startMockServer();
    let sequence = 0;
    try {
        // halt(true), which clearing the storage calls, also stops the SDK from sending
        Countly.halt(false);
        Countly.init({
            app_key: "parity-app-key",
            url: server.url,
            device_id: "parity-device-001",
            interval: 50,
            // requests that are on their way at the same time can arrive in either order, so each carries its number
            http_options: (options) => {
                sequence += 1;
                options.headers[SEQUENCE_HEADER] = String(sequence);
            },
            ...scenario.config,
        });
        // the health check goes out once the behavior settings arrive, and the scenario's first request must not pass it
        await server.waitFor((requests) => requests.some((entry) => entry.params.hc), 5000);
        await scenario.run(() => idle(server));
        await idle(server);
    }
    finally {
        Countly.halt(true);
        await server.close();
    }
    return server.requests
        .slice()
        .sort((a, b) => Number(a.headers[SEQUENCE_HEADER]) - Number(b.headers[SEQUENCE_HEADER]))
        .map(recordedRequest);
}

/**
 * The content of api/requests/<scenario>.json for the requests of a scenario
 * @param {Object[]} requests - the requests, as scenarioRequests gives them
 * @returns {string} file content
 */
function requestsReport(requests) {
    return `${JSON.stringify(requests, null, 2)}\n`;
}

/**
 * Runs every scenario and writes its record to api/requests/
 * @returns {Promise<void>} resolves when every record is written
 */
async function updateRecords() {
    fs.mkdirSync(RECORDS, { recursive: true });
    for (const name of Object.keys(SCENARIOS)) {
        // the scenarios share the SDK, so they run one after another
        // eslint-disable-next-line no-await-in-loop
        await hp.clearStorage();
        // eslint-disable-next-line no-await-in-loop
        const report = requestsReport(await scenarioRequests(name));
        fs.writeFileSync(path.join(RECORDS, `${name}.json`), report);
        process.stdout.write(`api/requests/${name}.json\n`);
    }
    await hp.clearStorage();
}

if (require.main === module) {
    updateRecords().catch((error) => {
        process.stderr.write(`${error.stack}\n`);
        process.exit(1);
    });
}

module.exports = { SCENARIOS, RECORDS, scenarioRequests, requestsReport };
