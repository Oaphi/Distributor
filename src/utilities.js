const _ = require("lodash");

const pt = require('path');
const fs = require("fs");

const { readdirSync } = fs;

const { spawnSync } = require("child_process");

const { randomBytes } = require("crypto");

const { readdir } = require("fs").promises;

const { tmpdir } = require("os");

/**
 * @summary clears array
 * @param {any[]} array 
 * @returns {any[]}
 */
const clear = (array) => {
    array.length = 0;
    return array;
};

/**
 * @summary Copies object preserving accessors
 * @param {object} target 
 * @param  {...object} sources 
 * @returns {object}
 */
const copyWithGetters = (target, ...sources) => {

    for (const source of sources) {
        const descriptors = Object.getOwnPropertyDescriptors(source);
        const symbols = Object.getOwnPropertySymbols(source);
        const everything = _.merge(descriptors, symbols);
        Object.defineProperties(target, everything);
    }

    return target;
};

/**
 * @summary creates or updates JSON file
 * @param {string} path 
 * @returns {boolean}
 */
const createOrUpdateJSONfile = (path, updates = {}) => {

    try {
        const json = fs.readFileSync(path, { encoding: "utf-8" });

        const parsed = JSON.parse(json);

        Object
            .entries(updates)
            .forEach(([key, value]) => {
                parsed[key] = value;
            });

        fs.writeFileSync(path, JSON.stringify(parsed));
    }
    catch (error) {
        const { code } = error;
        if (code === "ENOENT") {
            fs.appendFileSync(path, "{}");
            return createOrUpdateJSONfile(path, updates);
        }
        return false;
    }

    return true;
};

/**
 * @summary gets a random hex string (128 bit, for UID)
 * @returns {Promise<string>}
 */
const getQuasiUniqueHexString = () => {
    return new Promise((resolve) => {
        randomBytes(16, (err, buff) => {
            resolve(buff.toString("hex"));
        });
    });
};

/**
 * @summary check if error is ENOENT
 * @param {Error} error 
 * @returns {boolean}
 */
const isNotExistent = (error) => error.code === "ENOENT";

/**
 * @summary checks if error is EPERM
 * @param {Error} error 
 * @returns {boolean}
 */
const isNotPermitted = (error) => error.code === "EPERM";

/**
 * @summary simple override of logging
 * @param {string} msg 
 * @returns {boolean}
 */
const log = msg => process.stdout.write(`${msg}\n`);

/**
 * @summary reads and parses file
 * @param {string} path 
 * @returns {object}
 */
const parseFile = (path) => {
    const file = fs.readFileSync(path);

    return JSON.parse(file);
};

/**
 * @summary formats number into percent string
 * @param {number} float 
 * @returns {string}
 */
const percentify = (float) => {
    return `${Math.floor(float * 100)}%`;
};

/**
 * @summary Adds element to the array IFF there is none
 * @param {any[]} array 
 * @param {any} element 
 * @returns {number}
 */
const pushIfNew = (array, element) => {
    const idx = array.lastIndexOf(element);

    if (idx === -1) {
        return array.push(element);
    }

    return array.length;
};

/**
 * @typedef {({
 *  synchronous : boolean
 * })} dirOptions
 */

/**
 * @summary Directory iterator
 * @param {string} root 
 * @param {directoryCallback} callback
 * @param {lookupFailureHandler} [errorHandler]
 * @returns {Promise<any>}
 */
const dirR = async (
    root,
    callback,
    errorHandler = err => console.error(err)
) => {

    try {

        const processAtPath = processEntry(root, callback, errorHandler);

        const readdirOpts = {
            withFileTypes: true
        };

        const files = await readdir(root, readdirOpts);

        const result = await Promise.all(files.map(processAtPath));

        return result.filter(Boolean).flat();
    }
    catch (err) {
        return errorHandler(err);
    }
};

/**
 * @summary gets app entry point if run directly
 * @param {import("path")} pt
 */
