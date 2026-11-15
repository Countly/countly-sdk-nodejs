const assert = require("assert");
const CountlyBulk = require("../lib/countly-bulk");

describe("Bulk internal limits", () => {
    it("applies configured event key, segmentation key, value and count limits", () => {
        const bulk = new CountlyBulk({
            app_key: "test",
            url: "http://127.0.0.1:1",
            max_key_length: 4,
            max_value_size: 5,
            max_segmentation_values: 1,
        });
        bulk.add_event("user", {
            key: "checkout_completed",
            segmentation: { category: "overlong-value", another: "second-value" },
        });
        const event = bulk._getBulkEventQueue().user[0];
        assert.strictEqual(event.key, "chec");
        assert.deepStrictEqual(event.segmentation, { cate: "overl" });
    });

    it("applies default event limits when no overrides are supplied", () => {
        const bulk = new CountlyBulk({ app_key: "test", url: "http://127.0.0.1:1" });
        const segmentation = {};
        for (let i = 0; i < 101; i++) {
            segmentation[`${i}-${"k".repeat(130)}`] = "v".repeat(300);
        }
        bulk.add_event("user", { key: "e".repeat(130), segmentation });
        const event = bulk._getBulkEventQueue().user[0];
        assert.strictEqual(event.key.length, 128);
        assert.strictEqual(Object.keys(event.segmentation).length, 100);
        Object.keys(event.segmentation).forEach((key) => {
            assert.strictEqual(key.length, 128);
            assert.strictEqual(event.segmentation[key].length, 256);
        });
    });

    it("applies configured limits to bulk user configuration", () => {
        const bulk = new CountlyBulk({
            app_key: "test",
            url: "http://127.0.0.1:1",
            max_key_length: 12,
            max_value_size: 5,
            max_segmentation_values: 2,
        });
        const user = bulk.add_user({ device_id: "user", city: "Long city name", country_code: "US" });
        user.begin_session();
        const request = bulk._getBulkRequestQueue()[0];
        assert.strictEqual(request.device_id, "user");
        assert.strictEqual(request.city, "Long ");
        assert.strictEqual(request.country_code, undefined);
    });
});
