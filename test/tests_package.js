const assert = require("assert");
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const sdkRoot = path.resolve(__dirname, "..");

describe("Package tests", () => {
    it("1- the npm package contains the SDK code and its documents, and no tests or repository files", () => {
        const output = execSync("npm pack --dry-run --json --ignore-scripts", { cwd: sdkRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const packed = JSON.parse(output)[0].files.map((file) => file.path).sort();
        const libFiles = fs.readdirSync(path.join(sdkRoot, "lib")).filter((name) => name.endsWith(".js")).map((name) => `lib/${name}`);
        const expected = ["CHANGELOG.md", "LICENSE", "README.md", "index.js", "package.json"].concat(libFiles).sort();
        assert.deepStrictEqual(packed, expected);
    });

    it("2- the test script reports a failing test and fails the run", () => {
        const suite = "test/helpers/scripts/mocha_failing_suite.js";
        const args = JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8")).scripts.test.split(" ");
        assert.equal(args[0], "mocha");
        const glob = args.indexOf("test/tests_*.js");
        assert.notEqual(glob, -1, "the test script no longer runs test/tests_*.js");
        args[glob] = suite;
        const run = spawnSync(process.execPath, [path.join(sdkRoot, "node_modules", "mocha", "bin", "mocha.js")].concat(args.slice(1)), { cwd: sdkRoot, encoding: "utf8" });
        assert.equal(run.status, 1, `exit code ${run.status}, output:\n${run.stdout}${run.stderr}`);
        assert.ok(run.stdout.indexOf("1 passing") !== -1, run.stdout);
        assert.ok(run.stdout.indexOf("1 failing") !== -1, run.stdout);
    });
});
