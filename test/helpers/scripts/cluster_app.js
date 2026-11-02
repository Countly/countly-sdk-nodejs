/* eslint-disable no-console */
const cluster = require("cluster");
const path = require("path");
const Countly = require("../../../lib/countly");

const mode = process.env.CLUSTER_MODE;
const restarts = 10;
const config = {
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    interval: 200,
};

if (cluster.isMaster) {
    if (mode === "primary_sdk" || mode === "worker_switch" || mode === "worker_location" || mode === "primary_restart" || mode === "standalone_stop") {
        config.device_id = "cluster-primary";
        Countly.init(config);
    }
    const worker = cluster.fork();
    if (mode === "primary_restart") {
        worker.on("message", (msg) => {
            if (msg && msg.cly && msg.cly.event && msg.cly.event.key === "before_restart") {
                // the SDK's own listener comes after this one, and has to record the event before the restart
                setImmediate(async() => {
                    for (let i = 0; i < restarts; i++) {
                        // eslint-disable-next-line no-await-in-loop
                        await Countly.flush(5);
                        Countly.stop();
                        Countly.init({ ...config, app_key: "SECOND_APP_KEY" });
                    }
                });
            }
        });
    }
    setTimeout(() => {
        worker.kill();
        process.exit(0);
    }, Number(process.env.RUN_MS || 8000));
}
else if (mode === "worker_switch") {
    Countly.init(config);
    Countly.track_view("Worker page");
    Countly.userData.set("plan", "worker-pro");
    Countly.add_log("worker breadcrumb");
    setTimeout(() => {
        Countly.change_id("cluster-next-user", false);
        Countly.log_error(new Error("after switch"));
    }, 500);
    setInterval(() => { }, 1000);
}
else if (mode === "primary_restart") {
    let acks = 0;
    process.on("message", (msg) => {
        if (msg && msg.cly && msg.cly.ack) {
            acks++;
            // one answer to the worker's hello, then one from every init of the main process
            if (acks === restarts + 1) {
                Countly.add_event({ key: "after_restart" });
            }
        }
    });
    Countly.init(config);
    Countly.add_event({ key: "before_restart" });
    setInterval(() => { }, 1000);
}
else if (mode === "standalone_stop") {
    Countly.init({ ...config, standalone_worker: true, device_id: "cluster-worker" });
    Countly.stop();
    Countly.add_event({ key: "while_stopped" });
    Countly.change_id("while-stopped-user", false);
    setInterval(() => { }, 1000);
}
else {
    config.standalone_worker = mode === "standalone";
    if (mode === "standalone") {
        config.device_id = "cluster-worker";
    }
    Countly.init(config);
    Countly.begin_session();
    if (mode === "worker_location") {
        Countly.set_location("TR", "Izmir", "38.4237,27.1428", null);
    }
    Countly.add_event({ key: "worker_event" });
    console.log(`worker device id: ${Countly.get_device_id()}`);
    setInterval(() => { }, 1000);
}
