/* global describe, it, */
var assert = require("assert"),
    fs = require("fs"),
    hp = require("../test/helpers/helper-functions");



describe("1.1 Check event key", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
        assert.ok(!fs.existsSync(hp.eventDir));
        assert.ok(!fs.existsSync(hp.reqDir));
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function(done) {
        //send custom event
        hp.customEvent();
        setTimeout(done, hp.mpan);
    });
    it("Check queue", function() {
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"key":"in_app_purchase"'));
    });
});
describe("1.2 Check event segmentation", function() {
    it("Clean storage", function(done) {
        setTimeout(done, hp.span);
        //clear previous data
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"segmentation":{"app_version":"1.0","country":"Turkey"}'));
    });
});
describe("1.3 Check event parameters", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"count":3,"sum":2.97,"dur":1000'));
    });
});
describe("1.4 Check event timestamp", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"timestamp"'));
    });
});
describe("1.5 Check event hour", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"hour"'));
    });
});
describe("1.6 Check event dow", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"dow"'));
    });
});
describe("1.7 Check event dow", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"dow"'));
    });
});
describe("2.1 Check request key and ID", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"app_key":"YOUR_APP_KEY","device_id"'));
    });
});
describe("2.2 Check sdk name", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"sdk_name":"javascript_native_nodejs"'));
    });
});
describe("2.3 Check sdk version", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"sdk_version"'));
    });
});
describe("2.4 Check timestamp", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"timestamp"'));
    });
});

describe("2.5 Check hour", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"hour"'));
    });
});
describe("2.6 Check dow", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send event", function() {
        //send custom event
        hp.customEvent();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"dow"'));
    });
});
describe("3.1 Check user details", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"user_details"'));
    });
});
describe("3.2 Check user detail name", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"name\\":\\"Barturiana Sosinsiava\\"'));
    });
});
describe("3.3 Check user detail username", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"username\\":\\"bar2rawwen\\"'));
    });
});
describe("3.4 Check user detail email", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"email\\":\\"test@test.com\\"'));
    });
});
describe("3.5 Check user detail organization", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"organization\\":\\"Dukely\\"'));
    });
});
describe("3.6 Check user detail phone", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"phone\\":\\"+123456789\\"'));
    });
});
describe("3.7 Check user detail picture", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"picture\\":\\"https://ps.timg.com/profile_images/52237/011_n_400x400.jpg\\"'));
    });
});
describe("3.8 Check user detail gender", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"gender\\":\\"Non-binary\\"'));
    });
});
describe("3.9 Check user detail birth year", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"byear\\":1987'));
    });
});
describe("3.10 Check user detail segmentation", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Send user details", function() {
        //send custom event
        hp.userDetails();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"custom\\":{\\"key1 segment\\":\\"value1 segment\\",\\"key2 segment\\":\\"value2 segment\\"}'));
    });
});

describe("4.1 Check session", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();

    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Start session", function() {
        //send custom event
        hp.beginSession();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"begin_session":1'));
    });
});
describe("4.2 Check session metrics", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Start session", function() {
        //send custom event
        hp.beginSession();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"metrics":"{'));
    });
});
describe("4.3 Check session app version", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Start session", function() {
        //send custom event
        hp.beginSession();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"_app_version\\"'));
    });
});
describe("4.4 Check session os", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Start session", function() {
        //send custom event
        hp.beginSession();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"_os\\"'));
    });
});
describe("4.5 Check session os version", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Start session", function() {
        //send custom event
        hp.beginSession();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var req = fs.readFileSync(hp.reqDir, "utf-8");
        assert.ok(req.includes('"_os_version\\"'));
    });
});
describe("5.1 Check track view key", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"key":"[CLY]_view"'));
    });
});
describe("5.2 Check track view count", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"count":1'));
    });
});
describe("5.3 Check track view segmentation", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"segmentation"'));
    });
});
describe("5.4 Check track view name", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"name":"test1"'));
    });
});
describe("5.5 Check track view visit", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"visit":1'));
    });
});
describe("5.5 Check track view segment", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = fs.readFileSync(hp.eventDir, "utf-8");
        assert.ok(event.includes('"segment"'));
    });
});
describe("5.6 Check track view timestamp", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = JSON.parse(fs.readFileSync(hp.eventDir, "utf-8")).cly_event;
        assert.ok(event[event.length - 1].timestamp);
    });
});
describe("5.7 Check track view hour", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = JSON.parse(fs.readFileSync(hp.eventDir, "utf-8")).cly_event;
        assert.ok(event[event.length - 1].hour);
    });
});
describe("5.8 Check track view dow", function() {
    it("Clean storage", function(done) {
        //clear previous data
        setTimeout(done, hp.span);
        hp.clearStorage();
    });
    it("Initialize Countly", function() {
        //initialize SDK
        hp.initMain();
    });
    it("Track view", function() {
        //send custom event
        hp.trackView();
    });
    it("Check queue", function(done) {
        setTimeout(done, hp.mpan);
        //read event queue
        var event = JSON.parse(fs.readFileSync(hp.eventDir, "utf-8")).cly_event;
        assert.ok(event[event.length - 1].dow);
    });
});