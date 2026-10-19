/* eslint-disable no-console */
const path = require("path");
const Countly = require("../../../lib/countly");

process.on("uncaughtException", (err) => {
    console.log(`uncaught exception: ${err.message}`);
    process.exit(0);
});
process.on("unhandledRejection", (reason) => {
    console.log(`unhandled rejection: ${reason && reason.message}`);
    process.exit(0);
});
Countly.init({ app_key: "YOUR_APP_KEY", url: "http://127.0.0.1:1", storage_path: `${process.env.STORAGE_DIR}${path.sep}`, device_id: "flush-user" });
Countly.user_details({ name: "flush" });
Countly.flush(() => {
    throw new Error("thrown in flush callback");
});
