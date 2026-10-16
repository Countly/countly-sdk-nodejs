/* eslint-disable no-console */
const assert = require("assert");
const cluster = require("cluster");
const fs = require("fs");
const path = require("path");
const Countly = require("../lib/countly");
const CountlyBulk = require("../lib/countly-bulk");
const CountlyStorage = require("../lib/countly-storage");
const hp = require("./helpers/helper_functions");
const { startMockServer } = require("./helpers/mock_server");
const { runScript, makeTempDir, removeTempDirs, readStoredFile } = require("./helpers/run_script");

const { StorageTypes } = Countly;
const sdkRoot = path.resolve(__dirname, "..");

// every CountlyBulk instance registers a cluster "fork" listener and these tests create several instances
cluster.setMaxListeners(60);
const oldDefaultDir = path.join(sdkRoot, "data");

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function lastLine(output) {
    const lines = output.trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
}

function bulkInnerRequests(requests) {
    const inner = [];
    requests.filter((r) => r.path === "/i/bulk").forEach((r) => {
        JSON.parse(r.params.requests).forEach((request) => {
            inner.push(request);
        });
    });
    return inner;
}

function deadPid() {
    for (let pid = 900000; ; pid++) {
        try {
            process.kill(pid, 0);
        }
        catch (ex) {
            if (ex.code === "ESRCH") {
                return pid;
            }
        }
    }
}

