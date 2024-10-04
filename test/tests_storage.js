const fs = require('fs');
const path = require('path');

const assert = require("assert");
var Countly = require("../lib/countly");
var storage = require("../lib/countly-storage");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

const StorageTypes = cc.storageTypeEnums;

// example event object to use 
var eventObj = {
    key: "storage_check",
    count: 5,
    sum: 3.14,
    dur: 2000,
    segmentation: {
        app_version: "1.0",
        country: "Zambia",
    },
};

var userDetailObj = {
    name: "Akira Kurosawa",
    username: "a_kurosawa",
    email: "akira.kurosawa@filmlegacy.com",
    organization: "Toho Studios",
    phone: "+81312345678",
    picture: "https://example.com/profile_images/akira_kurosawa.jpg",
    gender: "Male",
    byear: 1910,
    custom: {
        "known for": "Film Director",
        "notable works": "Seven Samurai, Rashomon, Ran",
    },
};

// init function
function initMain(device_id) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://test.url.ly",
        interval: 10000,
        max_events: -1,
        device_id: device_id,
    });
}
// TODO: move these to helpers to reduce duplication
function validateSdkGeneratedId(providedDeviceId) {
    assert.ok(providedDeviceId);
    assert.equal(providedDeviceId.length, 36);
    assert.ok(cc.isUUID(providedDeviceId));
}
function checkRequestsForT(queue, expectedInternalType) {
    for (var i = 0; i < queue.length; i++) {
        assert.ok(queue[i].t);
        assert.equal(queue[i].t, expectedInternalType);
    }
}
function validateDeviceId(deviceId, deviceIdType, expectedDeviceId, expectedDeviceIdType) {
    var rq = hp.readRequestQueue()[0];
    if (expectedDeviceIdType === cc.deviceIdTypeEnums.SDK_GENERATED) {
        validateSdkGeneratedId(deviceId); // for SDK-generated IDs
    }
    else {
        assert.equal(deviceId, expectedDeviceId); // for developer-supplied IDs
    }
    assert.equal(deviceIdType, expectedDeviceIdType);
    checkRequestsForT(rq, expectedDeviceIdType);
}
function recordValuesToStorageAndValidate(userPath, memoryOnly = false, isBulk = false, persistQueue = false) {
    // Set values
    var deviceIdType = cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED;
    storage.initStorage(userPath, memoryOnly, isBulk, persistQueue);
    storage.storeSet("cly_id", "SpecialDeviceId");
    storage.storeSet("cly_id_type", deviceIdType);

    // Set values with different data types
    storage.storeSet("cly_count", 42);
    storage.storeSet("cly_object", { key: "value" });
    storage.storeSet("cly_null", null);

    // Retrieve and assert values
    assert.equal(storage.storeGet("cly_id"), "SpecialDeviceId");
    assert.equal(storage.storeGet("cly_id_type"), deviceIdType);
    assert.equal(storage.storeGet("cly_count"), 42);
    assert.deepEqual(storage.storeGet("cly_object"), { key: "value" });
    assert.equal(storage.storeGet("cly_null"), null);

    // Remove specific items by overriding with null or empty array
    storage.storeSet("cly_id", null);
    storage.storeSet("cly_object", []);
    assert.equal(storage.storeGet("cly_id"), null);
    assert.deepEqual(storage.storeGet("cly_object"), []);

    // Reset storage and check if it's empty again
    storage.resetStorage();
    assert.equal(storage.storeGet("cly_id"), undefined);
    assert.equal(storage.storeGet("cly_id_type"), undefined);
    assert.equal(storage.storeGet("cly_count"), undefined);
    assert.equal(storage.storeGet("cly_object"), undefined);
    assert.equal(storage.storeGet("cly_null"), undefined);
}
var __data = {};
var asyncWriteLock = false;
var asyncWriteQueue = [];
// technically same as defualt file storage method
// adds * before any value set so it can be separated with the default one for testing purposes
const customFileStorage = {
    storeSet: function(key, value, callback) {
        // Add '*' before the value
        __data[key] = `*${value}`;
        if (!asyncWriteLock) {
            asyncWriteLock = true;
            storage.writeFile(key, value, callback);
        }
        else {
            asyncWriteQueue.push([key, value, callback]);
        }
    },
    storeGet: function(key, def) {
        cc.log(cc.logLevelEnums.DEBUG, `storeGet, Fetching item from storage with key: [${key}].`);
        if (typeof __data[key] === "undefined") {
            var ob = storage.readFile(key);
            var obLen;
            try {
                obLen = Object.keys(ob).length;
            }
            catch (error) {
                obLen = 0;
            }
            if (!ob || obLen === 0) {
                __data[key] = def;
            }
            else {
                __data[key] = ob[key];
            }
        }
        return __data[key];
    },
    storeRemove: function(key) {
        delete __data[key];
        var filePath = path.resolve(__dirname, `${storage.getStoragePath()}__${key}.json`);
        fs.access(filePath, fs.constants.F_OK, (accessErr) => {
            if (accessErr) {
                cc.log(cc.logLevelEnums.WARNING, `storeRemove, No file found with key: [${key}]. Nothing to remove.`);
                return;
            }
            fs.unlink(filePath, (err) => {
                if (err) {
                    cc.log(cc.logLevelEnums.ERROR, `storeRemove, Failed to remove file with key: [${key}]. Error: [${err.message}].`);
                }
                else {
                    cc.log(cc.logLevelEnums.INFO, `storeRemove, Successfully removed file with key: [${key}].`);
                }
            });
        });
    },
};
const nonValidStorageMethods = {
    _storage: {},

    setInvalid: function(key, value, callback) {
        if (key) {
            const existingValue = this._storage[key];
            if (typeof value === 'string' && typeof existingValue === 'string') {
                this._storage[key] = existingValue + value;
            }
            else {
                this._storage[key] = value;
            }
            if (typeof callback === "function") {
                callback(null);
            }
        }
    },
    getInvalid: function(key, def) {
        const value = this._storage[key];
        if (typeof value === 'string') {
            return value.split('').reverse().join('');
        }

        return value !== undefined ? value : def;
    },
    removeInvalid: function(key) {
        delete this._storage[key];
    },
};
const funkyMemoryStorage = {
    _storage: {},

    storeSet: function(key, value, callback) {
        if (key) {
            const existingValue = this._storage[key];
            if (typeof value === 'string' && typeof existingValue === 'string') {
                this._storage[key] = existingValue + value;
            }
            else {
                this._storage[key] = value;
            }
            if (typeof callback === "function") {
                callback(null);
            }
        }
    },
    storeGet: function(key, def) {
        const value = this._storage[key];
        if (typeof value === 'string') {
            return value.split('').reverse().join('');
        }

        return value !== undefined ? value : def;
    },
    storeRemove: function(key) {
        delete this._storage[key];
    },
};
const customMemoryStorage = {
    _storage: {},
    storeSet: function(key, value, callback) {
        if (key) {
            this._storage[key] = value;
            if (typeof callback === "function") {
                callback(null);
            }
        }
    },
    storeGet: function(key, def) {
        return typeof this._storage[key] !== "undefined" ? this._storage[key] : def;
    },
    storeRemove: function(key) {
        delete this._storage[key];
    },
};

