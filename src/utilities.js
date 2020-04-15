const _ = require("lodash");

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
 * @summary Copies object preserving accessors
 * @param {object} target 
 * @param  {...object} sources 
 * @returns {object}
 */
const copyWithGetters = (target,...sources) => {

    for (const source of sources) {
        const descriptors = Object.getOwnPropertyDescriptors(source);
        const symbols = Object.getOwnPropertySymbols(source);
        const everything = _.merge(descriptors,symbols);
        Object.defineProperties(target, everything);
    }

    return target;
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

module.exports = {
    clear,
    copyWithGetters,
    isNotExistent,
    isNotPermitted,
    log,
    parseFile,
    percentify,
    pushIfNew
};