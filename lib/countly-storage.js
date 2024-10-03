const fs = require('fs');
const path = require('path');
var cc = require("./countly-common");

var storagePath;
var __data = {};
var defaultPath = "../data/"; // Default path
var defaultBulkPath = "../bulk_data/"; // Default path
var asyncWriteLock = false;
var asyncWriteQueue = [];
let storageMethod = {};
const StorageTypes = cc.storageTypeEnums;

// Memory-only storage methods
const memoryStorage = {
    /**
     *  Save value in memory
     *  @param {String} key - key for value to store
     *  @param {varies} value - value to store
     *  @param {Function} callback - callback to call when done storing
     */
    storeSet: function(key, value, callback) {
        if (key) {
            cc.log(cc.logLevelEnums.DEBUG, `storeSet, Setting key: [${key}] & value: [${value}]!`);
            __data[key] = value;
            if (typeof callback === "function") {
                callback(null);
            }
        }
        else {
            cc.log(cc.logLevelEnums.WARNING, `storeSet, Provioded key: [${key}] is null!`);
        }
    },
    /**
     *  Get value from memory
     *  @param {String} key - key of value to get
     *  @param {varies} def - default value to use if not set
     *  @returns {varies} value for the key
     */
    storeGet: function(key, def) {
        cc.log(cc.logLevelEnums.DEBUG, `storeGet, Fetching item from memory with key: [${key}].`);
        return typeof __data[key] !== "undefined" ? __data[key] : def;
    },
    /**
     *  Remove value from memory
     *  @param {String} key - key of value to remove
     */
    storeRemove: function(key) {
        delete __data[key];
    },
};

