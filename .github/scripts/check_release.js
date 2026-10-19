/**
 * Release check run by CI before publishing: the version in package.json, the SDK_VERSION constants in lib and the
 * first CHANGELOG heading must all name the same version. With "--notes" it prints that version's CHANGELOG section
 * instead, which becomes the GitHub release notes.
 * usage: node .github/scripts/check_release.js [--notes]
 */
var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "../..");

/**
 * Reads a file of the repository
 * @param {String} file - path relative to the repository root
 * @returns {String} file content
 */
function read(file) {
    return fs.readFileSync(path.join(root, file), "utf8");
}

/**
 * Splits the CHANGELOG into its "## " sections
 * @returns {Array<{heading: String, body: String}>} sections in file order
 */
function changelogSections() {
    return read("CHANGELOG.md").split(/^## /m).slice(1).map((section) => {
        var lines = section.split("\n");
        return { heading: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
    });
}

var { version } = JSON.parse(read("package.json"));
var sections = changelogSections();

if (process.argv.indexOf("--notes") !== -1) {
    process.stdout.write(`${sections.length ? sections[0].body : ""}\n`);
}
else {
    var problems = [];
    var heading = sections.length ? sections[0].heading : "(none)";
    if (heading !== version) {
        problems.push(`the first CHANGELOG heading is "${heading}", rename it to "${version}"`);
    }
    ["lib/countly.js", "lib/countly-bulk.js"].forEach((file) => {
        var match = /SDK_VERSION = "([^"]+)"/.exec(read(file));
        var found = match ? match[1] : "(none)";
        if (found !== version) {
            problems.push(`${file} has SDK_VERSION "${found}", set it to "${version}"`);
        }
    });
    if (problems.length) {
        process.stderr.write(`Release check failed for ${version}:\n- ${problems.join("\n- ")}\n`);
        process.exitCode = 1;
    }
    else {
        process.stdout.write(`Release check passed for ${version}\n`);
    }
}
