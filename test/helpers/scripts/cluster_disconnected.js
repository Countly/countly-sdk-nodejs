/* eslint-disable no-console */
const cluster = require("cluster");
const path = require("path");
const Countly = require("../../../lib/countly");

if (cluster.isMaster) {
    const worker = cluster.fork();
    worker.on("disconnect", () => {
        Countly.init({ app_key: "YOUR_APP_KEY", url: "http://127.0.0.1:1", storage_path: `${process.env.STORAGE_DIR}${path.sep}`, device_id: "primary", test_mode: true });
        setTimeout(() => {
            console.log("main process still running");
            process.exit(0);
        }, 1000);
    });
}
else {
    process.disconnect();
    setTimeout(() => process.exit(0), 3000);
}
