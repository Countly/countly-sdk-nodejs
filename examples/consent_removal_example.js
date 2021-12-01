var Countly = require("../lib/countly.js");
//initialize Countly
Countly.init({
    app_key: "YOUR_APP_ID_HERE",
    url: "https://try.count.ly", //your server goes here
    debug: true,
    require_consent: true
});
//begin session
Countly.begin_session();
//optionally group the features
Countly.group_features({all: [ "sessions", "events", "views", "crashes", "attribution", "users"]});
//add consent for the grouped features
Countly.add_consent("all");
//change ID without merge
Countly.change_id("Richard Wagner", false);
//try to add event. This should not work now
Countly.add_event({
    "key": "[CLY]_view",
});
//add consents again
Countly.add_consent("all");
//now this should work
Countly.add_event({
    "key": "[CLY]_view",
});