/* global describe, it, */
var path = require("path"),
    fs = require("fs"),
    assert = require("assert"),
    cp = require("child_process"),
    exec = cp.exec;

var dir = path.resolve(__dirname, "../");

describe("Internal event test with only event consent given", function() {
    it("Only custom event should be sent to the queue", function(done) {
        this.timeout(6000);
        var cmd = "node " + dir + "/test/test-inits/internal-event-1.js";
        //execute the init code in a shell
        exec(cmd, (err) => {
            if (err) {
                return;
            }
        });
        //after init started start the tests
        setTimeout(() => {
            //read the event queue
            var file = fs.readFileSync(dir + "/data/__cly_event.json", "utf-8");
            //check if events are present in the queue
            assert.ok(file.indexOf('"key":"a"') >= 0);
            assert.ok(file.indexOf('"key":"[CLY]_view"') < 0);
            assert.ok(file.indexOf('"key":"[CLY]_nps"') < 0);
            assert.ok(file.indexOf('"key":"[CLY]_survey"') < 0);
            assert.ok(file.indexOf('"key":"[CLY]_star_rating"') < 0);
            //delete the queues
            fs.unlinkSync(dir + "/data/__cly_event.json");
            fs.unlinkSync(dir + "/data/__cly_id.json");
            fs.unlinkSync(dir + "/data/__cly_queue.json");
            done();
        }, 5000);
    });
});

describe("Internal event test with all but event consent given", function() {
    it("All but custom event should be sent to the queue", function(done) {
        this.timeout(6000);
        var cmd = "node " + dir + "/test/test-inits/internal-event-2.js";
        exec(cmd, (err) => {
            if (err) {
                return;
            }
        });
        setTimeout(() => {
            var file = fs.readFileSync(dir + "/data/__cly_event.json", "utf-8");
            assert.ok(file.indexOf('"key":"a"') < 0);
            assert.ok(file.indexOf('"key":"[CLY]_view"') >= 0);
            assert.ok(file.indexOf('"key":"[CLY]_nps"') >= 0);
            assert.ok(file.indexOf('"key":"[CLY]_survey"') >= 0);
            assert.ok(file.indexOf('"key":"[CLY]_star_rating"') >= 0);
            fs.unlinkSync(dir + "/data/__cly_event.json");
            fs.unlinkSync(dir + "/data/__cly_id.json");
            fs.unlinkSync(dir + "/data/__cly_queue.json");
            done();
        }, 5000);
    });
});
