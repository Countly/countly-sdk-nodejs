const path = require("path");
const Countly = require("../../../lib/countly");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "http://127.0.0.1:1",
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    device_id: "exit-user",
    interval: 100,
    disable_health_check: true,
    disable_sdk_behavior_settings_updates: true,
});
Countly.change_id("");
setTimeout(() => {
    Countly.change_id("");
    process.exit(0);
}, 500);
