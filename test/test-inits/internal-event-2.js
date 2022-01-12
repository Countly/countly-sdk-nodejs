const Countly = require("../../lib/countly");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "https://try.count.ly", //your server goes here
    debug: true,
    max_events: -1,
    require_consent: true //check for consent
});
Countly.begin_session();
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
    process.exit(0);
}, 3000);
