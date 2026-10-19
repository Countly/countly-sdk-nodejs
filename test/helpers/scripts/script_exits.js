/* eslint-disable no-console */
const path = require("path");
const Countly = require("../../../lib/countly");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    device_id: "script-user",
});
Countly.add_event({ key: process.env.EVENT_KEY || "backup_finished" });
console.log("script body finished");
