const fs = require('fs');
const path = require('path');
var cc = require("./countly-common");

var storagePath;
var __data = {};
var defaultPath = "../data/"; // Default path
var defaultBulkPath = "../bulk_data/"; // Default path
var asyncWriteLock = false;
var asyncWriteQueue = [];

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
        data = fs.readFileSync(dir);
    }
    catch (ex) {
        // there was no file, probably new init
        data = null;
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
        data = null;
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

/**
 *  Save value in storage
 *  @param {String} key - key for value to store
 *  @param {varies} value - value to store
 *  @param {Function} callback - callback to call when done storing
 */
var storeSet = function(key, value, callback) {
    __data[key] = value;
    if (!asyncWriteLock) {
        asyncWriteLock = true;
        writeFile(key, value, callback);
    }
    else {
        asyncWriteQueue.push([key, value, callback]);
    }
};

/**
 *  Get value from storage
 *  @param {String} key - key of value to get
 *  @param {varies} def - default value to use if not set
 *  @returns {varies} value for the key
 */
var storeGet = function(key, def) {
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
};

module.exports = {
    writeFile,
    storeGet,
    storeSet,
    forceStore,
    getStoragePath,
    setStoragePath,
    resetStorage,
    readFile,
};