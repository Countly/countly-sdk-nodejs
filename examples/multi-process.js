//since we need to test crashing the app
/*global runthis, crashDaApp*/
var cluster = require("cluster");

if (cluster.isMaster) {
    // eslint-disable-next-line no-console
    console.log("I am master");
    cluster.fork();
    cluster.fork();
}
else if (cluster.isWorker) {
    // eslint-disable-next-line no-console
    console.log("I am worker " + cluster.worker.id);
}

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

Countly.track_errors();
Countly.track_view("test");

try {
    runthis();
}
catch (ex) {
    Countly.log_error(ex);
}

setTimeout(function() {
    Countly.end_session();
}, 7000);

Countly.start_event("timed");

setTimeout(function() {
    Countly.end_event({
        "key": "timed",
        "count": 1,
        "segmentation": {
            "app_version": "1.0",
            "country": "Turkey"
        }
    });
}, 3000);

if (!cluster.isMaster) {
    setTimeout(function() {
        crashDaApp();
    }, 10000);
}
else {
    setTimeout(function() {
        crashDaApp();
    }, 15000);
}