const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const Countly = require("../lib/countly");
const CountlyBulk = require("../lib/countly-bulk");
const cc = require("../lib/countly-common");
const hp = require("./helpers/helper_functions");

const salt = "salt";

function sha256(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function getRequestData(request) {
    if (request.method === "GET") {
        const queryIndex = request.url.indexOf("?");
        return queryIndex === -1 ? "" : request.url.substring(queryIndex + 1);
    }
    return request.body.toString("utf8");
}

function splitChecksum(data) {
    if (data.indexOf("checksum256=") === -1) {
        return { data: data, checksum: null };
    }

    if (data.indexOf("&checksum256=") !== -1) {
        const markerIndex = data.lastIndexOf("&checksum256=");
        return {
            data: data.substring(0, markerIndex),
            checksum: data.substring(markerIndex + "&checksum256=".length),
        };
    }

    return {
        data: "",
        checksum: data.substring("checksum256=".length),
    };
}

function parseMultipartFields(contentType, bodyBuffer) {
    const boundaryMatch = /boundary=([^;]+)/.exec(contentType || "");
    assert.ok(boundaryMatch, "Expected multipart boundary");

    const boundary = `--${boundaryMatch[1]}`;
    const body = bodyBuffer.toString("utf8");
    const parts = body.split(boundary);
    const fields = [];

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part || part === "--\r\n" || part === "--") {
            continue;
        }

        const nameMatch = /name="([^"]+)"/.exec(part);
        if (!nameMatch) {
            continue;
        }

        const valueStart = part.indexOf("\r\n\r\n");
        if (valueStart === -1) {
            continue;
        }

        let value = part.substring(valueStart + 4);
        if (value.endsWith("\r\n")) {
            value = value.substring(0, value.length - 2);
        }
        if (value.endsWith("--")) {
            value = value.substring(0, value.length - 2);
        }

        fields.push({ name: nameMatch[1], value: value });
    }

    return fields;
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

async function startServer() {
    const state = {
        requests: [],
        waiters: [],
    };

    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => {
            chunks.push(chunk);
        });
        req.on("end", () => {
            const request = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: Buffer.concat(chunks),
            };

            state.requests.push(request);
            if (state.waiters.length > 0) {
                const waiter = state.waiters.shift();
                waiter(request);
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"result":"Success"}');
        });
    });

    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    return {
        server: server,
        state: state,
        url: `http://127.0.0.1:${address.port}`,
    };
}

function waitForNextRequest(state, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        if (state.requests.length > 0) {
            resolve(state.requests.shift());
            return;
        }

        const timeoutId = setTimeout(() => {
            reject(new Error("Timed out waiting for request"));
        }, timeoutMs);

        state.waiters.push((request) => {
            clearTimeout(timeoutId);
            resolve(request);
        });
    });
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe("Salt helper tests", () => {
    it("serializes params in insertion order and produces lowercase checksums", () => {
        const encodedData = cc.serializeParams({ zeta: 1, alpha: 2 });
        assert.equal(encodedData, "zeta=1&alpha=2");
        assert.equal(cc.calculateChecksum(encodedData, salt), sha256(encodedData + salt));
        assert.equal(cc.addChecksum(encodedData, salt, false), `${encodedData}&checksum256=${sha256(encodedData + salt)}`);
    });

    it("URL-decodes request data before hashing when requested", () => {
        const encodedData = "user_details=%7B%22name%22%3A%22A%20%26%20B%22%7D";
        assert.equal(cc.calculateChecksum(encodedData, salt, true), sha256(`${decodeURIComponent(encodedData)}${salt}`));
    });
});

describe("Salt integration tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
        Countly.halt(false);
    });

    it("does not append checksum256 when salt is not configured", async() => {
        const serverInfo = await startServer();

        try {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: serverInfo.url,
                interval: 10,
            });

            Countly.begin_session(true);

            const request = await waitForNextRequest(serverInfo.state);
            const data = getRequestData(request);

            assert.equal(data.indexOf("checksum256=") !== -1, false);
            await delay(50);
        }
        finally {
            Countly.halt(true);
            await closeServer(serverInfo.server);
        }
    });

    it("appends a lowercase checksum using natural parameter order", async() => {
        const serverInfo = await startServer();

        try {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: serverInfo.url,
                interval: 10,
                salt: salt,
            });

            Countly.request({
                zeta: "1",
                alpha: "2",
                app_key: "YOUR_APP_KEY",
                device_id: "salt-device",
            });

            const request = await waitForNextRequest(serverInfo.state);
            const requestData = getRequestData(request);
            const checksumData = splitChecksum(requestData);

            assert.ok(checksumData.checksum);
            assert.match(checksumData.checksum, /^[a-f0-9]{64}$/);
            assert.ok(checksumData.data.indexOf("zeta=1") < checksumData.data.indexOf("alpha=2"));
            assert.equal(checksumData.checksum, sha256(`${checksumData.data}${salt}`));
            await delay(50);
        }
        finally {
            Countly.halt(true);
            await closeServer(serverInfo.server);
        }
    });

    it("URL-decodes upload request data before hashing for picture uploads", async() => {
        const serverInfo = await startServer();
        const imagePath = path.join(__dirname, "salt-upload-test.png");
        fs.writeFileSync(imagePath, Buffer.from("fake-image-binary"));

        try {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: serverInfo.url,
                interval: 10,
                salt: salt,
            });

            Countly.user_details({
                name: "A & B",
                picturePath: imagePath,
            });

            const request = await waitForNextRequest(serverInfo.state);
            const fields = parseMultipartFields(request.headers["content-type"], request.body);
            const checksumField = fields.find((field) => field.name === "checksum256");
            const dataFields = fields.filter((field) => field.name !== "checksum256" && field.name !== "user_picture");
            const rawRequestData = dataFields.map((field) => `${field.name}=${field.value}`).join("&");

            assert.equal(request.method, "POST");
            assert.ok(checksumField);
            assert.ok(dataFields.some((field) => field.name === "user_details" && field.value.indexOf("A & B") !== -1));
            assert.equal(checksumField.value, sha256(`${rawRequestData}${salt}`));
            await delay(50);
        }
        finally {
            Countly.halt(true);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
            await closeServer(serverInfo.server);
        }
    });

    it("appends checksum256 to bulk requests when salt is configured", async() => {
        const serverInfo = await startServer();
        const bulk = new CountlyBulk({
            app_key: "YOUR_APP_KEY",
            url: serverInfo.url,
            interval: 10,
            bulk_size: 1,
            salt: salt,
        });

        try {
            bulk.add_request({
                zeta: "1",
                alpha: "2",
                device_id: "bulk-device",
            });
            bulk.start();

            const request = await waitForNextRequest(serverInfo.state);
            const requestData = getRequestData(request);
            const checksumData = splitChecksum(requestData);

            assert.ok(checksumData.checksum);
            assert.match(checksumData.checksum, /^[a-f0-9]{64}$/);
            assert.ok(checksumData.data.indexOf("app_key=YOUR_APP_KEY") !== -1);
            assert.ok(checksumData.data.indexOf("requests=%5B") !== -1);
            assert.equal(checksumData.checksum, sha256(`${checksumData.data}${salt}`));
            await delay(50);
        }
        finally {
            bulk.stop();
            await closeServer(serverInfo.server);
        }
    });
});