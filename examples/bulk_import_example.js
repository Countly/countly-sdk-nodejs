const COUNTLY_SERVER_KEY = "https://your.server.ly";
const COUNTLY_APP_KEY = "YOUR_APP_KEY";

if(COUNTLY_APP_KEY === "YOUR_APP_KEY" || COUNTLY_SERVER_KEY === "https://your.server.ly"){
    throw new Error("Please do not use default set of app key and server url")
}

var CountlyBulk = require("../lib/countly").Bulk;

var server = new CountlyBulk({
    app_key: COUNTLY_APP_KEY,
    url: COUNTLY_SERVER_KEY, //your server goes here
    debug: true
});

//start processing queued requests or next ones that will be added
server.start(function() {
    //callback is called when there is nothing in queue
    //in this example we can stop server link, but if you are adding data with timeouts, like retrieving data from database, 
    //it might not be a good idea to stop automatically, but rather wait for all data to be added and check queue size manually
    //by using server.queue_size() before stoping processing
    //or add all data and then start processing queue, but in that case whole queue will be kept in memory until processing starts
    server.stop();
});


var user = server.add_user({device_id: "my_device_id"});

user.begin_session({_os: "Android", _os_version: "7", _app_version: "1.0"}, 240, 1500645060)
    .add_event({key: "Test1", timestamp: 1500645060})
    .add_event({key: "Test2", timestamp: 1500645060})
    .add_event({key: "Test3", timestamp: 1500645060})
    .user_details({name: "Test user", email: "test@test.test"})
    .report_view("Login view", "Android", 1500645060, 200, true)
    .report_view("Logout view", "Android", 1500645260, 40, false, true)
    .report_feedback({rating: 5, platform: "Android", app_version: "1.0", widget_id: "1"}, 1500645160)
    .report_crash({_os: "Android", _os_version: "7", _error: "Stack trace goes here", _app_version: "1.0"}, 1500645200)
    .custom_set("key", "value")
    .custom_set_once("only", "once")
    .custom_increment("inc")
    .custom_increment_by("inc", 2)
    .custom_multiply("mul", 10)
    .custom_max("max", 10)
    .custom_min("min", 10)
    .custom_push("check", "a")
    .custom_push_unique("tags", "morning")
    .custom_save();