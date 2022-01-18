/* eslint-disable no-unused-vars */
var path = require("path"),
    fs = require("fs"),
    Countly = require("../../lib/countly.js");

//standard init for tests
function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://try.count.ly",
        interval: 100,
        max_events: -1
    });

}

var dir = path.resolve(__dirname, "../../");
var idDir = (dir + "\\data\\__cly_id.json");
var eventDir = (dir + "\\data\\__cly_event.json");
var reqDir = (dir + "\\data\\__cly_queue.json");
var span = 1000;
var mpan = 3000;

//queue files clearing logic
function clearStorage() {
    if (fs.existsSync(idDir)) {
        fs.unlinkSync(idDir);
    }
    if (fs.existsSync(eventDir)) {
        fs.unlinkSync(eventDir);
    }
    if (fs.existsSync(reqDir)) {
        fs.unlinkSync(reqDir);
    }
}

//some verbose calls for convenience
function customEvent() {
    Countly.add_event({
        "key": "in_app_purchase",
        "count": 3,
        "sum": 2.97,
        "dur": 1000,
        "segmentation": {
            "app_version": "1.0",
            "country": "Turkey"
        }
    });

}

function userDetails() {
    Countly.user_details({
        "name": "Barturiana Sosinsiava",
        "username": "bar2rawwen",
        "email": "test@test.com",
        "organization": "Dukely",
        "phone": "+123456789",
        "picture": "https://ps.timg.com/profile_images/52237/011_n_400x400.jpg",
        "gender": "Non-binary",
        "byear": 1987, //birth year
        "custom": {
            "key1 segment": "value1 segment",
            "key2 segment": "value2 segment",
        }
    });
}
function beginSession() {
    Countly.begin_session();
}
function trackView() {
    Countly.track_view("test1");
}

module.exports = {initMain, customEvent, userDetails, clearStorage, span, idDir, reqDir, eventDir, mpan, beginSession, trackView};