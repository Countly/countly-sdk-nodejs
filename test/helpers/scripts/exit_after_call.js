const fs = require("fs");
const path = require("path");
const Countly = require("../../../lib/countly");

const dir = process.env.STORAGE_DIR;
Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "http://127.0.0.1:1",
    storage_path: `${dir}${path.sep}`,
    test_mode: true,
    device_id: "exit-user",
});
for (let i = 0; i < 300; i++) {
    Countly.user_details({ name: `user ${i}` });
}

const file = path.join(dir, "__cly_queue.json");
let lastSize = -1;
let stableChecks = 0;
const poll = setInterval(() => {
    let size = 0;
    try {
        size = fs.statSync(file).size;
    }
    catch (ex) {
        size = 0;
    }
    stableChecks = size > 0 && size === lastSize ? stableChecks + 1 : 0;
    lastSize = size;
    if (stableChecks >= 5) {
        clearInterval(poll);
        Countly.user_details({ name: "last before exit" });
        process.exit(0);
    }
}, 100);