describe("Storage Tests", () => {
    it("1- Store Generated Device ID", (done) => {
        // clear previous data
        hp.clearStorage();
        // initialize SDK
        initMain();
        Countly.begin_session();
        // read request queue
        setTimeout(() => {
            validateSdkGeneratedId(Countly.get_device_id());
            done();
        }, hp.sWait);
    });

    it("1.1- Validate generated device id after process restart", (done) => {
        initMain();
        validateDeviceId(Countly.get_device_id(), Countly.get_device_id_type(), undefined, cc.deviceIdTypeEnums.SDK_GENERATED);
        done();
    });

    it("2.Developer supplied device ID", (done) => {
        hp.clearStorage();
        initMain("ID");
        Countly.begin_session();
        setTimeout(() => {
            validateDeviceId(Countly.get_device_id(), Countly.get_device_id_type(), "ID", cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
            done();
        }, hp.sWait);
    });

    it("2.1- Validate generated device id after process restart", (done) => {
        validateDeviceId(Countly.get_device_id(), Countly.get_device_id_type(), "ID", cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
        done();
    });

    it("3- Record and validate all user details", (done) => {
        hp.clearStorage();
        initMain();
        Countly.user_details(userDetailObj);
        setTimeout(() => {
            var req = hp.readRequestQueue()[0];
            hp.userDetailRequestValidator(userDetailObj, req);
            done();
        }, hp.sWait);
    });

    it("3.1- Validate stored user detail", (done) => {
        var req = hp.readRequestQueue()[0];
        hp.userDetailRequestValidator(userDetailObj, req);
        done();
    });

    it("4- Record event and validate storage", (done) => {
        hp.clearStorage();
        initMain();
        Countly.add_event(eventObj);
        setTimeout(() => {
            var storedEvents = hp.readEventQueue();
            assert.strictEqual(storedEvents.length, 1, "There should be exactly one event stored");

            var event = storedEvents[0];
            hp.eventValidator(eventObj, event);
            done();
        }, hp.mWait);
    });

    it("4.1- Validate event persistence after process restart", (done) => {
        // Initialize SDK
        initMain();

        // Read stored events without clearing storage
        var storedEvents = hp.readEventQueue();
        assert.strictEqual(storedEvents.length, 1, "There should be exactly one event stored");

        var event = storedEvents[0];
        hp.eventValidator(eventObj, event);
        done();
    });

    // if storage path is not provided it will be default "../data/"
    it("5- Not provide storage path during init", (done) => {
        hp.clearStorage();
        initMain();
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    // if set to undefined it should be set to default path
    it("6- Set storage path to undefined", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            storage_path: undefined,
        });
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    // if set to null it should be set to default path
    it("7- Set storage path to null", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            storage_path: null,
        });
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    // it should be set to the custom directory if provided
    it("8- Set storage path to custom directory", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            interval: 10000,
            max_events: -1,
            storage_path: "../test/customStorageDirectory/",
        });
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        done();
    });

    // resets the storage path to default and validates that it is set correctly, 
    // then resets it to undefined and confirms the reset.
    it("9- Reset Storage While on Default Path /no-init", (done) => {
        // will set to default storage path
        storage.setStoragePath();
        assert.equal(storage.getStoragePath(), "../data/");
        // will set to undefined
        storage.resetStorage();
        assert.equal(storage.getStoragePath(), undefined);
        done();
    });

    // sets the storage path to default and verifies it, 
    // then records values to storage and ensures they are stored correctly.
    it("10- Recording to Storage with Default Storage Path /no-init", (done) => {
        storage.resetStorage();
        // Set to default storage path
        storage.setStoragePath();
        assert.equal(storage.getStoragePath(), "../data/");
        recordValuesToStorageAndValidate();
        done();
    });

    // sets a custom storage path and verifies it, 
    // then records values to storage and ensures correct storage in the custom path.
    it("11- Recording to Storage with Custom Storage Path /no-init", (done) => {
        storage.resetStorage();
        // will set to default storage path
        storage.setStoragePath("../test/customStorageDirectory/");
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        recordValuesToStorageAndValidate("../test/customStorageDirectory/");
        done();
    });

    // sets the storage path to the default bulk storage path and verifies it,
    // then records values to bulk storage and validates proper storage in bulk mode.
    it("12- Recording to Bulk Storage with Default Bulk Data Path /no-init", (done) => {
        storage.resetStorage();
        // will set to default storage path
        // To set the storage path to the default bulk storage path and persist the queue
        storage.setStoragePath(null, true, true);
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        recordValuesToStorageAndValidate(null, false, true, true);
        done();
    });

    // sets a custom bulk storage path and verifies it, 
    // then records values to bulk storage and ensures proper recording to the custom path.
    it("13- Recording to Bulk Storage with Custom Bulk Storage Path /no-init", (done) => {
        storage.resetStorage();
        // will set to default storage path
        storage.setStoragePath("../test/customStorageDirectory/", true);
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        recordValuesToStorageAndValidate("../test/customStorageDirectory/", false, true);
        done();
    });

    it("14- Setting storage path to default path via initStorage /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage();
        assert.equal(storage.getStoragePath(), "../data/");
        done();
    });

    it("15- Setting bulk storage path to default path via initStorage /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage(null, false, true);
        assert.equal(storage.getStoragePath(), "../bulk_data/");
        done();
    });

    it("16- Setting custom storage path via initStorage /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage("../test/customStorageDirectory/");
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        done();
    });

    it("17- Setting storage method to memory only and checking storage path /no-init", (done) => {
        storage.resetStorage();
        storage.initStorage(null, StorageTypes.MEMORY);
        assert.equal(storage.getStoragePath(), undefined);
        done();
    });

    // recording device-id in memory only mode
    // initializes the SDK in memory only mode, validates that file storage files does not exist
    // retrieve the developer supplied device id and id type from storage
    it("18- Memory only storage Device-Id", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.MEMORY,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(storage.storeGet("cly_id", null), "Test-Device-Id");
        assert.equal(storage.storeGet("cly_id_type", null), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
        done();
    });

    // recording event in memory only mode
    // initializes the SDK in memory only mode, validates that file storage files does not exist
    // records an event and validates the recorded event
    it("19- Record event in memory only mode and validate the record", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.MEMORY,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        Countly.add_event(eventObj);
        setTimeout(() => {
            const storedData = storage.storeGet("cly_queue", null);
            const eventArray = JSON.parse(storedData[0].events);
            const eventFromQueue = eventArray[0];
            hp.eventValidator(eventObj, eventFromQueue);
            done();
        }, hp.mWait);
    });

    // recording user details in memory only mode
    // initializes the SDK in memory only mode, validates that file storage files does not exist
    // records user details and validates the recorded details
    it("20- Record and validate user details in memory only mode", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.MEMORY,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        Countly.user_details(userDetailObj);
        const storedData = storage.storeGet("cly_queue", null);
        const userDetailsReq = storedData[0];
        hp.userDetailRequestValidator(userDetailObj, userDetailsReq);
        done();
    });

    // tests device id changes in memory only storage
    // initialize the SDK in memory only mode, check the device id and switch it
    // SDK and storage should function properly
    it("21- Memory only storage, change SDK Generated Device-Id", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            clear_stored_device_id: true,
            storage_type: StorageTypes.MEMORY,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(storage.storeGet("cly_id", null), Countly.get_device_id());
        assert.equal(storage.storeGet("cly_id_type", null), Countly.get_device_id_type());

        Countly.change_id("Test-Id-2");
        assert.equal(storage.storeGet("cly_id", null), "Test-Id-2");
        assert.equal(storage.storeGet("cly_id_type", null), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
        done();
    });

    // tests switching between storage types after initializing SDK
    // passing memory storage type during init and initializing storage afterwards
    // SDK should switch to file storage
    it("22- Switch to file storage after init", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            clear_stored_device_id: true,
            storage_type: StorageTypes.MEMORY,
        });
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(storage.getStorageType(), StorageTypes.MEMORY);
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });

        storage.initStorage();
        assert.equal(storage.getStoragePath(), "../data/");
        assert.equal(storage.getStorageType(), StorageTypes.FILE);
        done();
    });

    // tests storeRemove function in CountlyStorage
    // after initializing the memory storage, without initializing SDK, attempts to set, get and remove values
    // without initializing SDK storage should function properly
    it("23- storeRemove Memory Only /no-init", (done) => {
        hp.clearStorage();
        storage.initStorage(null, StorageTypes.MEMORY);
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(storage.getStorageType(), StorageTypes.MEMORY);
        storage.storeSet("keyToStore", "valueToStore");
        assert.equal(storage.storeGet("keyToStore", null), "valueToStore");

        storage.storeRemove("keyToStore");
        assert.equal(storage.storeGet("keyToStore", null), null);
        done();
    });

    // tests storeRemove function in CountlyStorage
    // after initializing the file storage, without initializing SDK attempts to set, get and remove values
    // without initializing SDK storage should function properly
    it("24- storeRemove File Storage /no-init", (done) => {
        hp.clearStorage();
        storage.initStorage();
        assert.equal(storage.getStoragePath(), "../data/");
        assert.equal(storage.getStorageType(), StorageTypes.FILE);
        storage.storeSet("keyToStore", "valueToStore");
        assert.equal(storage.storeGet("keyToStore", null), "valueToStore");

        storage.storeRemove("keyToStore");
        assert.equal(storage.storeGet("keyToStore", null), null);
        done();
    });

    // tests init time storage config options
    // choosing Custom storage type and passing null in storage methods
    // passing null as storage method ends up with switching to default file storage
    it("25- Null Custom Storage Method", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.CUSTOM,
            custom_storage_method: null,
        });
        assert.equal(storage.getStoragePath(), "../data/");
        assert.equal(storage.getStorageType(), StorageTypes.FILE);
        done();
    });

    // tests init time storage config options
    // choosing Custom storage type and passing custom storage methods
    // SDK should use custom methods as storage method, no File Storage should exist
    it("26- Providing Custom Storage Method", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.CUSTOM,
            custom_storage_method: customMemoryStorage,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        done();
    });

    // tests init time storage config options
    // Recording values in Custom Storage Methods
    // SDK should use custom methods as storage methods and values should be recorded correctly
    it("27- Record/Remove Values in Custom Storage Method", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.CUSTOM,
            custom_storage_method: customMemoryStorage,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        storage.storeSet("CustomStorageKey", "CustomStorageValue");
        assert.equal(storage.storeGet("CustomStorageKey", null), "CustomStorageValue");
        storage.storeRemove("CustomStorageKey");
        assert.equal(storage.storeGet("CustomStorageKey", null), null);
        done();
    });

    // tests init time storage config options
    // passes a funky storage method, which does store get as reversing string
    // SDK should use custom methods as storage method
    it("28- Record/Remove Values in Other Custom Storage Method", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.CUSTOM,
            custom_storage_method: funkyMemoryStorage,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        storage.storeSet("CustomStorageKey", "CustomStorageValue");
        storage.storeSet("CustomStorageKey", "CustomStorageValue2");
        assert.equal("2eulaVegarotSmotsuCeulaVegarotSmotsuC", storage.storeGet("CustomStorageKey", null));
        done();
    });

    // tests init time storage config options
    // choosing Custom storage type and passing invalid custom storage methods
    // SDK should not use custom methods as storage method, and switch to File Storage
    it("29- Providing Invalid Custom Storage Method", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_type: StorageTypes.CUSTOM,
            custom_storage_method: nonValidStorageMethods,
        });
        assert.equal(storage.getStoragePath(), "../data/");
        assert.equal(storage.getStorageType(), StorageTypes.FILE);
        done();
    });

    // tests init time storage config options
    // choosing Custom storage type and passing custom file storage methods
    // SDK should use custom methods as storage methods
    it("30- Providing File Custom Storage Method", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://test.url.ly",
            device_id: "Test-Device-Id",
            clear_stored_device_id: true,
            storage_path: "../test/customStorageDirectory/",
            storage_type: StorageTypes.CUSTOM,
            custom_storage_method: customFileStorage,
        });
        hp.doesFileStoragePathsExist((exists) => {
            assert.equal(false, exists);
        });
        assert.equal(storage.getStoragePath(), "../test/customStorageDirectory/");
        storage.storeSet("CustomStorageKey", "CustomStorageValue");
        assert.equal(storage.storeGet("CustomStorageKey", null), "*CustomStorageValue");
        storage.storeRemove("CustomStorageKey");
        assert.equal(storage.storeGet("CustomStorageKey", null), null);
        done();
    });
});