const http = require("http");

/**
 * Starts a local Countly-like server on 127.0.0.1 that records every request it receives.
 * Query string and form-encoded body parameters are merged into entry.params.
 * @param {Function=} handler - (req, res, entry, count) answers a request itself; without it every request gets {"result":"Success"}
 * @returns {Promise<Object>} url, requests, waitFor(predicate, timeoutMs) and close()
 */
function startMockServer(handler) {
    const requests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => {
            chunks.push(chunk);
        });
        req.on("end", () => {
            const body = Buffer.concat(chunks);
            const parsed = new URL(req.url, "http://localhost");
            const params = Object.fromEntries(parsed.searchParams);
            if ((req.headers["content-type"] || "").indexOf("application/x-www-form-urlencoded") === 0) {
                Object.assign(params, Object.fromEntries(new URLSearchParams(body.toString("utf8"))));
            }
            const entry = { method: req.method, url: req.url, path: parsed.pathname, headers: req.headers, params: params, body: body };
            requests.push(entry);
            if (handler) {
                handler(req, res, entry, requests.length);
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"result":"Success"}');
        });
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve({
                url: `http://127.0.0.1:${server.address().port}`,
                requests: requests,
                waitFor: function(predicate, timeoutMs) {
                    return new Promise((done) => {
                        const started = Date.now();
                        const check = () => {
                            if (predicate(requests)) {
                                done(true);
                            }
                            else if (Date.now() - started > timeoutMs) {
                                done(false);
                            }
                            else {
                                setTimeout(check, 20);
                            }
                        };
                        check();
                    });
                },
                close: function() {
                    if (typeof server.closeAllConnections === "function") {
                        server.closeAllConnections();
                    }
                    return new Promise((done) => {
                        server.close(() => done());
                    });
                },
            });
        });
    });
}

/**
 * Lists the events of all received requests in arrival order, each with the device_id of its request
 * @param {Array} requests - entries recorded by startMockServer
 * @returns {Array} events with a device_id field added
 */
function receivedEvents(requests) {
    const events = [];
    requests.forEach((entry) => {
        if (entry.params.events) {
            JSON.parse(entry.params.events).forEach((event) => {
                event.device_id = entry.params.device_id;
                events.push(event);
            });
        }
    });
    return events;
}

module.exports = { startMockServer, receivedEvents };
