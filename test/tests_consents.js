/* global describe, it, */
var assert = require("assert"),
    fs = require("fs"),
    hp = require("./helpers/helper_functions"),
    Countly = require("../lib/countly.js");

//standard init for tests
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        require_consent: true,
        interval: 10000,
        device_id: "György Ligeti",
        max_events: -1
    });
}

describe("Internal event consent tests", function() {
    it("Only custom event should be sent to the queue", function(done) {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["events"]);
        Countly.add_event({
            "key": "a",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_view",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_nps",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_survey",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_star_rating",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_orientation",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        setTimeout(() => {
            var event = hp.readEventQueue();
            assert.equal(event[0].key, "a");
            assert.equal(event.length, 1);
            done();
        }, hp.span);
    });
    it("All but custom event should be sent to the queue", function(done) {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback"]);
        Countly.add_event({
            "key": "a",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_view",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_nps",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_survey",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_star_rating",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_orientation",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        setTimeout(() => {
            var event = hp.readEventQueue();
            assert.equal(event[0].key, "[CLY]_view");
            assert.equal(event[1].key, "[CLY]_nps");
            assert.equal(event[2].key, "[CLY]_survey");
            assert.equal(event[3].key, "[CLY]_star_rating");
            assert.equal(event[4].key, "[CLY]_orientation");
            assert.equal(event.length, 5);
            done();
        }, hp.span);
    });
    it("Non-merge ID change should reset all consents", function(done) {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback"]);
        Countly.change_id("Richard Wagner II", false);
        Countly.add_event({
            "key": "a",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_view",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_nps",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_survey",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_star_rating",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_orientation",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        setTimeout(() => {
            assert.ok(!fs.existsSync(hp.eventDir));
            done();
        }, hp.span * 2);
    });
    it("Merge ID change should not reset consents", function(done) {
        hp.clearStorage();
        initMain();
        Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback"]);
        Countly.change_id("Richard Wagner the second", true);
        Countly.add_event({
            "key": "a",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_view",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_nps",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_survey",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_star_rating",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        Countly.add_event({
            "key": "[CLY]_orientation",
            "count": 1,
            "segmentation": {
                "custom key": "custom value"
            }
        });
        setTimeout(() => {
            var event = hp.readEventQueue();
            assert.equal(event[0].key, "[CLY]_view");
            assert.equal(event[1].key, "[CLY]_nps");
            assert.equal(event[2].key, "[CLY]_survey");
            assert.equal(event[3].key, "[CLY]_star_rating");
            assert.equal(event[4].key, "[CLY]_orientation");
            assert.equal(event.length, 5);
            done();
        }, hp.span);
    });
});