describe("Storage safety tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    after(() => {
        Countly.halt(true);
        removeTempDirs();
    });
    afterEach(() => {
        fs.rmSync(oldDefaultDir, { recursive: true, force: true });
        fs.rmSync(path.join(sdkRoot, "lib", "relative_store"), { recursive: true, force: true });
        ["cly_id", "cly_id_type", "cly_queue", "cly_event"].forEach((key) => {
            fs.rmSync(path.join(sdkRoot, "lib", `undefined__${key}.json`), { force: true });
        });
    });

    it("1- exiting right after an SDK call keeps the stored queue", async() => {
        const dir = makeTempDir("exit");
        const run = await runScript("exit_after_call.js", { STORAGE_DIR: dir }, 60000);
        assert.equal(run.timedOut, false, run.stderr);
        const queue = readStoredFile(path.join(dir, "__cly_queue.json"), "cly_queue");
        assert.ok(Array.isArray(queue), "the stored queue file was left empty or unreadable");
        assert.equal(queue.length, 301);
        assert.equal(JSON.parse(queue[300].user_details).name, "last before exit");
        assert.deepStrictEqual(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")), [], "temporary files were left behind");
    });

    it("2- stores data in .countly-storage inside the working folder by default", async() => {
        const cwd = makeTempDir("default-location");
        const run = await runScript("storage_location.js", { DEVICE_ID: "default-user" }, 20000, cwd);
        const output = lastLine(run.stdout);
        assert.equal(output.storagePath, path.join(cwd, ".countly-storage"));
        assert.equal(readStoredFile(path.join(cwd, ".countly-storage", "__cly_id.json"), "cly_id"), "default-user");
        assert.equal(fs.existsSync(path.join(oldDefaultDir, "__cly_id.json")), false);
    });

    it("3- resolves a relative storage_path against the working folder", async() => {
        const cwd = makeTempDir("relative-location");
        await runScript("storage_location.js", { DEVICE_ID: "relative-user", STORAGE_PATH: "relative_store/" }, 20000, cwd);
        assert.equal(readStoredFile(path.join(cwd, "relative_store", "__cly_id.json"), "cly_id"), "relative-user");
    });

    it("4- keeps files inside a storage_path given without a trailing slash", async() => {
        const cwd = makeTempDir("no-slash");
        const folder = path.join(cwd, "abs_store");
        await runScript("storage_location.js", { DEVICE_ID: "folder-user", STORAGE_PATH: folder }, 20000, cwd);
        assert.equal(readStoredFile(path.join(folder, "__cly_id.json"), "cly_id"), "folder-user");
        assert.equal(fs.existsSync(`${folder}__cly_id.json`), false);
    });

    it("5- moves data from the old default location, so the device ID survives the upgrade", async() => {
        fs.mkdirSync(oldDefaultDir, { recursive: true });
        fs.writeFileSync(path.join(oldDefaultDir, "__cly_id.json"), JSON.stringify({ cly_id: "legacy-device" }));
        fs.writeFileSync(path.join(oldDefaultDir, "__cly_id_type.json"), JSON.stringify({ cly_id_type: 1 }));
        const cwd = makeTempDir("migration");
        const run = await runScript("storage_location.js", {}, 20000, cwd);
        assert.equal(lastLine(run.stdout).deviceId, "legacy-device");
        assert.equal(readStoredFile(path.join(cwd, ".countly-storage", "__cly_id.json"), "cly_id"), "legacy-device");
        assert.equal(readStoredFile(path.join(cwd, ".countly-storage", "__cly_id_type.json"), "cly_id_type"), 1);
        assert.equal(fs.existsSync(path.join(oldDefaultDir, "__cly_id.json")), false);
        assert.equal(fs.existsSync(path.join(oldDefaultDir, "__cly_id.json.migrated")), true);
    });

    it("6- moves files that older versions wrote next to a folder given without a trailing slash", async() => {
        const cwd = makeTempDir("sibling-migration");
        const folder = path.join(cwd, "abs_store");
        fs.writeFileSync(`${folder}__cly_id.json`, JSON.stringify({ cly_id: "sibling-device" }));
        const run = await runScript("storage_location.js", { STORAGE_PATH: folder }, 20000, cwd);
        assert.equal(lastLine(run.stdout).deviceId, "sibling-device");
        assert.equal(readStoredFile(path.join(folder, "__cly_id.json"), "cly_id"), "sibling-device");
    });

    it("7- creating a bulk instance does not change where the SDK stores its own data", async() => {
        const dir = makeTempDir("core-bulk");
        Countly.init({ app_key: "YOUR_APP_KEY", url: "http://127.0.0.1:1", storage_path: `${dir}${path.sep}`, test_mode: true, device_id: "core-user" });
        const bulk = new Countly.Bulk({ app_key: "BULK_APP", url: "http://127.0.0.1:1", storage_type: StorageTypes.MEMORY });
        assert.equal(CountlyStorage.getStorageType(), StorageTypes.FILE);
        assert.equal(CountlyStorage.getStoragePath(), dir);
        assert.equal(bulk._getStorage().getStorageType(), StorageTypes.MEMORY);
        Countly.add_event({ key: "after_bulk" });
        await sleep(300);
        const stored = readStoredFile(path.join(dir, "__cly_event.json"), "cly_event");
        assert.ok(Array.isArray(stored), "the SDK stopped writing its event file");
        assert.deepStrictEqual(stored.map((e) => e.key), ["after_bulk"]);
    });

    it("8- two bulk instances keep their apps' data apart", async() => {
        const server = await startMockServer();
        const bulkA = new CountlyBulk({ app_key: "APP_A", url: server.url, interval: 100 });
        bulkA.add_user({ device_id: "userA" }).add_event({ key: "a_event" });
        const bulkB = new CountlyBulk({ app_key: "APP_B", url: server.url, interval: 100 });
        bulkB.add_user({ device_id: "userB" }).add_event({ key: "b_event" });
        bulkA.start();
        bulkB.start();
        await server.waitFor((reqs) => bulkInnerRequests(reqs).length >= 2, 5000);
        await sleep(500);
        bulkA.stop();
        bulkB.stop();
        await server.close();
        const inner = bulkInnerRequests(server.requests);
        assert.equal(inner.length, 2);
        const byUser = {};
        inner.forEach((request) => {
            byUser[request.device_id] = request;
        });
        assert.equal(byUser.userA.app_key, "APP_A");
        assert.deepStrictEqual(byUser.userA.events.map((e) => e.key), ["a_event"]);
        assert.equal(byUser.userB.app_key, "APP_B");
        assert.deepStrictEqual(byUser.userB.events.map((e) => e.key), ["b_event"]);
    });

    it("9- memory storage never writes files, also when a fatal crash forces a save", () => {
        CountlyStorage.initStorage(null, StorageTypes.MEMORY);
        CountlyStorage.storeSet("cly_queue", [{ device_id: "private-user" }]);
        CountlyStorage.forceStore();
        assert.equal(fs.existsSync(path.join(sdkRoot, "lib", "undefined__cly_queue.json")), false);
        CountlyStorage.resetStorage();
    });

    it("10- removes temporary files that ended processes left behind, and keeps those of running processes", () => {
        const dir = makeTempDir("stale-tmp");
        const stale = `__cly_queue.json.${deadPid()}.tmp`;
        const running = `__cly_queue.json.${process.ppid}.tmp`;
        fs.writeFileSync(path.join(dir, stale), "[]");
        fs.writeFileSync(path.join(dir, running), "[]");
        CountlyStorage.initStorage(`${dir}${path.sep}`, StorageTypes.FILE);
        assert.equal(fs.existsSync(path.join(dir, stale)), false);
        assert.equal(fs.existsSync(path.join(dir, running)), true);
        CountlyStorage.resetStorage();
    });

    it("11- warns about a shared storage folder only for instances whose files would collide", () => {
        const dir = makeTempDir("shared");
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (...args) => {
            warnings.push(args.join(" "));
        };
        try {
            Countly.init({ app_key: "YOUR_APP_KEY", url: "http://127.0.0.1:1", storage_path: `${dir}${path.sep}`, test_mode: true, device_id: "shared-core" });
            const first = new CountlyBulk({ app_key: "SHARED_APP", url: "http://127.0.0.1:1", storage_path: `${dir}${path.sep}`, storage_type: StorageTypes.FILE });
            assert.equal(warnings.filter((w) => w.indexOf("overwrite") !== -1).length, 0, "the SDK and a bulk instance use different files");
            const second = new CountlyBulk({ app_key: "SHARED_APP", url: "http://127.0.0.1:1", storage_path: `${dir}${path.sep}`, storage_type: StorageTypes.FILE });
            assert.ok(first && second);
            assert.equal(warnings.filter((w) => w.indexOf("overwrite") !== -1).length, 1);
        }
        finally {
            console.warn = originalWarn;
        }
    });
});
