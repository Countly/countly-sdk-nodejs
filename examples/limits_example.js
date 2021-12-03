var Countly = require("../lib/countly.js");

Countly.init({
    app_key: "YOUR_APP_KEY_HERE",
    url: "https://try.count.ly", //your server goes here
    debug: true, //to read the logs
    max_key_length: 9, //set maximum key length here
    max_value_size: 6, //set maximum value length here
    max_segmentation_values: 5, //set maximum segmentation number here
    max_breadcrumb_count: 5, //set maximum number of logs that will be stored before erasing old ones
    max_stack_trace_lines_per_thread: 5, //set maximum number of lines for stack trace
    max_stack_trace_line_length: 10 //set maximum length of a line for stack trace
});

Countly.begin_session();
Countly.track_errors();
Countly.track_pageview("a very long page name");

var error = {
    stack: "Lorem ipsum dolor sit amet,\n consectetur adipiscing elit, sed do eiusmod tempor\n incididunt ut labore et dolore magna\n aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n Duis aute irure dolor in reprehenderit in voluptate\n velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia\n deserunt mollit anim id\n est laborum.",
};
Countly.log_error(error);
var log = "Enter your log here";
Countly.add_log(log);
//add user details
Countly.user_details({
    name: "Gottlob Frege",
    username: "Grundgesetze",
    email: "test@isatest.com",
    organization: "Bialloblotzsky",
    phone: "+4555999423",
    //Web URL pointing to user picture
    picture:
    "https://ih0.redbubble.net/image.276305970.7419/flat,550x550,075,f.u3.jpg",
    gender: "M",
    byear: 1848, //birth year
    custom: {
        "key1234567890": "Value100",
        "key2345678901": "Value200",
        "key3456789012": "Value300",
        "key4567890123": "Value400",
        "key5678901234": "Value500",
        "key6789012345": "Value600",
        "key7890123456": "Value700",
        "key8901234567": "Value800",
        "key9012345678": "Value900",
        "key0123456789": "Value000",
    },
});
//modify user data
Countly.userData.set("name of a character", "Bertrand Arthur William Russell"); //set custom property
Countly.userData.set_once("A galaxy far far away", "Called B48FF"); //set custom property only if property does not exist
Countly.userData.increment_by("byear", 123456789012345); //increment value in key by provided value
Countly.userData.increment_by("byear"); //increment value in key by one
Countly.userData.multiply("byear", 1234567890123456); //multiply value in key by provided value
Countly.userData.max("byear", 1234567890123456); //save max value between current and provided
Countly.userData.min("byear", 1234567890123456); //save min value between current and provided
Countly.userData.push("gender", "Fernando Valdez II"); //add value to key as array element
Countly.userData.push_unique("gender", "Fernando Valdez III"); //add value to key as array element, but only store unique values in array
Countly.userData.pull("gender", "Fernando Valdez III"); //remove value from array under property with key as name
Countly.userData.save();
//add custom event
Countly.add_event({
    key: "Enter your key here",
    count: 1,
    segmentation: {
        "key1234567890": "Value100",
        "key2345678901": "Value200",
        "key3456789012": "Value300",
        "key4567890123": "Value400",
        "key5678901234": "Value500",
        "key6789012345": "Value600",
        "key7890123456": "Value700",
        "key8901234567": "Value800",
        "key9012345678": "Value900",
        "key0123456789": "Value000",
    },
});
