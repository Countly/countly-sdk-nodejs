/* global describe, it, */
var path = require("path"),
    fs = require("fs"),
    assert = require("assert"),
    cp = require("child_process"),
    exec = cp.exec;

var dir = path.resolve(__dirname, "../");

describe("Internal limits tests", function() {
    it("Initializing Countly", function(done) {
        this.timeout(12000);
        var cmd = "node " + dir + "/test/test-inits/test-internal-limits.js";
        //execute the init code in a shell
        exec(cmd, (err) => {
            if (err) {
                return;
            }
        });
        //after init started start the tests
        setTimeout(() => {
            done();
        }, 11000);
    });
    it("Checking if events are truncated", function() {
        //read the event and request queues
        var eventQueue = fs.readFileSync(dir + "/data/__cly_event.json", "utf-8");
        //check if events are present in the queue
        //key
        assert.ok(eventQueue.includes('"key":"[CLY]_vi"'));
        assert.ok(!eventQueue.includes('"key":"[CLY]_view"'));
        //value
        assert.ok(eventQueue.includes('"name":"a very l"'));
        assert.ok(!eventQueue.includes('"name":"a very long page name"'));
        //for custom event
        assert.ok(eventQueue.includes('"key":"Enter yo"'));
        assert.ok(!eventQueue.includes('"key":"Enter your key here"'));
        //segmentation
        assert.ok(eventQueue.includes('"key of 3":"Value of"'));
        assert.ok(!eventQueue.includes('"key of 4":"Value of"'));

    });
    it("Checking if error and log reqs are truncated", ()=>{
        var requestQueue = fs.readFileSync(dir + "/data/__cly_queue.json", "utf-8");

        //line length and line per thread
        assert.ok(requestQueue.includes('"Lorem ipsu\\\\n consectet\\\\n incididun\\"'));
        assert.ok(!requestQueue.includes('"Lorem ipsu\\\\n consectet\\\\n incididun\\\\n aliqua. U\\\\n Duis aute\\"'));
        //overflown breadcrumbs
        assert.ok(!requestQueue.includes('log1'));
        assert.ok(!requestQueue.includes('log2'));
        assert.ok(!requestQueue.includes('log3'));
        assert.ok(!requestQueue.includes('log4'));
        //logged breadcrumbs
        assert.ok(requestQueue.includes('log5 too'));
        assert.ok(requestQueue.includes('log6'));
        assert.ok(requestQueue.includes('log7'));
    });
    it("Checking if user details reqs are truncated", ()=>{
        var requestQueue = fs.readFileSync(dir + "/data/__cly_queue.json", "utf-8");
        //truncated vs originals
        assert.ok(requestQueue.includes('Gottlob'));
        assert.ok(!requestQueue.includes('Gottlob Frege'));
        assert.ok(requestQueue.includes('Grundges'));
        assert.ok(!requestQueue.includes('Grundgesetze'));
        assert.ok(requestQueue.includes('test@isa'));
        assert.ok(!requestQueue.includes('test@isatest.com'));
        assert.ok(requestQueue.includes('Biallobl'));
        assert.ok(!requestQueue.includes('Bialloblotzsky'));
        assert.ok(requestQueue.includes('+4555999'));
        assert.ok(!requestQueue.includes('+4555999423'));
        //picture urls are kept intact with  an over 4000 chars threshold
        assert.ok(requestQueue.includes('https://ih0.redbubble.net/image.276305970.7419/flat,550x550,075,f.u3.jpg'));
        assert.ok(!requestQueue.includes('"https://"'));
        assert.ok(requestQueue.includes('"gender\\":\\"M\\"'));
        assert.ok(requestQueue.includes('"byear\\":1848'));
        //segmentation
        assert.ok(requestQueue.includes('"SEGkey 3\\":\\"SEGVal 3\\"'));
        assert.ok(!requestQueue.includes('"SEGkey 4\\":\\"SEGVal 4\\"'));
    });
    it("Checking if custom properties are truncated", ()=>{
        var requestQueue = fs.readFileSync(dir + "/data/__cly_queue.json", "utf-8");
        //custom properties
        //set
        assert.ok(!requestQueue.includes('name of a character'));
        assert.ok(!requestQueue.includes('Bertrand Arthur William Russell'));
        assert.ok(requestQueue.includes('"name of \\":\\"Bertrand\\"'));
        //set_once
        assert.ok(!requestQueue.includes('A galaxy far far away'));
        assert.ok(!requestQueue.includes('Called B48FF'));
        assert.ok(requestQueue.includes('"A galaxy\\"'));
        assert.ok(requestQueue.includes('"Called B\\"'));
        //increment_by
        assert.ok(!requestQueue.includes('"123456789012345\\"'));
        assert.ok(requestQueue.includes('"12345678\\"'));
        //multiply
        assert.ok(!requestQueue.includes('"234567890123456\\"'));
        assert.ok(requestQueue.includes('"23456789\\"'));
        //max
        assert.ok(!requestQueue.includes('"345678901234567\\"'));
        assert.ok(requestQueue.includes('"34567890\\"'));
        //min
        assert.ok(!requestQueue.includes('"456789012345678\\"'));
        assert.ok(requestQueue.includes('"45678901\\"'));
        //push
        assert.ok(!requestQueue.includes('"II Fernando Valdez\\"'));
        assert.ok(requestQueue.includes('"II Ferna\\"'));
        //push_unique
        assert.ok(!requestQueue.includes('"III Fernando Valdez\\"'));
        assert.ok(requestQueue.includes('"III Fern\\"'));
        //pull
        assert.ok(!requestQueue.includes('"III Fernando Valdez\\"'));
        assert.ok(requestQueue.includes('"III Fern\\"'));
    });
    it("Erasing the logs", ()=>{
        //delete the queues
        fs.unlinkSync(dir + "/data/__cly_event.json");
        fs.unlinkSync(dir + "/data/__cly_id.json");
        fs.unlinkSync(dir + "/data/__cly_queue.json");
    });
});



