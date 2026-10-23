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
            assert.equal(rq[0].country_code, undefined);
            assert.equal(rq[0].city, undefined);
            assert.equal(rq[0].location, undefined);
            assert.equal(rq[0].ip_address, undefined);
            for (var i = 1; i < 3; i++) {
                hp.requestBaseParamValidator(rq[i]);
                assert.equal(rq[i].country_code, "TR");
                assert.equal(rq[i].city, "Izmir");
                assert.equal(rq[i].location, "38.4237,27.1428");
                assert.equal(rq[i].ip_address, "10.0.0.1");
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
            assert.equal(rq[0].country_code, "TR");
            assert.equal(rq[0].city, "Izmir");
            assert.equal(rq[0].location, "38.4237,27.1428");
            assert.equal(rq[0].ip_address, undefined);
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
            assert.equal(rq[0].country_code, "DE");
            assert.equal(rq[0].city, "Berlin");
            assert.equal(rq[0].ip_address, "10.0.0.2");
            assert.equal(rq[1].country_code, "TR");
            assert.equal(rq[1].city, "Izmir");
            assert.equal(rq[1].location, undefined);
            assert.equal(rq[1].ip_address, undefined);
            assert.equal(rq[2].country_code, undefined);
            assert.equal(rq[2].city, undefined);
            assert.equal(rq[2].location, undefined);
            assert.equal(rq[2].ip_address, undefined);
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
            assert.equal(located[0].country_code, "TR");
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
                assert.equal(r.city, undefined);
                assert.equal(r.location, "");
            });
            done();
        }, hp.sWait);
    });
});
