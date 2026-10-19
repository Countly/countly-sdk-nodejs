const assert = require("assert");
const { execSync } = require("child_process");
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
});
