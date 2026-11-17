const cluster = require("cluster");
const CountlyBulk = require("../../../lib/countly-bulk");

const server = new CountlyBulk({
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    interval: 200,
    max_key_length: 4,
    max_value_size: 5,
});

if (cluster.isMaster) {
    server.start();
    const worker = cluster.fork();
    setTimeout(() => {
        worker.kill();
        process.exit(0);
    }, Number(process.env.RUN_MS || 8000));
}
else {
    server.add_event("cluster-limits-user", { key: "checkout_completed", segmentation: { category: "overlong-value" } });
    setInterval(() => { }, 1000);
}
