const fs = require('fs');
const path = require('path');
var cc = require("./countly-common");

// Constants
const StorageTypes = cc.storageTypeEnums;
const defaultStorageType = StorageTypes.FILE;
const customTypeName = "custom";
const defaultFolder = ".countly-storage"; // default storage folder, inside the app's working directory
const defaultBulkFolder = path.join(defaultFolder, "bulk");
const legacyDefaultPath = "../data/"; // default up to 24.10.4, relative to this folder
const legacyDefaultBulkPath = "../bulk_data/";
const coreKeys = ["cly_id", "cly_id_type", "cly_queue", "cly_event", "cly_remote_configs"];
const bulkKeys = ["cly_req_queue", "cly_bulk_event", "cly_bulk_queue"];
const lockedFileErrors = ["EPERM", "EACCES", "EBUSY"];

var instancesWithPendingWrites = new Set();
var exitListenerAdded = false;
var foldersInUse = {};

/**
 * Writes all pending file writes of every storage instance synchronously. Runs on process exit, where
 * asynchronous writes can no longer finish, so data changed right before process.exit() is kept.
 */
function writePendingFilesOnExit() {
    instancesWithPendingWrites.forEach((instance) => {
        instance.flushSync();
    });
}

/**
 * Keeps a process "exit" listener registered only while some storage instance has unfinished writes
 */
function updateExitListener() {
    if (instancesWithPendingWrites.size > 0 && !exitListenerAdded) {
        process.on("exit", writePendingFilesOnExit);
        exitListenerAdded = true;
    }
    else if (instancesWithPendingWrites.size === 0 && exitListenerAdded) {
        process.removeListener("exit", writePendingFilesOnExit);
        exitListenerAdded = false;
    }
}

/**
 * Renames a file, retrying a few times when the target is briefly locked (on Windows an antivirus or
 * indexer can hold a file open for a moment). Each attempt is synchronous, so a rename can never still
 * be running when the process exits and land after the synchronous exit write.
 * @param {String} from - temporary file path
 * @param {String} to - target file path
 * @param {Number} attempt - retries done so far
 * @param {Function} callback - called with an error or null
 */
function renameWithRetry(from, to, attempt, callback) {
    var err = null;
    try {
        fs.renameSync(from, to);
    }
    catch (ex) {
        err = ex;
    }
    if (err && lockedFileErrors.indexOf(err.code) !== -1 && attempt < 3) {
        setTimeout(() => {
            renameWithRetry(from, to, attempt + 1, callback);
        }, 20 * (attempt + 1));
        return;
    }
    callback(err);
}

/**
 * Removes a file if it exists, ignoring errors
 * @param {String} file - file path
 */
function removeQuietly(file) {
    try {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
    catch (ex) {
        cc.log(cc.logLevelEnums.DEBUG, `Could not remove [${file}]: [${ex}].`);
    }
}

/**
 * Tells whether a process with the given ID is running
 * @param {Number} pid - process ID
 * @returns {Boolean} true if the process is running
 */
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (ex) {
        return ex.code === "EPERM";
    }
}

/**
 * Removes temporary files that processes which are no longer running left in a storage folder when they
 * ended in the middle of a write
 * @param {String} folder - storage folder
 */
function removeStaleTempFiles(folder) {
    var names = [];
    try {
        names = fs.readdirSync(folder);
    }
    catch (ex) {
        return;
    }
    names.forEach((name) => {
        var match = /^__.+\.json\.(\d+)(\.sync)?\.tmp$/.exec(name);
        if (match && Number(match[1]) !== process.pid && !isProcessAlive(Number(match[1]))) {
            removeQuietly(path.join(folder, name));
        }
    });
}

/**
 * Tells whether the process can create files in a folder, by writing and removing a small file. A
 * permission check alone is not enough on Windows, where it ignores the folder's access rules.
 * @param {String} folder - folder path
 * @returns {Boolean} true if writable
 */
