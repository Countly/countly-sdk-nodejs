const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Runs a helper script in its own Node.js process, so behaviour that ends or crashes a process
 * (process.exit, uncaught errors, cluster workers) cannot affect the test runner.
 * @param {String} script - file name inside test/helpers/scripts
 * @param {Object} env - extra environment variables for the script
 * @param {Number} timeoutMs - the process is killed after this time
 * @param {String=} cwd - working directory of the process
 * @returns {Promise<Object>} code, signal, stdout, stderr and timedOut
 */
function runScript(script, env, timeoutMs, cwd) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(__dirname, "scripts", script)], {
            env: { ...process.env, ...env },
            cwd: cwd || process.cwd(),
            stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.on("exit", (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal, stdout, stderr, timedOut });
        });
    });
}

const createdDirs = [];

/**
 * Creates an empty temporary folder for one test
 * @param {String} name - readable part of the folder name
 * @returns {String} absolute folder path
 */
function makeTempDir(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `countly-node-${name}-`));
    createdDirs.push(dir);
    return dir;
}

/**
 * Removes the temporary folders created so far by makeTempDir
 */
function removeTempDirs() {
    while (createdDirs.length) {
        fs.rmSync(createdDirs.pop(), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
}

/**
 * Reads the value stored under a key in a storage file of the SDK
 * @param {String} file - path of a __<key>.json file
 * @param {String} key - storage key
 * @returns {*} stored value, or undefined when the file is missing or unreadable
 */
function readStoredFile(file, key) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"))[key];
    }
    catch (ex) {
        return undefined;
    }
}

module.exports = { runScript, makeTempDir, removeTempDirs, readStoredFile };
