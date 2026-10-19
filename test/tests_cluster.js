const assert = require("assert");
const fs = require("fs");
const path = require("path");
const hp = require("./helpers/helper_functions");
const { startMockServer, receivedEvents } = require("./helpers/mock_server");
const { runScript, makeTempDir, removeTempDirs } = require("./helpers/run_script");

async function runCluster(mode, settings) {
    const server = await startMockServer(settings ? (req, res, entry) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(entry.path === "/o/sdk" ? JSON.stringify({ c: settings }) : '{"result":"Success"}');
    } : undefined);
    const dir = makeTempDir(`cluster-${mode}`);
    if (settings) {
        fs.writeFileSync(path.join(dir, "__cly_sbs.json"), JSON.stringify({ cly_sbs: settings }));
    }
    const run = await runScript("cluster_app.js", { COUNTLY_URL: server.url, STORAGE_DIR: dir, CLUSTER_MODE: mode, RUN_MS: "8000" }, 30000);
    await server.close();
    return { run, requests: server.requests, dir, output: run.stdout + run.stderr };
}

describe("Cluster tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });
    after(() => {
        removeTempDirs();
    });

    it("1- a worker warns when its main process does not run Countly, instead of silently dropping data", async() => {
        const result = await runCluster("worker_only");
        assert.equal(result.requests.length, 0);
        assert.ok(result.output.indexOf("standalone_worker") !== -1, "no warning explains that nothing is sent");
    });

    it("2- standalone_worker lets a worker send its own data from its own storage folder", async() => {
        const result = await runCluster("standalone");
        const events = receivedEvents(result.requests);
        assert.ok(events.some((e) => e.key === "worker_event" && e.device_id === "cluster-worker"), "the worker's event was not sent");
        assert.ok(result.requests.some((r) => r.params.begin_session === "1" && r.params.device_id === "cluster-worker"));
        assert.ok(fs.existsSync(path.join(result.dir, "worker-1", "__cly_id.json")), "the worker did not use its own storage folder");
        assert.equal(result.output.indexOf("standalone_worker"), -1);
    });

    it("3- workers still hand their data to a main process that runs Countly", async() => {
        const result = await runCluster("primary_sdk");
        const events = receivedEvents(result.requests);
        assert.ok(events.some((e) => e.key === "worker_event" && e.device_id === "cluster-primary"), "the worker's event did not reach the main process");
        assert.equal(result.output.indexOf("standalone_worker"), -1);
    });

    it("4- the main process does not crash when it starts Countly while a worker is disconnecting", async() => {
        const run = await runScript("cluster_disconnected.js", { STORAGE_DIR: makeTempDir("cluster-disconnected") }, 20000);
        assert.equal(run.code, 0, run.stderr);
        assert.ok(run.stdout.indexOf("main process still running") !== -1, run.stderr);
    });

    it("5- a worker that disconnects exits right away and does not warn", async() => {
        const run = await runScript("cluster_worker_disconnects.js", { STORAGE_DIR: makeTempDir("cluster-worker-exit") }, 20000);
        const match = /worker exited after (\d+) ms/.exec(run.stdout);
        assert.ok(match, run.stdout + run.stderr);
        assert.ok(Number(match[1]) < 3000, `the worker needed ${match[1]} ms to exit`);
        assert.equal((run.stdout + run.stderr).indexOf("standalone_worker"), -1);
    });

    it("6- a user switch in a worker keeps the previous user's open view, profile changes and breadcrumbs with that user", async() => {
        const result = await runCluster("worker_switch");
        const views = receivedEvents(result.requests).filter((e) => e.key === "[CLY]_view" && typeof e.dur !== "undefined");
        assert.equal(views.length, 1);
        assert.equal(views[0].device_id, "cluster-primary");
        const profile = result.requests.find((r) => r.params.user_details);
        assert.equal(profile.params.device_id, "cluster-primary");
        assert.equal(JSON.parse(profile.params.user_details).custom.plan, "worker-pro");
        const crash = result.requests.find((r) => r.params.crash);
        assert.equal(crash.params.device_id, "cluster-next-user");
        assert.equal(typeof JSON.parse(crash.params.crash)._logs, "undefined");
    });

    it("7- only the process that sends the data fetches the SDK behavior settings and sends the health check, also after a user switch in a worker", async() => {
        const [primary, standalone, switched] = await Promise.all([runCluster("primary_sdk"), runCluster("standalone"), runCluster("worker_switch")]);
        const settingsIds = (result) => result.requests.filter((r) => r.path === "/o/sdk" && r.params.method === "sc").map((r) => r.params.device_id);
        const healthIds = (result) => result.requests.filter((r) => typeof r.params.hc !== "undefined").map((r) => r.params.device_id);
        assert.deepStrictEqual(settingsIds(primary), ["cluster-primary"]);
        assert.deepStrictEqual(healthIds(primary), ["cluster-primary"]);
        assert.deepStrictEqual(settingsIds(standalone), ["cluster-worker"]);
        assert.deepStrictEqual(healthIds(standalone), ["cluster-worker"]);
        assert.deepStrictEqual(settingsIds(switched), ["cluster-primary", "cluster-next-user"]);
        assert.deepStrictEqual(healthIds(switched), ["cluster-primary"]);
    });

    it("8- the data a worker hands to the main process follows the main process's SDK behavior settings", async() => {
        const result = await runCluster("primary_sdk", { st: false, cet: false });
        assert.ok(result.requests.some((r) => typeof r.params.hc !== "undefined"), "the main process did not run");
        assert.equal(receivedEvents(result.requests).filter((e) => e.key === "worker_event").length, 0, "the worker's custom event was recorded although custom events are turned off");
        assert.equal(result.requests.filter((r) => r.params.begin_session).length, 0, "the worker's session was recorded although sessions are turned off");
    });
});