function isWritable(folder) {
    var probe = path.join(folder, `.countly-write-check.${process.pid}`);
    try {
        fs.writeFileSync(probe, "");
        fs.unlinkSync(probe);
        return true;
    }
    catch (ex) {
        return false;
    }
}

/**
 * Writes a file so that it always holds either its previous or its new content, never an empty or
 * half written one: the data goes to a temporary file that then replaces the target in one rename.
 * When the rename keeps failing the target is written directly, so the data is still saved.
 * @param {String} file - target file path
 * @param {String} data - content to write
 * @param {Function} callback - called with an error or null
 * @param {Function=} isCancelled - returns true when the write must not replace the target anymore (the storage was reset meanwhile)
 */
function writeFileAtomic(file, data, callback, isCancelled) {
    var tmp = `${file}.${process.pid}.tmp`;
    fs.writeFile(tmp, data, (writeErr) => {
        if (writeErr) {
            callback(writeErr);
            return;
        }
        if (isCancelled && isCancelled()) {
            fs.unlink(tmp, () => {
                callback(null);
            });
            return;
        }
        renameWithRetry(tmp, file, 0, (renameErr) => {
            if (!renameErr || (isCancelled && isCancelled())) {
                if (renameErr) {
                    fs.unlink(tmp, () => { });
                }
                callback(null);
                return;
            }
            fs.writeFile(file, data, (directErr) => {
                fs.unlink(tmp, () => { });
                callback(directErr);
            });
        });
    });
}

/**
 * Synchronous version of writeFileAtomic, for places where only synchronous work can run (process
 * exit, fatal crash handling)
 * @param {String} file - target file path
 * @param {String} data - content to write
 */
function writeFileAtomicSync(file, data) {
    var tmp = `${file}.${process.pid}.sync.tmp`;
    try {
        fs.writeFileSync(tmp, data);
        fs.renameSync(tmp, file);
    }
    catch (ex) {
        fs.writeFileSync(file, data);
        if (fs.existsSync(tmp)) {
            fs.unlinkSync(tmp);
        }
    }
}

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

var isCustomStorageValid = function(storage) {
    if (!storage) {
        return false;
    }
    if (typeof storage.storeSet !== 'function') {
        return false;
    }
    if (typeof storage.storeGet !== 'function') {
        return false;
    }
    if (typeof storage.storeRemove !== 'function') {
        return false;
    }
    return true;
};

/**
 * Creates an independent storage with its own location, type, in-memory cache and file writes.
 * The SDK uses the default storage of this module and every CountlyBulk instance creates its own, so one
 * instance can never read, overwrite or change the type of another instance's data.
 * File storage writes each key to "<storage folder>/__<key>.json" through writeFileAtomic. While a write
 * of a key is running, newer values of that key are combined into one follow-up write, and whatever is
 * still unwritten when the process exits is written synchronously.
 * @returns {Object} storage instance
 */