const getAppEntryPoint = (pt) =>

    /**
     * @returns {string[]}
     */
    () => {

        const { main } = require;

        const { filename } = main;

        return main === module ?
            [pt.parse(filename).dir] :
            [];
    };

/**
 * @summary gets root by walking up node_modules
 * @param {import("fs")} fs
 * @param {import("path")} pt
 */
const getRootFromNodeModules = (fs, pt) =>

    /**
     * @param {string} [startPath]
     * @returns {string[]}
     */
    (startPath = __dirname) => {

        //avoid loop if reached root path
        if (startPath === pt.parse(startPath).root) {
            return [startPath];
        }

        const isRoot = fs.existsSync(pt.join(startPath, "node_modules"));

        if (isRoot) {
            return [startPath];
        }

        return getRootFromNodeModules(fs, pt)(pt.dirname(startPath));
    };

/**
 * @summary returns worktree root path(s)
 * @param {function : string[] } [fallback]
 * @returns {string[]}
 */
const getProjectRoot = (fallback) => {

    const { error, stdout } = spawnSync(
        `git worktree list --porcelain`,
        {
            encoding: "utf8",
            shell: true
        }
    );

    if (!stdout) {
        console.warn(`Could not use GIT to find root:\n\n${error}`);
        return fallback ? fallback() : [];
    }

    return stdout
        .split("\n")
        .map(line => {
            const [key, value] = line.split(/\s+/) || [];
            return key === "worktree" ? value : "";
        })
        .filter(Boolean);
};

/**
 * @callback directoryCallback
 * @param {string} entryPath
 * @param {string} entryName
 * @returns {boolean}
 */

/**
 * @callback lookupFailureHandler
 * @param {Error} error
 * @returns {any}
 */

/**
 * @callback lookupSuccessHandler
 * @param {string[]} paths full path to entry list
 * @param {string} root path to project root / folder to start
 * @returns {any}
 */

/** 
 * @typedef {({
 *  entryCallback : directoryCallback
 *  errorHandler : (lookupFailureHandler | undefined)
 *  onSuccess : (lookupSuccessHandler | undefined)
 *  root : (string | undefined)
 * })} dirLookupConfig
 * 
 * @param {dirLookupConfig} config
 * @returns {string[]}
 */
const recursiveDirLookupSync = ({
    entryCallback,
    errorHandler = err => console.log(err),
    onSuccess,
    root = getProjectRoot(getRootFromNodeModules(fs, pt))[0]
} = {

    }) => {

    const config = { entryCallback, errorHandler, onSuccess, root };

    try {

        const entries = processEntrySync([], config);

        return typeof onSuccess === "function" ?
            onSuccess(entries, root) :
            entries;

    } catch (error) {
        return errorHandler(error);
    }
};

/**
 * @typedef {({
 *  env : (("dev"|"opt"|"prod") | undefined),
 *  manager : (("npm"|"yarn") | undefined),
 *  id : string
 * })} InstallConfig
 */

/**
 * @summary deletes TypeScript if installed locally
 * @param {InstallConfig} [config]
 * @returns {boolean}
 */
const installIfNotFound = ({
    env = "dev",
    manager = "npm",
    id
} = {}) => {

    try {
        require.resolve(id);
        return true;
    }
    catch (error) {

        if (error.code === "MODULE_NOT_FOUND") {

            log(`${id} is not installed, installing...`);

            const command = manager === "npm" ?
                `npm i ${env === "dev" ? "-D" : ""}` :
                `yarn add ${env === "dev" ? "--dev" : ""}`;

            const { error: installError } = spawnSync(
                `${command} ${id}`,
                {
                    stdio: "pipe",
                    encoding: "utf8",
                    shell: true
                }
            );

            if (installError) {
                log(`Failed to install ${id}:\n\n${installError}`);
                return false;
            }

            log(`Installed ${id} successfully`);
            return true;
        }

        log(`Error during ${id} lookup:\n\n${error}`);

        return false;
    }

};

