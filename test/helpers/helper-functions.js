/* eslint-disable no-unused-vars */
var path = require("path"),
    fs = require("fs"),
    Countly = require("../../lib/countly.js");

//standard init for tests
function initLimitsMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY_HERE",
        url: "https://try.count.ly", //your server goes here
        max_events: -1,
        interval: 100,
        max_key_length: 8, //set maximum key length here
        max_value_size: 8, //set maximum value length here
        max_segmentation_values: 3, //set maximum segmentation number here
        max_breadcrumb_count: 2, //set maximum number of logs that will be stored before erasing old ones
        max_stack_trace_lines_per_thread: 3, //set maximum number of lines for stack trace
        max_stack_trace_line_length: 10 //set maximum length of a line for stack trace
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
function customLimitsEvent() {
//add custom event
    Countly.add_event({
        key: "Enter your key here",
        count: 1,
        segmentation: {
            "key of 1st seg": "Value of 1st seg",
            "key of 2nd seg": "Value of 2nd seg",
            "key of 3rd seg": "Value of 3rd seg",
            "key of 4th seg": "Value of 4th seg",
            "key of 5th seg": "Value of 5th seg",
        },
    });
}

function userLimitsDetails() {
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
            "SEGkey 1st one": "SEGVal 1st one",
            "SEGkey 2st one": "SEGVal 2st one",
            "SEGkey 3st one": "SEGVal 3st one",
            "SEGkey 4st one": "SEGVal 4st one",
            "SEGkey 5st one": "SEGVal 5st one",
        },
    });
}

function errorLog() {
    var error = {
        stack: "Lorem ipsum dolor sit amet,\n consectetur adipiscing elit, sed do eiusmod tempor\n incididunt ut labore et dolore magna\n aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n Duis aute irure dolor in reprehenderit in voluptate\n velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia\n deserunt mollit anim id\n est laborum.",
    };
    Countly.log_error(error);
}

function userLimitsData() {
    Countly.userData.set("name of a character", "Bertrand Arthur William Russell"); //set custom property
    Countly.userData.set_once("A galaxy far far away", "Called B48FF"); //set custom property only if property does not exist
    Countly.userData.increment_by("byear", 123456789012345); //increment value in key by provided value
    Countly.userData.multiply("byear", 2345678901234567); //multiply value in key by provided value
    Countly.userData.max("byear", 3456789012345678); //save max value between current and provided
    Countly.userData.min("byear", 4567890123456789); //save min value between current and provided
    Countly.userData.push("gender", "II Fernando Valdez"); //add value to key as array element
    Countly.userData.push_unique("gender", "III Fernando Valdez"); //add value to key as array element, but only store unique values in array
    Countly.userData.pull("gender", "III Fernando Valdez"); //remove value from array under property with key as name
    Countly.userData.save();
}

function addLog() {
    Countly.add_log("log1");
    Countly.add_log("log2");
    Countly.add_log("log3");
    Countly.add_log("log4");
    Countly.add_log("log5 too many");
    Countly.add_log("log6");
    Countly.add_log("log7");
}
function beginSession() {
    Countly.begin_session();
}
function trackLimitsPageView() {
    Countly.track_pageview("a very long page name");
}
function trackError() {
    Countly.track_errors();
}

module.exports = {
    initLimitsMain,
    customLimitsEvent,
    userLimitsDetails,
    clearStorage,
    span,
    idDir,
    reqDir,
    eventDir,
    mpan,
    beginSession,
    trackError,
    trackLimitsPageView,
    addLog,
    userLimitsData,
    errorLog
};