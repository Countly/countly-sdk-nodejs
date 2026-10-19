/* eslint-disable no-console */
const CountlyBulk = require("../../../lib/countly-bulk");

const server = new CountlyBulk({
    app_key: "YOUR_APP_KEY",
    url: process.env.COUNTLY_URL,
    interval: 200,
});
server.start();
const user = server.add_user({ device_id: "consent-user", require_consent: true });
user.begin_session({ _os: "Linux", _os_version: "6", _app_version: "1.0" }, 0, 1700000000);
user.report_view("Home", 1700000000, 5);
user.add_consent(["sessions", "views"]);
setTimeout(() => {
    console.log("survived");
    process.exit(0);
}, 3000);
