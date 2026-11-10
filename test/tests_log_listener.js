/* eslint-disable no-console */
var assert = require("assert");
var Countly = require("../lib/countly");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

/**
 * Initializes the SDK with the given log listener
 * @param {*} logListener - value given as the log_listener init option
 * @param {Object=} extra - init options to add
 */
function initWithListener(logListener, extra) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 10000,
        max_events: -1,
        log_listener: logListener,
        ...extra,
    });
}

/**
 * Returns the received lines that a test logged itself, leaving out what the SDK logs on its own
 * @param {Array} lines - lines the listener received, as {message, level}
 * @returns {Array} the test's own lines
 */
function testLines(lines) {
    return lines.filter((line) => line.message.indexOf("log_listener_test") !== -1);
}

/**
 * Replaces a console method with one that records its arguments while the given function runs
 * @param {String} method - name of the console method
 * @param {Function} fn - code to run while the console method is replaced
 * @returns {Array} the arguments of every call, one array per call
 */
function capturePrinted(method, fn) {
    var printed = [];
    var original = console[method];
    console[method] = (...values) => {
        printed.push(values);
    };
    try {
        fn();
    }
    finally {
        console[method] = original;
    }
    return printed;
}

describe("Log listener tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("1- receives every log line with its level while debug is off", () => {
        var lines = [];
        initWithListener((message, level) => {
            lines.push({ message, level });
        });
        assert.ok(lines.some((line) => line.message === "init, Countly initialized." && line.level === "info"));

        cc.log(cc.logLevelEnums.ERROR, "log_listener_test, error line", new Error("failure"));
        cc.log(cc.logLevelEnums.WARNING, "log_listener_test, warning line");
        cc.log(cc.logLevelEnums.INFO, "log_listener_test, info line", { key: "value" });
        cc.log(cc.logLevelEnums.DEBUG, "log_listener_test, debug line");
        cc.log(cc.logLevelEnums.VERBOSE, "log_listener_test, verbose line");
        var own = testLines(lines);
        assert.deepStrictEqual(own.map((line) => line.level), ["error", "warning", "info", "debug", "verbose"]);
        assert.ok(own[0].message.startsWith("log_listener_test, error line Error: failure"));
        assert.equal(own[1].message, "log_listener_test, warning line");
        assert.equal(own[2].message, 'log_listener_test, info line {"key":"value"}');
    });
    it("2- receives the printed line without its level prefix while debug is on", () => {
        var lines = [];
        initWithListener((message, level) => {
            lines.push({ message, level });
        }, { debug: true });
        var printed = capturePrinted("info", () => {
            cc.log(cc.logLevelEnums.INFO, "log_listener_test, printed line");
        });
        assert.deepStrictEqual(testLines(lines), [{ message: "log_listener_test, printed line", level: "info" }]);
        assert.deepStrictEqual(printed, [["[INFO] log_listener_test, printed line", ""]]);
    });
    it("3- keeps the SDK working when the listener throws", (done) => {
        var calls = 0;
        initWithListener(() => {
            calls++;
            throw new Error("log_listener_test, listener failure");
        });
        Countly.add_event({ key: "after_listener_threw", count: 1 });
        setTimeout(() => {
            var eq = hp.readEventQueue();
            assert.ok(calls > 1);
            assert.equal(eq.length, 1);
            assert.equal(eq[0].key, "after_listener_threw");
            done();
        }, hp.sWait);
    });
    it("4- ignores a log listener that is not a function", () => {
        var printed = capturePrinted("warn", () => {
            initWithListener("not a function", { debug: true });
        });
        assert.ok(printed.some((values) => values[0] === "[WARNING] init, log_listener must be a function, ignoring it."));
        assert.equal(cc.logListener, null);
    });
    it("5- takes the listener set on the Countly object before init", () => {
        var lines = [];
        Countly.log_listener = (message, level) => {
            lines.push({ message, level });
        };
        initWithListener(undefined);
        assert.ok(lines.some((line) => line.message === "init, Countly initialized." && line.level === "info"));
    });
    it("6- stops receiving log lines after halt", () => {
        var lines = [];
        initWithListener((message, level) => {
            lines.push({ message, level });
        });
        Countly.halt(true);
        var countAfterHalt = lines.length;
        cc.log(cc.logLevelEnums.INFO, "log_listener_test, after halt");
        assert.equal(lines.length, countAfterHalt);
        assert.equal(cc.logListener, null);
    });
});
