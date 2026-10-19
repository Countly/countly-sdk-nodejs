/* eslint-disable no-console */
const Countly = require("../../../lib/countly");
const CountlyStorage = require("../../../lib/countly-storage");

const config = {
    app_key: "YOUR_APP_KEY",
    url: "http://127.0.0.1:1",
    test_mode: true,
};
if (process.env.DEVICE_ID) {
    config.device_id = process.env.DEVICE_ID;
}
if (process.env.STORAGE_PATH) {
    config.storage_path = process.env.STORAGE_PATH;
}
Countly.init(config);
Countly.add_event({ key: "location_check" });
setTimeout(() => {
    console.log(JSON.stringify({ deviceId: Countly.get_device_id(), storagePath: CountlyStorage.getStoragePath() }));
    process.exit(0);
}, 800);
