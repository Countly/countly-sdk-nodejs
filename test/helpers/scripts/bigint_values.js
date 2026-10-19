/* eslint-disable no-console */
/* global BigInt */
const path = require("path");
const Countly = require("../../../lib/countly");

Countly.init({
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    storage_path: `${process.env.STORAGE_DIR}${path.sep}`,
    storage_type: process.env.STORAGE_TYPE || undefined,
    device_id: "bigint-user",
    interval: 200,
});
const circular = { name: "loop" };
circular.self = circular;
Countly.add_event({ key: "order_paid", segmentation: { order_id: BigInt("9007199254740993"), plan: "pro", loop: circular } });
Countly.track_view("Checkout", { cart_id: BigInt(12) });
setTimeout(() => {
    console.log("survived");
    process.exit(0);
}, 2500);
