var Countly = require("../lib/countly.js");

//initialize Countly
Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "https://try.count.ly", //your server goes here
    debug: true
});

//begin session
Countly.begin_session();

//add custom event to see if event consent is given
Countly.add_event({
    "key": "This is a custom event",
    "count": 1,
    "segmentation": {
        "custom key": "custom value"
    }
});

//add internal events to see if they get their respective consents instead of event consent
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
Countly.add_event({
    "key": "[CLY]_push_action",
    "count": 1,
    "segmentation": {
        "custom key": "custom value"
    }
});
Countly.add_event({
    "key": "[CLY]_action",
    "count": 1,
    "segmentation": {
        "custom key": "custom value"
    }
});