var assert = require("assert");
var Countly = require("../lib/countly");
var hp = require("./helpers/helper_functions");

/**
 * Initializes the SDK with a fixed device ID
 * @param {Object=} extra - init options to add
 */
function initMain(extra) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        device_id: "location-user",
        max_events: -1,
        ...extra,
    });
}

/**
 * Returns the location parameters that a queued request carries
 * @param {Object} request - request read from the request queue
 * @returns {Object} the request's country_code, city, location and ip_address, without the ones it does not carry
 */
function locationOf(request) {
    var result = {};
    ["country_code", "city", "location", "ip_address"].forEach((key) => {
        if (key in request) {
            result[key] = request[key];
        }
    });
    return result;
}

describe("Location tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    it("1- after begin_session, sends the location right away and with every later request", (done) => {
        initMain();
        Countly.begin_session();
        Countly.set_location("TR", "Izmir", "38.4237,27.1428", "10.0.0.1");
        Countly.end_session(10);
        setTimeout(() => {
            var rq = hp.readRequestQueue();
            assert.equal(rq.length, 3);
            assert.equal(rq[0].begin_session, 1);
            assert.deepStrictEqual(locationOf(rq[0]), {});
            for (var i = 1; i < 3; i++) {
                hp.requestBaseParamValidator(rq[i]);
                assert.deepStrictEqual(locationOf(rq[i]), { country_code: "TR", city: "Izmir", location: "38.4237,27.1428", ip_address: "10.0.0.1" });
            }
            assert.equal(rq[1].begin_session, undefined);
            assert.equal(rq[2].end_session, 1);
            done();
        }, hp.sWait);
    });
    it("2- before begin_session, sends the location with begin_session only", (done) => {
        initMain();
        Countly.set_location("TR", "Izmir", "38.4237,27.1428", null);
        Countly.begin_session();
        setTimeout(() => {
            var rq = hp.readRequestQueue();
            assert.equal(rq.length, 1);
            assert.equal(rq[0].begin_session, 1);
            assert.deepStrictEqual(locationOf(rq[0]), { country_code: "TR", city: "Izmir", location: "38.4237,27.1428" });
            done();
        }, hp.sWait);
    });
    it("3- replaces the location given at init, and empty values clear it", (done) => {
        initMain({ country_code: "DE", city: "Berlin", ip_address: "10.0.0.2" });
        Countly.begin_session();
        Countly.set_location("TR", "Izmir");
        Countly.set_location(null, "", undefined, null);
        setTimeout(() => {
            var rq = hp.readRequestQueue();
            assert.equal(rq.length, 3);
            assert.deepStrictEqual(locationOf(rq[0]), { country_code: "DE", city: "Berlin", ip_address: "10.0.0.2" });
            assert.deepStrictEqual(locationOf(rq[1]), { country_code: "TR", city: "Izmir" });
            assert.deepStrictEqual(locationOf(rq[2]), {});
            done();
        }, hp.sWait);
    });
    it("4- without the sessions consent, sends the location right away", (done) => {
        initMain({ require_consent: true });
        Countly.add_consent("location");
        Countly.set_location("TR", "Izmir");
        setTimeout(() => {
            var located = hp.readRequestQueue().filter((r) => r.city === "Izmir");
            assert.equal(located.length, 1);
            assert.deepStrictEqual(locationOf(located[0]), { country_code: "TR", city: "Izmir" });
            done();
        }, hp.sWait);
    });
    it("5- without the location consent, the location is not set", (done) => {
        initMain({ require_consent: true });
        Countly.add_consent("sessions");
        Countly.begin_session();
        Countly.set_location("TR", "Izmir", "38.4237,27.1428", "10.0.0.1");
        setTimeout(() => {
            assert.equal(Countly.country_code, null);
            assert.equal(Countly.city, null);
            var rq = hp.readRequestQueue();
            assert.ok(rq.length > 0);
            rq.forEach((r) => {
                assert.deepStrictEqual(locationOf(r), { location: "" });
            });
            done();
        }, hp.sWait);
    });
});
