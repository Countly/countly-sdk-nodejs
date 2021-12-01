var Countly = require("../lib/countly.js");

Countly.init({
    app_key: "21cf5a730c3152bf1cb0d1ace048e25ac9d66b90",
    url: "https://master.count.ly", //your server goes here
    debug: true,
    require_consent: true
});

Countly.begin_session();

Countly.group_features({all: [ "sessions", "events", "views", "crashes", "attribution", "users"]});

Countly.add_consent("all");

Countly.change_id("Richard Wagner", false);

Countly.add_event({
    "key": "[CLY]_view",
});

Countly.add_consent("all");

Countly.add_event({
    "key": "[CLY]_view",
});