/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
var path = require("path"),
    fs = require("fs"),
    Countly = require("../../lib/countly.js");

var dir = path.resolve(__dirname, "../../");
var idDir = (dir + "\\data\\__cly_id.json");
var eventDir = (dir + "\\data\\__cly_event.json");
var reqDir = (dir + "\\data\\__cly_queue.json");
var span = 50;
var mpan = 5000;

function readEventQueue() {
    var a = JSON.parse(fs.readFileSync(eventDir, "utf-8")).cly_event;
    return a;
}

function readRequestQueue() {
    var a = JSON.parse(fs.readFileSync(reqDir, "utf-8")).cly_queue;
    return a;
}

//queue files clearing logic
function clearStorage() {
    //Resets Countly
    Countly.halt();
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

module.exports = {
    clearStorage,
    span,
    mpan,
    readEventQueue,
    readRequestQueue
};