/* eslint-disable no-console */
const cluster = require("cluster");
const path = require("path");
const Countly = require("../../../lib/countly");

const mode = process.env.CLUSTER_MODE;
const config = {
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    interval: 200,
};

if (cluster.isMaster) {
    if (mode === "primary_sdk" || mode === "worker_switch" || mode === "worker_location" || mode === "worker_app_switch") {
        config.device_id = "cluster-primary";
        if (mode === "worker_app_switch") {
            config.fail_timeout = 1;
        }
        Countly.init(config);
    }
    const worker = cluster.fork();
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
else if (mode === "worker_app_switch") {
    Countly.init(config);
    Countly.begin_session();
    Countly.add_event({ key: "before_switch" });
    setTimeout(() => {
        Countly.change_app_key("cluster-app-b");
        Countly.change_server_url(process.env.COUNTLY_URL_B);
        if (process.env.QUEUE_OP === "replace") {
            Countly.replace_all_app_keys_in_queue_with_current_app_key();
        }
        else if (process.env.QUEUE_OP === "remove") {
            Countly.remove_different_app_keys_from_queue();
        }
        else if (process.env.QUEUE_OP === "flush") {
            Countly.flush_queues();
        }
        Countly.add_event({ key: "after_switch" });
    }, 1000);
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
