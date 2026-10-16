/* eslint-disable no-console */
const path = require("path");
const Countly = require("../../../lib/countly");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    device_id: "rejection-user",
    interval: 200,
});
Countly.track_errors();
Promise.reject(new Error("unhandled payment failure"));
setTimeout(() => {
    console.log("still running");
    process.exit(0);
}, 2500);
