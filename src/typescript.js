const { readFileSync } = require("fs");

const {
    installIfNotFound,
    log,
    recursiveDirLookupSync
} = require("./utilities.js");

/** @typedef {import("./utilities.js").InstallConfig} InstallConfig */

/**
 * @summary install TypeScript if installed locally
 * @param {InstallConfig} [config]
 * @returns {boolean}
 */
const tsInstall = (config = { env = "dev" } = {}) => {
    config.id = "typescript";
    return installIfNotFound(config);
};

/**
 * @typedef {{
 *  closestToStart : (boolean | true),
 *  pathOnly : (boolean | false),
 *  pathToStart : (string | undefined)
 * }} findTsConfigOptions
 * 
 * @param {findTsConfigOptions} config
 * @returns {import("typescript").ParsedTsconfig|string}
 */
const findTsConfig = ({
    closestToStart = true,
    pathToStart,
    pathOnly = false
} = {}) => {

    log(`Looking for TypeScript config`);

    return recursiveDirLookupSync({
        root: pathToStart,
        entryCallback: (path, name) => /tsconfig\.json/.test(name),
        onSuccess: (paths) => {

            if(!paths.length) {
                return null;
            }

            /** @type {function (string, string) : string} */
            const shortestFinder = (shortest, curr) =>
                shortest.length < curr.length ? shortest : curr;

            const [firstFoundConfig] = closestToStart ? [paths.reduce(shortestFinder)] : paths;

            if (!firstFoundConfig) {
                return null;
            }

            log(`Found TypeScript config in:\n${firstFoundConfig}`);

            return pathOnly ?
                firstFoundConfig :
                JSON.parse(readFileSync(firstFoundConfig));
        }
    });


};

module.exports = {
    tsInstall,
    findTsConfig
};