/**
 * @summary wrapper for entry handler
 * @param {string} path
 * @param {directoryCallback} callback
 * @param {function(Error) : any} [errorHandler]
 */
const processEntry = (path, callback, errorHandler) =>

    /**
     * @summary entry handler callback
     * @param {fs.Dirent} entry
     * @returns {Promise<any>}
     */
    async (entry) => {

        const { name } = entry;

        const entryPath = pt.join(path, name);

        try {

            if (entry.isSymbolicLink()) {
                return null; //ignore symlinks to avoid loops
            }

            if (entry.isDirectory()) {
                return dirR(entryPath, callback);
            }

            const status = callback(entryPath, name);

            if (status) {
                return entryPath;
            }

        }
        catch (statErr) {
            return errorHandler(statErr);
        }
    };

/**
 * @summary synchronously traverse entries
 * @param {string[]} entries mathed entries
 * @param {dirLookupConfig} config
 * @returns {string[]}
 */
const processEntrySync = (entries, config) => {

    const { root, entryCallback, errorHandler } = config;

    try {

        /** @type {import("fs").Dirent[]} */
        const entryCollection = readdirSync(root, { withFileTypes: "utf8" });

        for (const entry of entryCollection) {
            const { name } = entry;

            const entryPath = pt.resolve(root, name);

            if (entry.isSymbolicLink()) {
                continue; //ignore symlinks to avoid loops
            }

            if (entry.isDirectory()) {
                const subconfig = Object.assign({}, config, { root: entryPath });
                processEntrySync(entries, subconfig);
                continue;
            }

            const status = entryCallback(entryPath, name);

            if (status) {
                entries.push(entryPath);
                break;
            }
        }

        return entries;

    } catch (error) {
        return errorHandler(error);
    }

};

/**
 * @summary Cleans root path and subpaths
 * @param {string} rootPath 
 * @param {string[]} [ignore]
 * @param {boolean} [removeItself]
 */
const removeDirRecursive = (rootPath, ignore = [], removeItself = false) => {
    if (fs.existsSync(rootPath)) {

        const entries = fs.readdirSync(rootPath, { withFileTypes: true });

        for (const entry of entries) {
            const { name } = entry;

            const cannotDelete = ignore.some(test => new RegExp(test).test(name));

            if (!cannotDelete) {
                const thisPath = pt.resolve(rootPath, name);

                if (fs.existsSync(thisPath)) {
                    entry.isDirectory() && removeDirRecursive(thisPath);
                    entry.isFile() && fs.unlinkSync(thisPath);
                }
            }
        }

        removeItself && fs.rmdirSync(rootPath);
    }
};

/**
 * @summary finds and reads file contents
 * @param {string} root 
 * @param {RegExp} test
 * @returns {?string} 
 */
const findAndRead = (root, test) => {

    if (fs.existsSync(root)) {

        const entries = fs.readdirSync(root, { withFileTypes: true });

        const dirToVisit = [];

        for (const entry of entries) {

            if (entry.isFile()) {
                const { name } = entry;

                const hasMatch = test.test(name);

                if (hasMatch) {
                    return fs.readFileSync(pt.resolve(root, name), { encoding: "utf8" });
                }

            }

            entry.isDirectory() && dirToVisit.push(entry);
        }

        //not found and only dirs left
        for (const dir of dirToVisit) {
            const found = findAndRead(pt.resolve(root, dir.name), test);

            if (found) {
                return found;
            }
        }
    }

    return null;
};

module.exports = {
    clear,
    copyWithGetters,
    createOrUpdateJSONfile,
    dirR,
    findAndRead,
    getAppEntryPoint,
    getRootFromNodeModules,
    getProjectRoot,
    getQuasiUniqueHexString,
    installIfNotFound,
    isNotExistent,
    isNotPermitted,
    log,
    tmpdir,
    parseFile,
    percentify,
    pushIfNew,
    recursiveDirLookupSync,
    removeDirRecursive
};