function createStorage() {
    var storagePath;
    var legacyBase;
    var useLegacyLayout = false;
    var registeredFolder = null;
    var storageMethod = {};
    var cache = {};
    var writes = {};
    var generation = 0;
    var instance = {};

    /**
     * Path of the file that holds a key
     * @param {String} key - key of the value
     * @returns {String} file path
     */
    function getFilePath(key) {
        if (useLegacyLayout) {
            return getLegacyFilePath(key);
        }
        return path.join(storagePath, `__${key}.json`);
    }

    /**
     * Path where SDK versions up to 24.10.4 kept a key: the configured path, or the old default, resolved
     * against this folder, with the file name appended without a separator
     * @param {String} key - key of the value
     * @returns {String} file path
     */
    function getLegacyFilePath(key) {
        return path.resolve(__dirname, `${legacyBase}__${key}.json`);
    }

    /**
     * Serializes the cached value of a key in the stored file format
     * @param {String} key - key of the value
     * @returns {String|null} file content, or null when the value cannot be serialized
     */
    function serialize(key) {
        var ob = {};
        ob[key] = cache[key];
        try {
            return JSON.stringify(ob);
        }
        catch (ex) {
            cc.log(cc.logLevelEnums.ERROR, `storeSet, Value for key: [${key}] could not be stored: [${ex}].`);
            return null;
        }
    }

    /**
     * Moves the files of an older SDK version to the current storage folder once: only when nothing is
     * stored in the current folder yet. The old files are kept with a ".migrated" suffix. If the files
     * cannot be copied, the old location stays in use, as before this version.
     * @param {Array} keys - keys stored by this kind of storage
     */
    function migrateLegacyFiles(keys) {
        var found = [];
        for (var i = 0; i < keys.length; i++) {
            var target = getFilePath(keys[i]);
            var legacy = getLegacyFilePath(keys[i]);
            if (fs.existsSync(target)) {
                return;
            }
            if (legacy !== target && fs.existsSync(legacy)) {
                found.push(keys[i]);
            }
        }
        if (!found.length) {
            return;
        }
        var copied = [];
        try {
            found.forEach((key) => {
                var tmp = `${getFilePath(key)}.${process.pid}.tmp`;
                fs.copyFileSync(getLegacyFilePath(key), tmp);
                fs.renameSync(tmp, getFilePath(key));
                copied.push(key);
            });
        }
        catch (ex) {
            found.forEach((key) => {
                removeQuietly(`${getFilePath(key)}.${process.pid}.tmp`);
            });
            copied.forEach((key) => {
                removeQuietly(getFilePath(key));
            });
            useLegacyLayout = true;
            cc.log(cc.logLevelEnums.WARNING, `Could not move the stored data to [${storagePath}], the old location stays in use: [${ex}].`);
            return;
        }
        found.forEach((key) => {
            var legacyFile = getLegacyFilePath(key);
            try {
                fs.renameSync(legacyFile, `${legacyFile}.migrated`);
            }
            catch (ex) {
                cc.log(cc.logLevelEnums.WARNING, `Could not mark [${legacyFile}] as moved: [${ex}].`);
            }
        });
        cc.log(cc.logLevelEnums.INFO, `Moved the stored data of an older SDK version to [${storagePath}].`);
    }

    /**
     * Warns when the storage folder cannot be written, or when another storage of the same kind (SDK or
     * CountlyBulk) in this process already stores its files there; storages of different kinds use
     * different file names and can share a folder
     * @param {String} kind - "core" or "bulk"
     */
    function checkFolder(kind) {
        var folder = useLegacyLayout ? path.dirname(getLegacyFilePath("check")) : storagePath;
        if (!isWritable(folder)) {
            cc.warnOnce(`storage-not-writable:${folder}`, `Countly: the storage folder [${folder}] is not writable, so the device ID and unsent data will not survive a restart. Set "storage_path" to a writable folder, or use the memory storage type.`);
        }
        var registryKey = `${kind}:${folder}`;
        if (foldersInUse[registryKey]) {
            cc.warnOnce(`storage-shared:${registryKey}`, `Countly: two Countly instances in this process store their data in [${folder}] and can overwrite each other's files. Give each instance its own "storage_path".`);
        }
        foldersInUse[registryKey] = true;
        registeredFolder = registryKey;
    }

    /**
     * Finishes a file write, runs its callbacks and starts the follow-up write if the value changed meanwhile
     * @param {String} key - key of the value
     * @param {Number} writeGeneration - generation the write was started in
     * @param {Error|null} err - write error
     * @param {Array} callbacks - callbacks waiting for this write
     */
    function finishWrite(key, writeGeneration, err, callbacks) {
        if (writeGeneration !== generation || !writes[key]) {
            return;
        }
        if (err) {
            cc.log(cc.logLevelEnums.ERROR, `writeFile, Writing files failed. Error: [${err}].`);
        }
        callbacks.forEach((callback) => {
            if (typeof callback === "function") {
                callback(err);
            }
        });
        writes[key].writing = false;
        if (writes[key].dirty) {
            startWrite(key);
            return;
        }
        delete writes[key];
        if (Object.keys(writes).length === 0) {
            instancesWithPendingWrites.delete(instance);
            updateExitListener();
        }
    }

    /**
     * Writes the current value of a key to its file
     * @param {String} key - key of the value
     */
    function startWrite(key) {
        var state = writes[key];
        var { callbacks } = state;
        var writeGeneration = generation;
        var file = getFilePath(key);
        state.writing = true;
        state.dirty = false;
        state.callbacks = [];
        if (!Object.prototype.hasOwnProperty.call(cache, key)) {
            fs.unlink(file, (err) => {
                finishWrite(key, writeGeneration, err && err.code !== "ENOENT" ? err : null, callbacks);
            });
            return;
        }
        var data = serialize(key);
        if (data === null) {
            finishWrite(key, writeGeneration, new Error(`value of [${key}] cannot be serialized`), callbacks);
            return;
        }
        writeFileAtomic(file, data, (err) => {
            finishWrite(key, writeGeneration, err, callbacks);
        }, () => writeGeneration !== generation);
    }

    /**
     * Schedules writing a key to its file; a write that is already running is followed by one more write
     * with the latest value instead of one write per change
     * @param {String} key - key of the value
     * @param {Function=} callback - called when the value is written
     */
    function scheduleWrite(key, callback) {
        if (!writes[key]) {
            writes[key] = { writing: false, dirty: false, callbacks: [] };
        }
        var state = writes[key];
        if (callback) {
            state.callbacks.push(callback);
        }
        instancesWithPendingWrites.add(instance);
        updateExitListener();
        if (state.writing) {
            state.dirty = true;
            return;
        }
        startWrite(key);
    }

    /**
     *  Read value from file
     *  @param {String} key - key for file
     *  @returns {varies} value in file
     */
    function readFile(key) {
        var file = getFilePath(key);
        var data;
        try {
            data = fs.readFileSync(file, 'utf8');
        }
        catch (ex) {
            cc.log(cc.logLevelEnums.WARNING, `readFile, File not found for key: [${key}]. Returning null.`);
            return null;
        }

        if (!data.trim()) {
            cc.log(cc.logLevelEnums.WARNING, `readFile, File is empty or contains only whitespace for key: [${key}]. Returning null.`);
            return null;
        }

        try {
            data = JSON.parse(data);
        }
        catch (ex) {
            cc.log(cc.logLevelEnums.ERROR, `readFile, Failed to parse the file with key: [${key}]. Error: [${ex}].`);
            fs.writeFile(`${file}.${cc.getTimestamp()}${Math.random()}.json`, data, () => { });
            return null;
        }
        return data;
    }

    const memoryStorage = {
        /**
         *  Save value in memory
         *  @param {String} key - key for value to store
         *  @param {varies} value - value to store
         *  @param {Function} callback - callback to call when done storing
         */
        storeSet: function(key, value, callback) {
            if (key) {
                cache[key] = value;
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
            return typeof cache[key] !== "undefined" ? cache[key] : def;
        },
        /**
         *  Remove value from memory
         *  @param {String} key - key of value to remove
         */
        storeRemove: function(key) {
            delete cache[key];
        },
    };

    const fileStorage = {
        /**
         *  Save value in storage
         *  @param {String} key - key for value to store
         *  @param {varies} value - value to store
         *  @param {Function} callback - callback to call when done storing
         */
        storeSet: function(key, value, callback) {
            cache[key] = value;
            scheduleWrite(key, callback);
        },
        /**
         *  Get value from storage
         *  @param {String} key - key of value to get
         *  @param {varies} def - default value to use if not set
         *  @returns {varies} value for the key
         */
        storeGet: function(key, def) {
            cc.log(cc.logLevelEnums.DEBUG, `storeGet, Fetching item from storage with key: [${key}].`);
            if (typeof cache[key] === "undefined") {
                var ob = readFile(key);
                var obLen;
                try {
                    obLen = Object.keys(ob).length;
                }
                catch (error) {
                    obLen = 0;
                }

                if (!ob || obLen === 0) {
                    cache[key] = def;
                }
                else {
                    cache[key] = ob[key];
                }
            }
            return cache[key];
        },
        /**
         *  Remove value from storage
         *  @param {String} key - key of value to remove
         */
        storeRemove: function(key) {
            delete cache[key];
            scheduleWrite(key);
        },
    };

    /**
     * Sets the storage method, by default sets file storage and storage path.
     * @param {String} userPath - User provided storage path
     * @param {StorageTypes} storageType - Whether to use memory only storage or not
     * @param {Boolean} isBulk - Whether the storage is for bulk data
     * @param {varies} customStorageMethod - Storage methods provided by the user
     * @param {String=} folderName - name of the folder inside the default bulk folder, used only when no path is given
     */
    instance.initStorage = function(userPath, storageType, isBulk = false, customStorageMethod = null, folderName = null) {
        cc.log(cc.logLevelEnums.INFO, `Initializing storage with userPath: [${userPath}], storageType: [${storageType}], isBulk: [${isBulk}], customStorageMethod type: [${typeof customStorageMethod}].`);

        storageType = storageType || defaultStorageType;
        storageMethod = fileStorage;

        if (storageType === StorageTypes.MEMORY) {
            storageMethod = memoryStorage;
            cc.log(cc.logLevelEnums.DEBUG, `Using memory storage!`);
        }

        if (isCustomStorageValid(customStorageMethod)) {
            storageMethod = customStorageMethod;
            storageType = customTypeName;
            cc.log(cc.logLevelEnums.DEBUG, `Using custom storage!`);
        }

        if (storageType !== StorageTypes.MEMORY) {
            instance.setStoragePath(userPath, isBulk, folderName);
        }
    };

    /**
     * Sets the storage folder. A relative path is resolved against the app's working directory; without
     * a path the folder is ".countly-storage" there (bulk: ".countly-storage/bulk/<folderName>").
     * For file storage the folder is created and data stored by an older SDK version at its old
     * location is moved over once. If the folder cannot be written but the old location can, the old
     * location stays in use, so data is kept wherever older versions kept it.
     * @param {String} userPath - User provided storage path
     * @param {Boolean} isBulk - Whether the storage is for bulk data
     * @param {String=} folderName - name of the folder inside the default bulk folder, used only when no path is given
     */
    instance.setStoragePath = function(userPath, isBulk = false, folderName = null) {
        var givenPath = typeof userPath === "string" && userPath.length ? userPath : null;
        var defaultLocation = isBulk ? defaultBulkFolder : defaultFolder;
        if (isBulk && folderName) {
            defaultLocation = path.join(defaultBulkFolder, String(folderName).replace(/[^A-Za-z0-9_-]/g, "_"));
        }
        storagePath = path.resolve(process.cwd(), givenPath || defaultLocation);
        legacyBase = givenPath || (isBulk ? legacyDefaultBulkPath : legacyDefaultPath);
        useLegacyLayout = false;
        if (storageMethod === fileStorage) {
            createDirectory(storagePath);
            if (!isWritable(storagePath)) {
                var legacyFolder = path.dirname(getLegacyFilePath("check"));
                createDirectory(legacyFolder);
                if (isWritable(legacyFolder)) {
                    useLegacyLayout = true;
                    cc.log(cc.logLevelEnums.WARNING, `Storage folder [${storagePath}] is not writable, data is kept in the old location [${legacyFolder}].`);
                }
            }
            if (!useLegacyLayout) {
                migrateLegacyFiles(isBulk ? bulkKeys : coreKeys);
            }
            removeStaleTempFiles(instance.getStoragePath());
            checkFolder(isBulk ? "bulk" : "core");
        }
    };

    /**
     * Returns the current storage folder
     * @returns {String} absolute folder path, or undefined for memory storage
     */
    instance.getStoragePath = function() {
        if (useLegacyLayout) {
            return path.dirname(getLegacyFilePath("check"));
        }
        return storagePath;
    };

    /**
     * Writes the current value of every key with an unfinished write synchronously, and removes the
     * temporary file of an asynchronous write that can no longer finish
     */
    instance.flushSync = function() {
        if (storageMethod !== fileStorage) {
            return;
        }
        Object.keys(writes).forEach((key) => {
            try {
                if (!Object.prototype.hasOwnProperty.call(cache, key)) {
                    if (fs.existsSync(getFilePath(key))) {
                        fs.unlinkSync(getFilePath(key));
                    }
                    return;
                }
                var data = serialize(key);
                if (data !== null) {
                    writeFileAtomicSync(getFilePath(key), data);
                }
            }
            catch (ex) {
                cc.log(cc.logLevelEnums.ERROR, `flushSync, Saving [${key}] failed. Error: [${ex}].`);
            }
            removeQuietly(`${getFilePath(key)}.${process.pid}.tmp`);
        });
    };

    /**
     *  Force store data synchronously on unrecoverable errors to preserve it for next launch.
     *  Memory and custom storages are left alone.
     */
    instance.forceStore = function() {
        if (storageMethod !== fileStorage) {
            return;
        }
        Object.keys(cache).forEach((key) => {
            var data = serialize(key);
            if (data === null) {
                return;
            }
            try {
                writeFileAtomicSync(getFilePath(key), data);
            }
            catch (ex) {
                cc.log(cc.logLevelEnums.ERROR, `forceStore, Saving files failed. Error: [${ex}].`);
            }
        });
    };

    /**
     * Resets the storage to its initial state. Unfinished file writes are saved first, like on a restart.
     */
    instance.resetStorage = function() {
        instance.flushSync();
        generation++;
        if (registeredFolder) {
            delete foldersInUse[registeredFolder];
            registeredFolder = null;
        }
        storagePath = undefined;
        legacyBase = undefined;
        useLegacyLayout = false;
        cache = {};
        writes = {};
        storageMethod = {};
        instancesWithPendingWrites.delete(instance);
        updateExitListener();
    };

    instance.readFile = readFile;

    /**
     *  Write a value to the file of a key, without changing the cached value
     *  @param {String} key - key for value to store
     *  @param {varies} value - value to store
     *  @param {Function} callback - callback to call when done storing
     */
    instance.writeFile = function(key, value, callback) {
        var ob = {};
        ob[key] = value;
        writeFileAtomic(getFilePath(key), JSON.stringify(ob), (err) => {
            if (typeof callback === "function") {
                callback(err);
            }
        });
    };

    instance.storeSet = function(key, value, callback) {
        storageMethod.storeSet(key, value, callback);
    };

    instance.storeGet = function(key, def) {
        return storageMethod.storeGet(key, def);
    };

    instance.storeRemove = function(key) {
        storageMethod.storeRemove(key);
    };

    /**
     * Disclaimer: This method is mainly for testing purposes.
     * @returns {StorageTypes} Returns the active storage type for the SDK
     */
    instance.getStorageType = function() {
        if (storageMethod === memoryStorage) {
            return StorageTypes.MEMORY;
        }

        if (storageMethod === fileStorage) {
            return StorageTypes.FILE;
        }

        return null;
    };

    return instance;
}

var defaultStorage = createStorage();

module.exports = {
    initStorage: defaultStorage.initStorage,
    storeSet: defaultStorage.storeSet,
    storeGet: defaultStorage.storeGet,
    storeRemove: defaultStorage.storeRemove,
    writeFile: defaultStorage.writeFile,
    forceStore: defaultStorage.forceStore,
    getStoragePath: defaultStorage.getStoragePath,
    setStoragePath: defaultStorage.setStoragePath,
    resetStorage: defaultStorage.resetStorage,
    readFile: defaultStorage.readFile,
    getStorageType: defaultStorage.getStorageType,
    createStorage,
    defaultFolder,
};
