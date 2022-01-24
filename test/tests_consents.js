var assert = require("assert");
var fs = require("fs");
var hp = require("./helpers/helper_functions");
var Countly = require("../lib/countly");

// standard init for tests
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        require_consent: true,
        interval: 10000,
        device_id: "György Ligeti",
        max_events: -1,
    });
}
// gathered events to add
function events() {
    Countly.add_event({
        key: "a",
        count: 1,
        segmentation: {
            "custom key": "custom value",
        },
    });
    Countly.add_event({
        key: "[CLY]_view",
        count: 1,
        segmentation: {
            "custom key": "custom value",
        },
    });
    Countly.add_event({
        key: "[CLY]_nps",
        count: 1,
        segmentation: {
            "custom key": "custom value",
        },
    });
    Countly.add_event({
        key: "[CLY]_survey",
        count: 1,
        segmentation: {
            "custom key": "custom value",
        },
    });
    Countly.add_event({
        key: "[CLY]_star_rating",
        count: 1,
        segmentation: {
            "custom key": "custom value",
        },
    });
    Countly.add_event({
        key: "[CLY]_orientation",
        count: 1,
        segmentation: {
            "custom key": "custom value",
        },
    });
}

// tests
describe("Internal event consent tests", () => {
    it("Only custom event should be sent to the queue", (done) => {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["events"]);
        events();
        setTimeout(() => {
            var event = hp.readEventQueue();
            assert.equal(event[0].key, "a");
            assert.equal(event.length, 1);
            done();
        }, hp.sWait);
    });
    it("All but custom event should be sent to the queue", (done) => {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback"]);
        events();
        setTimeout(() => {
            var event = hp.readEventQueue();
            assert.equal(event[0].key, "[CLY]_view");
            assert.equal(event[1].key, "[CLY]_nps");
            assert.equal(event[2].key, "[CLY]_survey");
            assert.equal(event[3].key, "[CLY]_star_rating");
            assert.equal(event[4].key, "[CLY]_orientation");
            assert.equal(event.length, 5);
            done();
        }, hp.mWait);
    });
    it("Non-merge ID change should reset all consents", (done) => {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback"]);
        Countly.change_id("Richard Wagner II", false);
        events();
        setTimeout(() => {
            assert.ok(!fs.existsSync(hp.eventDir));
            done();
        }, hp.sWait);
    });
    it("Merge ID change should not reset consents", (done) => {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback"]);
        // Countly.change_id("Richard Wagner the second", true);
        events();
        setTimeout(() => {
            var event = hp.readEventQueue();
            assert.equal(event[0].key, "[CLY]_view");
            assert.equal(event[1].key, "[CLY]_nps");
            assert.equal(event[2].key, "[CLY]_survey");
            assert.equal(event[3].key, "[CLY]_star_rating");
            assert.equal(event[4].key, "[CLY]_orientation");
            assert.equal(event.length, 5);
            done();
        }, hp.mWait);
    });
});