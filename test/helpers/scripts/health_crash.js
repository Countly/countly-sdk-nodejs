const path = require("path");
const Countly = require("../../../lib/countly");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "http://127.0.0.1:1",
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    device_id: "crash-user",
    interval: 100,
    disable_health_check: true,
    disable_sdk_behavior_settings_updates: true,
});
Countly.track_errors();
Promise.reject(new Error("unhandled payment failure"));
setTimeout(() => {
    Countly.add_event({ key: "after_rejection" });
    throw new Error("uncaught failure");
}, 300);
