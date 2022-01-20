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
            for (var i = 0; i < 85; i++) {
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
    //0
    function(data) {
        assert.equal(data, "Countly initialized");
    },
    //1
    function(data) {
        assert.equal(data, "Session started");
    },
    //2
    function(data) {
        assert.equal(data, "Got metrics");
    },
    //3
    function(data) {
        testMetrics(data);
    },
    //4
    function(data) {
        assert.equal(data, "Processing request");
    },
    //5
    function(data) {
        testBeginSession(data);
    },
    //6
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //7
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //8
    function(data) {
        testBeginSession(data);
    },
    //9
    function(data) {
        assert(data === "false");
    },
    //10
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    //11
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "in_app_purchase", "count": 3, "sum": 2.97, "dur": 1000, "segmentation": {"app_version": "1.0", "country": "Turkey"}});
    },
    //12
    function(data) {
        assert.equal(data, "Processing request");
    },
    //13
    function(data) {
        testEvent(data);
    },
    //14
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //15
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //16
    function(data) {
        testEvent(data);
    },
    //17
    function(data) {
        assert(data === "false");
    },
    //18
    function(data) {
        assert.equal(data, "Trying to add userdetails: ");
    },
    //19
    function(data) {
        assert.deepEqual(JSON.parse(data), {"name": "Arturs Sosins", "username": "ar2rsawseen", "email": "test@test.com", "organization": "Countly", "phone": "+37112345678", "picture": "https://pbs.twimg.com/profile_images/1442562237/012_n_400x400.jpg", "gender": "M", "byear": 1987, "custom": {"key1": "value1", "key2": "value2"}});
    },
    //20
    function(data) {
        assert.equal(data, "Processing request");
    },
    //21
    function(data) {
        testUserDetails(data);
    },
    //22
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //23
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //24
    function(data) {
        testUserDetails(data);
    },
    //25
    function(data) {
        assert(data === "false");
    },
    //26
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    //27
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "segmentation": {"name": "test1", "visit": 1, "segment": os.type()}, "count": 1});
    },
    //28
    function(data) {
        assert.equal(data, "Processing request");
    },
    //29
    function(data) {
        testEvent(data);
    },
    //30
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //31
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //32
    function(data) {
        testEvent(data);
    },
    //33
    function(data) {
        assert(data === "false");
    },
    //34
    function(data) {
        assert.equal(data, "Got metrics");
    },
    //35
    function(data) {
        testMetrics(data);
    },
    //36
    function(data) {
        assert.equal(data, "Processing request");
    },
    //37
    function(data) {
        testCrash(data);
    },
    //38
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //39
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //40
    function(data) {
        testCrash(data);
    },
    //41
    function(data) {
        assert(data === "false");
    },
    //42
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    //43
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "timed", "count": 1, "segmentation": {"app_version": "1.0", "country": "Turkey"}, "dur": 25});
    },
    //44
    function(data) {
        assert.equal(data, "Processing request");
    },
    //45
    function(data) {
        testEvent(data);
    },
    //46
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //47
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //48
    function(data) {
        testEvent(data);
    },
    //49
    function(data) {
        assert(data === "false");
    },
    //50
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    //51
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "dur": 40, "segmentation": {"name": "test1", "segment": os.type()}, "count": 1});
    },
    //52
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    //53
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "segmentation": {"name": "test1", "visit": 1, "segment": os.type()}, "count": 1});
    },
    //54
    function(data) {
        assert.equal(data, "Processing request");
    },
    //55
    function(data) {
        testEvent(data);
    },
    //56
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //57
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //58
    function(data) {
        testEvent(data);
    },
    //59
    function(data) {
        assert(data === "false");
    },
    //60
    function(data) {
        assert.equal(data, "Session extended");
    },
    //61
    function(data) {
        assert(data >= 60 && data <= 61);
    },
    //62
    function(data) {
        assert.equal(data, "Processing request");
    },
    //63
    function(data) {
        testSessionDuration(data);
    },
    //64
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //65
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //66
    function(data) {
        testSessionDuration(data);
    },
    //67
    function(data) {
        assert(data === "false");
    },
    //68
    function(data) {
        assert.equal(data, "Ending session");
    },
    //69
    function(data) {
        assert.equal(data, "Adding event: ");
    },
    //70
    function(data) {
        assert.deepEqual(JSON.parse(data), {"key": "[CLY]_view", "dur": 15, "segmentation": {"name": "test1", "segment": os.type()}, "count": 1});
    },
    //71
    function(data) {
        assert.equal(data, "Processing request");
    },
    //72
    function(data) {
        testEndSession(data);
    },
    //73
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //74
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //75
    function(data) {
        testEndSession(data);
    },
    //76
    function(data) {
        assert(data === "false");
    },
    //77
    function(data) {
        assert.equal(data, "Processing request");
    },
    //78
    function(data) {
        testEvent(data);
    },
    //79
    function(data) {
        assert.equal(data, "Sending HTTP request");
    },
    //80
    function(data) {
        assert.equal(data, "Request Finished");
    },
    //81
    function(data) {
        testEvent(data);
    },
    //82
    function(data) {
        assert(data === "false");
    },
    //83
    function(data) {
        assert.equal(data, "Got metrics");
    },
    //84
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