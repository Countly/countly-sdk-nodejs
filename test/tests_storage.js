/* eslint-disable no-console */
/* global runthis */
const assert = require("assert");
var Countly = require("../lib/countly");
var storage = require("../lib/countly-storage");
var hp = require("./helpers/helper_functions");
var testUtils = require("./helpers/test_utils");

var appKey = "YOUR_APP_KEY";
var serverUrl = "https://your.server.ly";

const { StorageTypes } = Countly;

function shouldFilesExist(shouldExist, isCustomTest = false) {
    hp.doesFileStoragePathsExist((exists) => {
        assert.equal(shouldExist, exists);
    }, true, isCustomTest);
}
function validateStoragePathAndType(expectedStorageType, isCustomPath = false) {
    if (expectedStorageType === StorageTypes.FILE) {
        if (!isCustomPath) {
            assert.equal(storage.getStoragePath(), "../data/");
            assert.equal(storage.getStorageType(), StorageTypes.FILE);
        }
        else {
            assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
            assert.equal(storage.getStorageType(), StorageTypes.FILE);
        }
    }
    else if (expectedStorageType === StorageTypes.MEMORY) {
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(storage.getStorageType(), StorageTypes.MEMORY);
    }
    // get storage type returns null in case of a custom method
    else if (expectedStorageType === null) {
        if (!isCustomPath) {
            assert.equal(storage.getStoragePath(), "../data/");
            assert.equal(storage.getStorageType(), null);
        }
        else {
            assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
            assert.equal(storage.getStorageType(), null);
        }
    }
}
function createData() {
    // begin a session
    Countly.begin_session(true);
    // add an event
    Countly.add_event(testUtils.getEventObj());
    // add user details
    Countly.user_details(testUtils.getUserDetailsObj());
    // add crash
    Countly.track_errors();
    try {
        runthis();
    }
    catch (ex) {
        Countly.log_error(ex);
    }
}
function validateData(isCustomPath = false) {
    var beg = hp.readRequestQueue(isCustomPath)[0];
    hp.sessionRequestValidator(beg);

    var ud = hp.readRequestQueue(isCustomPath)[1];
    const isValid = hp.validateUserDetails(ud.user_details, testUtils.getUserDetailsObj());
    assert.equal(isValid, true);

    var crash = hp.readRequestQueue(isCustomPath)[2];
    hp.crashRequestValidator(crash, true);

    var ev = hp.readRequestQueue(isCustomPath)[3];
    var eventsArray = JSON.parse(ev.events);
    hp.eventValidator(testUtils.getEventObj(), eventsArray[0]);
}
/*
+---------------------------------------------------+-------------------+
| Configuration Option                              | Tested? (+/-)     |
+---------------------------------------------------+-------------------+
| 1. No Configuration Option Provided               |         +         |
+---------------------------------------------------+-------------------+
| 2. File Storage with Custom Path                  |         +         |
+---------------------------------------------------+-------------------+
| 3. File Storage with Invalid Path                 |         +         |
+---------------------------------------------------+-------------------+
| 4. File Storage while Custom Method Provided      |                   |
+---------------------------------------------------+-------------------+
| 5. Memory Storage with No Path                    |                   |
+---------------------------------------------------+-------------------+
| 6. Memory Storage with Custom Path                |                   |
+---------------------------------------------------+-------------------+
| 7. Memory Storage while Custom Method Provided    |                   |
+---------------------------------------------------+-------------------+
| 8. Custom Storage Methods with No Path            |                   |
+---------------------------------------------------+-------------------+
| 9. Custom Storage Methods with Custom Path        |                   |
+---------------------------------------------------+-------------------+
| 10. Custom Storage with Invalid Path              |                   |
+---------------------------------------------------+-------------------+
| 11. Custom Storage Methods with Invalid Methods   |                   |
+---------------------------------------------------+-------------------+
| 12. File Storage without initializing SDK         |                   |
+---------------------------------------------------+-------------------+
| 13. Memory Storage without initializing SDK       |                   |
+---------------------------------------------------+-------------------+
| 14. Custom Storage without initializing SDK       |                   |
+---------------------------------------------------+-------------------+
*/

describe("Storage Tests", () => {
    beforeEach(async() => {
        await hp.clearStorage();
    });

    // if no config option provided sdk should init storage with default settings
    // "../data/" as the storage path, FILE as the storage type
    it("1- noConfigOption", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
        });
        shouldFilesExist(true);
        validateStoragePathAndType(StorageTypes.FILE);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStoragePathAndType(StorageTypes.FILE);
            validateData();
            done();
        }, hp.mWait);
    });

    // if custom path is provided sdk should init storage with using that path
    it("2- file_cPath", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_path: "../test/customStorageDirectory/",
            storage_type: StorageTypes.FILE,
        });
        shouldFilesExist(true);
        validateStoragePathAndType(StorageTypes.FILE, true);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStoragePathAndType(StorageTypes.FILE, true);
            validateData(true);
            done();
        }, hp.mWait);
    });

    // if invalid path is provided such as null or undefined sdk should init storage with default path
    // validateStoragePathAndType checks path as "../data/" if true is not passed as second param
    it("3- file_invalidPath", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_path: undefined,
            storage_type: StorageTypes.FILE,
        });
        shouldFilesExist(true);
        validateStoragePathAndType(StorageTypes.FILE);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStoragePathAndType(StorageTypes.FILE);
            validateData();
            done();
        }, hp.mWait);
    });
});