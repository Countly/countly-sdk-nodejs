/* eslint-disable no-console */
const cluster = require("cluster");
const path = require("path");
const Countly = require("../../../lib/countly");

if (cluster.isMaster) {
    const started = Date.now();
    const worker = cluster.fork();
    worker.on("exit", () => {
        console.log(`worker exited after ${Date.now() - started} ms`);
        process.exit(0);
    });
}
else {
    Countly.init({ app_key: "YOUR_APP_KEY", url: "http://127.0.0.1:1", storage_path: `${process.env.STORAGE_DIR}${path.sep}` });
    process.disconnect();
}
