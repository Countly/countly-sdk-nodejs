/* global describe, it, */
var path = require("path"),
    fs = require("fs"),
    assert = require("assert"),
    os = require("os"),
    cp = require("child_process"),
    exec = cp.exec;

var dir = path.resolve(__dirname, "../");

describe("Running simple example", function() {
    it("example should finish", function(done) {
        this.timeout(120000);
        var handler = function(error, stdout) {
            var parts = stdout.split("\n");
            parts.pop();
            for (var i = 0; i < parts.length; i++) {
                // eslint-disable-next-line no-loop-func
                describe(parts[i], function() {
                    runTest(i, tests[i], parts[i]);
                });
            }
            describe("Clearing data", function() {
                it("should remove data", function() {
                    fs.unlinkSync(dir + "/data/__cly_event.json");
                    fs.unlinkSync(dir + "/data/__cly_id.json");
                    fs.unlinkSync(dir + "/data/__cly_queue.json");
                });
            });
            done();
        };
        var cmd = "node " + dir + "/examples/example.js";
        exec(cmd, handler);
    });
});

function testMetrics(data) {
    data = JSON.parse(data);
    assert.equal(data._app_version, "0.0");
    assert.ok(data._os, os.type());
    assert.ok(data._os_version, os.release());
}

function testBeginSession(data) {
    data = JSON.parse(data);
    assert.equal(data.begin_session, 1);
    assert.equal(data.app_key, "YOUR_APP_KEY");
    assert.ok(data.device_id);
    assert.ok(data.timestamp);
    assert.ok(typeof data.hour !== "undefined");
    assert.ok(typeof data.dow !== "undefined");
    testMetrics(data.metrics);
}

function testSessionDuration(data) {
    data = JSON.parse(data);
    assert.ok(data.session_duration >= 60 && data.session_duration <= 61);
    assert.equal(data.app_key, "YOUR_APP_KEY");
    assert.ok(data.device_id);
    assert.ok(data.timestamp);
    assert.ok(typeof data.hour !== "undefined");
    assert.ok(typeof data.dow !== "undefined");
}

function testEndSession(data) {
    data = JSON.parse(data);
    assert.equal(data.end_session, 1);
    assert.ok(data.session_duration >= 9 && data.session_duration <= 11);
    assert.equal(data.app_key, "YOUR_APP_KEY");
    assert.ok(data.device_id);
    assert.ok(data.timestamp);
    assert.ok(typeof data.hour !== "undefined");
    assert.ok(typeof data.dow !== "undefined");
}

function testEvent(data) {
    data = JSON.parse(data);
    assert.ok(data.events);
    data.events = JSON.parse(data.events);
    for (var i = 0; i < data.events.length; i++) {
        assert.ok(data.events[i].key);
        assert.ok(data.events[i].count);
        assert.ok(data.events[i].timestamp);
        assert.ok(typeof data.events[i].hour !== "undefined");
        assert.ok(typeof data.events[i].dow !== "undefined");
    }
    assert.equal(data.app_key, "YOUR_APP_KEY");
    assert.ok(data.device_id);
    assert.ok(data.timestamp);
    assert.ok(typeof data.hour !== "undefined");
    assert.ok(typeof data.dow !== "undefined");
}

function testUserDetails(data) {
    data = JSON.parse(data);
    assert.ok(data.user_details);
    data.user_details = JSON.parse(data.user_details);
    assert.ok(data.user_details.name);
    assert.ok(data.user_details.username);
    assert.ok(data.user_details.email);
    assert.ok(data.user_details.organization);
    assert.ok(data.user_details.phone);
    assert.ok(data.user_details.picture);
    assert.ok(data.user_details.gender);
    assert.ok(data.user_details.byear);
    assert.ok(data.user_details.custom);
    assert.equal(data.app_key, "YOUR_APP_KEY");
    assert.ok(data.device_id);
    assert.ok(data.timestamp);
    assert.ok(typeof data.hour !== "undefined");
    assert.ok(typeof data.dow !== "undefined");
}

function testCrash(data) {
    data = JSON.parse(data);
    assert.ok(data.crash);
    data.crash = JSON.parse(data.crash);
    assert.ok(data.crash._os);
    assert.ok(data.crash._os_version);
    assert.ok(data.crash._error);
    assert.equal(data.crash._app_version, "0.0");
    assert.ok(data.crash._run);
    assert.ok(data.crash._not_os_specific);
    assert.ok(data.crash._nonfatal);
    assert.equal(data.app_key, "YOUR_APP_KEY");
    assert.ok(data.device_id);
    assert.ok(data.timestamp);
    assert.ok(typeof data.hour !== "undefined");
    assert.ok(typeof data.dow !== "undefined");
}

var tests = [
    function(data) {
        assert.equal(data, "Countly initialized");
    },

    function(data) {
        assert.equal(data, "Session started");
    },
    function(data) {
        assert.equal(data, "Got metrics");
    },
    function(data) {
        testMetrics(data);
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testBeginSession(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testBeginSession(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Adding event: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "in_app_purchase", "count": 3, "sum": 2.97, "dur": 1000, "segmentation": {"app_version": "1.0", "country": "Turkey"}});
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Trying to add userdetails: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"name": "Arturs Sosins", "username": "ar2rsawseen", "email": "test@test.com", "organization": "Countly", "phone": "+37112345678", "picture": "https://pbs.twimg.com/profile_images/1442562237/012_n_400x400.jpg", "gender": "M", "byear": 1987, "custom": {"key1": "value1", "key2": "value2"}});
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testUserDetails(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testUserDetails(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Adding event: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "segmentation": {"name": "test1", "visit": 1, "segment": os.type()}, "count": 1});
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Got metrics");
    },
    function(data) {
        testMetrics(data);
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testCrash(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testCrash(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Adding event: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "timed", "count": 1, "segmentation": {"app_version": "1.0", "country": "Turkey"}, "dur": 25});
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Adding event: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "dur": 40, "segmentation": {"name": "test1", "segment": os.type()}, "count": 1});
    },
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "segmentation": {"name": "test1", "visit": 1, "segment": os.type()}, "count": 1});
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Session extended");
    },
    function(data) {
        assert(data >= 60 && data <= 61);
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testSessionDuration(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testSessionDuration(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Ending session");
    },
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "dur": 15, "segmentation": {"name": "test1", "segment": os.type()}, "count": 1});
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testEndSession(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testEndSession(data);
    },
    function(data) {
        assert(data === "false");
    },
    function(data) {
        assert.equal(data, "Processing request");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    function(data) {
        assert.equal(data, "Request Finished");
    },
    function(data) {
        testEvent(data);
    },
    function(data) {
        assert(data === "false");
    },

    function(data) {
        assert.equal(data, "Got metrics");
    },
    function(data) {
        testMetrics(data);
    },
];

function runTest(id, test, data) {
    it("verifying test output: " + id, function(done) {
        test(data);
        done();
    });
}