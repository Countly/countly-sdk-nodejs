var Countly = require("../lib/countly.js");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "https://try.count.ly", //your server goes here
    debug: true
});


Countly.begin_session();
Countly.add_event({
    "key": "This is a custom event",
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