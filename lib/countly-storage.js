const fs = require('fs');
const path = require('path');
var cc = require("./countly-common");
var storagePath;
var __data = {};

var setStoragePath = function (path) {
    defaultPath = "../data/"; // Default path
    storagePath = path || defaultPath;
}

var setBulkDataPath = function (path) {
    defaultPath = "../bulk_data/"; // Default path
    storagePath = path || defaultPath;
}

var getStoragePath = function () {
    return storagePath;
}

var clearStoragePath = function () {
    storagePath = undefined;
    return storagePath;
}

/**
 *  Read value from file
 *  @param {String} key - key for file
 *  @returns {varies} value in file
 */
var readFile = function (key) {
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
var forceStore = function () {
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

var asyncWriteLock = false;
var asyncWriteQueue = [];

/**
 *  Write to file and process queue while in asyncWriteLock
 *  @param {String} key - key for value to store
 *  @param {varies} value - value to store
 *  @param {Function} callback - callback to call when done storing
 */
var writeFile = function (key, value, callback) {
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
                writeFile(arr[0], arr[1], arr[2]);
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
var storeSet = function (key, value, callback) {
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
var storeGet = function (key, def) {
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
    setBulkDataPath,
    clearStoragePath,
    readFile,
};