// File storage methods
const fileStorage = {
    /**
     *  Save value in storage
     *  @param {String} key - key for value to store
     *  @param {varies} value - value to store
     *  @param {Function} callback - callback to call when done storing
     */
    storeSet: function(key, value, callback) {
        __data[key] = value;
        if (!asyncWriteLock) {
            asyncWriteLock = true;
            writeFile(key, value, callback);
        }
        else {
            asyncWriteQueue.push([key, value, callback]);
        }
    },
    /**
     *  Get value from storage
     *  @param {String} key - key of value to get
     *  @param {varies} def - default value to use if not set
     *  @returns {varies} value for the key
     */
    storeGet: function(key, def) {
        cc.log(cc.logLevelEnums.DEBUG, `storeGet, Fetching item from storage with key: [${key}].`);
        if (typeof __data[key] === "undefined") {
            var ob = readFile(key);
            var obLen;
            // check if the 'read object' is empty or not
            try {
                obLen = Object.keys(ob).length;
            }
            catch (error) {
                // if we can not even asses length set it to 0 so we can return the default value
                obLen = 0;
            }

            // if empty or falsy set default value
            if (!ob || obLen === 0) {
                __data[key] = def;
            }
            // else set the value read file has
            else {
                __data[key] = ob[key];
            }
        }
        return __data[key];
    },
    storeRemove: function(key) {
        delete __data[key];
        var filePath = path.resolve(__dirname, `${getStoragePath()}__${key}.json`);
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

/**
 * Sets the storage method, by default sets file storage and storage path.
 * @param {String} userPath - User provided storage path
 * @param {StorageTypes} storageType - Whether to use memory only storage or not
 * @param {Boolean} isBulk - Whether the storage is for bulk data
 * @param {Boolean} persistQueue - Whether to persist the queue until processed
 * @param {varies} customStorageMethod - Storage methods provided by the user
 */
var initStorage = function(userPath, storageType, isBulk = false, persistQueue = false, customStorageMethod = null) {
    if (storageType === StorageTypes.MEMORY) {
        storageMethod = memoryStorage;
    }
    else if (storageType === StorageTypes.CUSTOM) {
        if (customStorageMethod) {
            storageMethod = customStorageMethod;
        }
        else {
            cc.log(cc.logLevelEnums.WARNING, `Provided Custom Storage Methods are not valid. Switching to default file storage!`);
            storageMethod = fileStorage;
            setStoragePath(userPath, isBulk, persistQueue);
        }
    }
    else {
        storageMethod = fileStorage;
        setStoragePath(userPath, isBulk, persistQueue);
    }
};

/**
 * Sets the storage path, defaulting to a specified path if none is provided.
 * @param {String} userPath - User provided storage path
 * @param {Boolean} isBulk - Whether the storage is for bulk data
 * @param {Boolean} persistQueue - Whether to persist the queue until processed
 */
var setStoragePath = function(userPath, isBulk = false, persistQueue = false) {
    storagePath = userPath || (isBulk ? defaultBulkPath : defaultPath);

    if (!isBulk || persistQueue) {
        createDirectory(path.resolve(__dirname, storagePath));
    }
};

/**
 * Returns the current storage path
 * @returns {String} storagePath
 */
var getStoragePath = function() {
    return storagePath;
};

/**
 * Creates a directory if it doesn't exist
 * @param {String} dir - The directory path
 */
var createDirectory = function(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    catch (ex) {
        cc.log(cc.logLevelEnums.ERROR, `Failed to create directory at ${dir}: ${ex.stack}`);
    }
};

/**
 * Resets storage-related variables to their initial state
 */
var resetStorage = function() {
    storagePath = undefined;
    __data = {};
    asyncWriteLock = false;
    asyncWriteQueue = [];
};

/**
 *  Read value from file
 *  @param {String} key - key for file
 *  @returns {varies} value in file
 */
var readFile = function(key) {
    var dir = path.resolve(__dirname, `${getStoragePath()}__${key}.json`);
    // try reading data file
    var data;
    try {
        data = fs.readFileSync(dir, 'utf8'); // read file as string
    }
    catch (ex) {
        // there was no file, probably new init
        cc.log(cc.logLevelEnums.WARN, `readFile, File not found for key: [${key}]. Returning null.`);
        return null; // early exit if file doesn't exist
    }

    // early exit if file is empty or whitespace
    if (!data.trim()) {
        cc.log(cc.logLevelEnums.WARN, `readFile, File is empty or contains only whitespace for key: [${key}]. Returning null.`);
        return null;
    }

    try {
        // trying to parse json string
        data = JSON.parse(data);
    }
    catch (ex) {
        // problem parsing, corrupted file?
        cc.log(cc.logLevelEnums.ERROR, `readFile, Failed to parse the file with key: [${key}]. Error: [${ex}].`);
        // backup corrupted file data
        fs.writeFile(path.resolve(__dirname, `${getStoragePath()}__${key}.${cc.getTimestamp()}${Math.random()}.json`), data, () => { });
        // start with new clean object
        return null; // return null in case of corrupted data
    }
    return data;
};

/**
 *  Force store data synchronously on unrecoverable errors to preserve it for next launch
 */
var forceStore = function() {
    for (var i in __data) {
        var dir = path.resolve(__dirname, `${getStoragePath()}__${i}.json`);
        var ob = {};
        ob[i] = __data[i];
        try {
            fs.writeFileSync(dir, JSON.stringify(ob));
        }
        catch (ex) {
            // tried to save whats possible
            cc.log(cc.logLevelEnums.ERROR, `forceStore, Saving files failed. Error: [${ex}].`);
        }
    }
};

/**
 *  Write to file and process queue while in asyncWriteLock
 *  @param {String} key - key for value to store
 *  @param {varies} value - value to store
 *  @param {Function} callback - callback to call when done storing
 */
var writeFile = function(key, value, callback) {
    var ob = {};
    ob[key] = value;
    var dir = path.resolve(__dirname, `${getStoragePath()}__${key}.json`);
    fs.writeFile(dir, JSON.stringify(ob), (err) => {
        if (err) {
            cc.log(cc.logLevelEnums.ERROR, `writeFile, Writing files failed. Error: [${err}].`);
        }
        if (typeof callback === "function") {
            callback(err);
        }
        if (asyncWriteQueue.length) {
            setTimeout(() => {
                var arr = asyncWriteQueue.shift();
                cc.log(cc.logLevelEnums.DEBUG, "writeFile, Dequeued array:", arr);
                if (arr) {
                    writeFile(arr[0], arr[1], arr[2]);
                }
            }, 0);
        }
        else {
            asyncWriteLock = false;
        }
    });
};

var storeSet = function(key, value, callback) {
    storageMethod.storeSet(key, value, callback);
};

var storeGet = function(key, def) {
    return storageMethod.storeGet(key, def);
};

var storeRemove = function(key) {
    storageMethod.storeRemove(key);
};

/**
 * Disclaimer: This method is mainly for testing purposes.
 * @returns {StorageTypes} Returns the active storage type for the SDK
 */
var getStorageType = function() {
    if (storageMethod === memoryStorage) {
        return StorageTypes.MEMORY;
    }
    return StorageTypes.FILE;
};

module.exports = {
    initStorage,
    storeSet,
    storeGet,
    storeRemove,
    writeFile,
    forceStore,
    getStoragePath,
    setStoragePath,
    resetStorage,
    readFile,
    getStorageType,
};