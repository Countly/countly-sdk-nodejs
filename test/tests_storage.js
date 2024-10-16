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
    }, false, isCustomTest);
}

function validateStorageMethods() {
    storage.storeSet("cly_count", 42);
    storage.storeSet("cly_object", { key: "value" });
    storage.storeSet("cly_null", null);

    // Retrieve and assert values
    assert.equal(storage.storeGet("cly_count"), 42);
    assert.deepEqual(storage.storeGet("cly_object"), { key: "value" });
    assert.equal(storage.storeGet("cly_null"), null);
}

function validateStorageTypeAndPath(expectedStorageType, isCustomPath = false) {
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
function validateData(isCustomPath = false, isMemoryOrCustom = false) {
    var beg = hp.readRequestQueue(isCustomPath, false, isMemoryOrCustom)[0];
    hp.sessionRequestValidator(beg);

    var ud = hp.readRequestQueue(isCustomPath, false, isMemoryOrCustom)[1];
    const isValid = hp.validateUserDetails(ud.user_details, testUtils.getUserDetailsObj());
    assert.equal(isValid, true);

    var crash = hp.readRequestQueue(isCustomPath, false, isMemoryOrCustom)[2];
    hp.crashRequestValidator(crash, true);

    var ev = hp.readRequestQueue(isCustomPath, false, isMemoryOrCustom)[3];
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
| 4. File Storage while Custom Method Provided      |         +         |
+---------------------------------------------------+-------------------+
| 5. Memory Storage with No Path                    |         +         |
+---------------------------------------------------+-------------------+
| 6. Memory Storage with Custom Path                |         +         |
+---------------------------------------------------+-------------------+
| 7. Memory Storage while Custom Method Provided    |         +         |
+---------------------------------------------------+-------------------+
| 8. Custom Storage Methods with No Path            |         +         |
+---------------------------------------------------+-------------------+
| 9. Custom Storage Methods with Custom Path        |         +         |
+---------------------------------------------------+-------------------+
| 10. Custom Storage with Invalid Path              |         +         |
+---------------------------------------------------+-------------------+
| 11. Custom Storage Methods with Invalid Methods   |         +         |
+---------------------------------------------------+-------------------+
| 12. Init Storage default no SDK init              |         +         |
+---------------------------------------------------+-------------------+
| 13. File Storage with null path no SDK init       |         +         |
+---------------------------------------------------+-------------------+
| 14. File Storage with custom path no SDK init     |         +         |
+---------------------------------------------------+-------------------+
| 15. Memory Storage without no SDK init            |         +         |
+---------------------------------------------------+-------------------+
| 16. Custom Storage with null path no SDK init     |         +         |
+---------------------------------------------------+-------------------+
| 17. Custom Storage with custom path no SDK init   |         +         |
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
        validateStorageTypeAndPath(StorageTypes.FILE);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(StorageTypes.FILE);
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
        validateStorageTypeAndPath(StorageTypes.FILE, true);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(StorageTypes.FILE, true);
            validateData(true);
            done();
        }, hp.mWait);
    });

    // if invalid path is provided such as null or undefined sdk should init storage with default path
    // validateStorageTypeAndPath checks path as "../data/" if true is not passed as second param
    it("3- file_invalid_path", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_path: undefined,
            storage_type: StorageTypes.FILE,
        });
        shouldFilesExist(true);
        validateStorageTypeAndPath(StorageTypes.FILE);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(StorageTypes.FILE);
            validateData();
            done();
        }, hp.mWait);
    });

    // since a custom method is provided sdk will switch to using that
    // custom method will be applied, storage type will be null but sdk will create storage files anyway
    it("4- file_cMethod", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_type: StorageTypes.FILE,
            custom_storage_method: testUtils.getCustomStorage(),
        });
        shouldFilesExist(true);
        // storage type will be null since custom method is provided
        validateStorageTypeAndPath(null);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(null);
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // storage type will become memory, and storage files will not exist
    it("5- memory_noPath", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_type: StorageTypes.MEMORY,
        });
        shouldFilesExist(false);
        validateStorageTypeAndPath(StorageTypes.MEMORY);
        createData();

        setTimeout(() => {
            shouldFilesExist(false);
            validateStorageTypeAndPath(StorageTypes.MEMORY);
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // storage type will become memory, and storage files will not exist
    // passing storage path will not affect how storage will initialize
    it("6- memory_cPath", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_type: StorageTypes.MEMORY,
            storage_path: "../test/customStorageDirectory/",
        });
        shouldFilesExist(false);
        validateStorageTypeAndPath(StorageTypes.MEMORY);
        createData();

        setTimeout(() => {
            shouldFilesExist(false);
            validateStorageTypeAndPath(StorageTypes.MEMORY);
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // if custom method is provided with memory storage type, sdk will switch to custom method
    it("7- memory_cMethod", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            storage_type: StorageTypes.MEMORY,
            custom_storage_method: testUtils.getCustomStorage(),
        });
        shouldFilesExist(false);
        // storage type will be null since custom method is provided
        validateStorageTypeAndPath(null);
        createData();

        setTimeout(() => {
            shouldFilesExist(false);
            validateStorageTypeAndPath(null);
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // custom method is provided without any path or storage type information
    // storage files will be created and will set the path as the default but sdk will use custom methods
    it("8- custom_noPath", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            custom_storage_method: testUtils.getCustomStorage(),
        });
        shouldFilesExist(true);
        // storage type will be null since custom method is provided
        validateStorageTypeAndPath(null);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(null);
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // custom method is provided with custom path
    // sdk will set the path as the custom and sdk will use the custom methods
    it("9- custom_cPath", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            custom_storage_method: testUtils.getCustomStorage(),
            storage_path: "../test/customStorageDirectory/",
        });
        shouldFilesExist(true);
        // storage type will be null since custom method is provided
        // path will be the custom path in this case
        validateStorageTypeAndPath(null, "../test/customStorageDirectory/");
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(null, "../test/customStorageDirectory/");
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // custom storage method with invalid storage path
    // sdk will not try to initialize the storage with invalid path and return to the default path
    // storage files will exist, type will be null and use custom methods
    it("10- custom_invalid_path", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            custom_storage_method: testUtils.getCustomStorage(),
            storage_path: undefined,
        });
        shouldFilesExist(true);
        // storage type will be null since custom method is provided
        validateStorageTypeAndPath(null);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(null);
            validateData(false, true);
            done();
        }, hp.mWait);
    });

    // custom storage method with invalid methods
    // sdk should not use the invalid methods and switch back to file storage
    it("11- custom_invalid_cMethod", (done) => {
        Countly.init({
            app_key: appKey,
            url: serverUrl,
            custom_storage_method: testUtils.getInvalidStorage(),
        });
        shouldFilesExist(true);
        // storage type will be null since custom method is provided
        validateStorageTypeAndPath(StorageTypes.FILE);
        createData();

        setTimeout(() => {
            shouldFilesExist(true);
            validateStorageTypeAndPath(StorageTypes.FILE);
            validateData();
            done();
        }, hp.mWait);
    });

    // initStorage method without any parameters
    // storage should initialize correctly and be ready to use
    it("12- initStorage_noParams_noInit", (done) => {
        storage.initStorage();
        shouldFilesExist(true);
        // storage type will be File since it's default
        validateStorageTypeAndPath(StorageTypes.FILE);
        validateStorageMethods();
        done();
    });

    // initStorage method with File storage type and null path
    // storage should initialize correctly with default path
    it("13- initStorage_file_nullPath_noInit", (done) => {
        storage.initStorage(null, StorageTypes.FILE);
        shouldFilesExist(true);
        // storage type will be File since it's default
        validateStorageTypeAndPath(StorageTypes.FILE);
        validateStorageMethods();
        done();
    });

    // initStorage method with File storage type and custom path
    // storage should initialize correctly with custom path
    it("14- initStorage_file_cPath_noInit", (done) => {
        storage.initStorage("../test/customStorageDirectory/", StorageTypes.FILE);
        shouldFilesExist(true);
        // storage type will be File since it's default
        validateStorageTypeAndPath(StorageTypes.FILE, true);
        validateStorageMethods();
        done();
    });

    // initStorage method with memory storage type and null path
    // storage should initialize correctly with memory storage
    it("15- initStorage_memory_noInit", (done) => {
        storage.initStorage(null, StorageTypes.MEMORY);
        shouldFilesExist(false);
        validateStorageTypeAndPath(StorageTypes.MEMORY);
        validateStorageMethods();
        done();
    });

    // initStorage method with custom storage method and null path
    it("16- initStorage_custom_nullPath_noInit", (done) => {
        storage.initStorage(null, null, false, testUtils.getCustomStorage());
        shouldFilesExist(true);
        validateStorageTypeAndPath(null);
        validateStorageMethods();
        done();
    });

    // initStorage method with custom storage method and custom path
    it("17- initStorage_custom_cPath_noInit", (done) => {
        storage.initStorage("../test/customStorageDirectory/", null, false, testUtils.getCustomStorage());
        shouldFilesExist(true);
        validateStorageTypeAndPath(null, true);
        validateStorageMethods();
        done();
    });
});