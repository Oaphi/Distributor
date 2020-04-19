const _ = require("lodash");

const pt = require('path');
const fs = require("fs");

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
    findAndRead,
    isNotExistent,
    isNotPermitted,
    log,
    parseFile,
    percentify,
    pushIfNew,
    removeDirRecursive
};