const assert = require("assert");
var Countly = require("../lib/countly");
var storage = require("../lib/countly-storage");
var cc = require("../lib/countly-common");
var hp = require("./helpers/helper_functions");

const StorageTypes = cc.storageTypeEnums;

var __data = {};
const customMemoryStorage = {
    storeSet: function(key, value, callback) {
        if (key) {
            __data[key] = value;
            if (typeof callback === "function") {
                callback(null);
            }
        }
    },
    storeGet: function(key, def) {
        return typeof __data[key] !== "undefined" ? __data[key] : def;
    },
    storeRemove: function(key) {
        delete __data[key];
    },
};

var setGetRemoveCustomValue = function() {
    storage.storeSet("CustomKey", "CustomValue");
    assert.equal(storage.storeGet("CustomKey", null), "CustomValue");
    storage.storeRemove("CustomKey");
    assert.equal(storage.storeGet("CustomKey", null), null);
};

var ValidateID_IDType = function(devGivenId = null) {
    if (!devGivenId) {
        var storedId = storage.storeGet("cly_id");
        var storedIdType = storage.storeGet("cly_id_type");
        assert.equal(Countly.get_device_id(), storedId);
        assert.equal(Countly.get_device_id_type(), storedIdType);
    }
    else {
        assert.equal(Countly.get_device_id(), devGivenId);
        assert.equal(Countly.get_device_id_type(), cc.deviceIdTypeEnums.DEVELOPER_SUPPLIED);
    }
};

describe("Storage Tests", () => {
    // validates if performing storage operations without initializing the SDK is possible with file storage methods
    // without initializing SDK, storage should be able to set, get and remove values in file storage
    it("1- File Storage with No-Init", (done) => {
        hp.clearStorage();
        storage.initStorage();
        assert.equal(StorageTypes.FILE, storage.getStorageType());
        setGetRemoveCustomValue();
        done();
    });

    // validates if performing storage operations without initializing the SDK is possible with memory storage methods
    // without initializing SDK, storage should be able to set, get and remove values in memory storage
    it("2- Memory Storage with No-Init", (done) => {
        hp.clearStorage();
        storage.initStorage(null, StorageTypes.MEMORY);
        assert.equal(StorageTypes.MEMORY, storage.getStorageType());
        assert.equal(undefined, storage.getStoragePath());
        setGetRemoveCustomValue();
        done();
    });

    // validates if performing storage operations without initializing the SDK is possible with custom storage methods
    // without initializing SDK, storage should be able to set, get and remove values in memory storage
    it("3- Custom Storage with No-Init", (done) => {
        hp.clearStorage();
        storage.initStorage(null, null, false, false, customMemoryStorage);
        assert.equal(null, storage.getStorageType());
        assert.equal(undefined, storage.getStoragePath());
        setGetRemoveCustomValue();
        __data = {};
        done();
    });

    // validates the functionality for the configuration time storage options
    // sets to file storage with default path and methods during configuration time
    it("4- Config Time Storage Options with Default File Storage", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            storage_type: StorageTypes.FILE, // for file storage this is not needed, for the readiblitiy purposes it's here
        });
        assert.equal(StorageTypes.FILE, storage.getStorageType());
        assert.equal(storage.getStoragePath(), "../data/");
        setGetRemoveCustomValue();
        ValidateID_IDType();
        done();
    });

    // validates the functionality for the configuration time storage options
    // sets to memory storage with default methods during configuration time
    it("5- Config Time Storage Options with Default Memory Storage", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            storage_type: StorageTypes.MEMORY,
        });
        assert.equal(StorageTypes.MEMORY, storage.getStorageType());
        assert.equal(storage.getStoragePath(), undefined);
        setGetRemoveCustomValue();
        ValidateID_IDType();
        done();
    });

    // validates the functionality for the configuration time storage options
    // sets to custom storage during configuration time
    it("6- Config Time Storage Options with Custom Storage", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            custom_storage_method: customMemoryStorage,
        });
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(null, storage.getStorageType());
        setGetRemoveCustomValue();
        ValidateID_IDType();
        __data = {};
        done();
    });

    // validates the recording of device id correctly if provided by developer
    // all validations should succeed like DeviceId, Value recording etc.
    it("7- File Storage Init with Dev Supplied Device ID", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            device_id: "ID",
            storage_type: StorageTypes.FILE, // for file storage this is not needed, for the readiblitiy purposes it's here
        });
        assert.equal(StorageTypes.FILE, storage.getStorageType());
        setGetRemoveCustomValue();
        ValidateID_IDType("ID");
        done();
    });

    // validates the recording of device id correctly if provided by developer
    // all validations should succeed like DeviceId, Value recording etc.
    it("8- Memory Storage Init with Dev Supplied Device ID", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            device_id: "ID2",
            storage_type: StorageTypes.MEMORY,
        });
        assert.equal(storage.getStoragePath(), undefined);
        assert.equal(StorageTypes.MEMORY, storage.getStorageType());
        setGetRemoveCustomValue();
        ValidateID_IDType("ID2");
        done();
    });

    // validates the recording of device id correctly if provided by developer
    // all validations should succeed like DeviceId, Value recording etc.
    it("9- Custom Storage Init with Dev Supplied Device ID", (done) => {
        hp.clearStorage();
        Countly.init({
            app_key: "YOUR_APP_KEY",
            url: "https://try.count.ly",
            device_id: "ID3",
            custom_storage_method: customMemoryStorage,
        });
        setGetRemoveCustomValue();
        ValidateID_IDType("ID3");
        done();
    });
});