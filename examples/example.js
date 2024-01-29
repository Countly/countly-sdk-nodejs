//since we need to test crashing the app
/*global runthis, crashDaApp*/
const COUNTLY_SERVER_KEY = "https://your.server.ly";
const COUNTLY_APP_KEY = "YOUR_APP_KEY";

if(COUNTLY_APP_KEY === "YOUR_APP_KEY" || COUNTLY_SERVER_KEY === "https://your.server.ly"){
    console.warn("Please do not use default set of app key and server url")
}

var Countly = require("../lib/countly.js");

Countly.init({
    app_key: COUNTLY_APP_KEY,
    url: COUNTLY_SERVER_KEY, //your server goes here
    debug: true
});

Countly.begin_session();

Countly.track_errors();

setTimeout(function() {
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
}, 5000);

setTimeout(function() {
    Countly.user_details({
        "name": "Arturs Sosins",
        "username": "ar2rsawseen",
        "email": "test@test.com",
        "organization": "Countly",
        "phone": "+37112345678",
        //Web URL to picture
        "picture": "https://pbs.twimg.com/profile_images/1442562237/012_n_400x400.jpg",
        "gender": "M",
        "byear": 1987, //birth year
        "custom": {
            "key1": "value1",
            "key2": "value2",
        }
    });
}, 10000);

setTimeout(function() {
    Countly.track_view("test1");
}, 15000);

setTimeout(function() {
    try {
        runthis();
    }
    catch (ex) {
        Countly.log_error(ex);
    }
}, 20000);

setTimeout(function() {
    Countly.start_event("timed");
}, 25000);

setTimeout(function() {
    Countly.end_event({
        "key": "timed",
        "count": 1,
        "segmentation": {
            "app_version": "1.0",
            "country": "Turkey"
        }
    });
}, 50000);

setTimeout(function() {
    Countly.track_view("test1");
}, 55000);


setTimeout(function() {
    Countly.end_session();
}, 70000);


setTimeout(function() {
    crashDaApp();
}, 100000);

