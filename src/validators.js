const { resolve } = require("path");

const { findTsConfig, tsInstall } = require("./typescript.js");

/**
 * @typedef {({
 *  moduleName : (string | ""),
 *  moduleType : (("AMD"|"CommonJS"|"none"|"UMD"|"web"))
 * })} ModuleConfig
 * 
 * @typedef {({
 *  exclude : (string[] | []),
 *  ignore : (string[] | []),
 *  moduleConfig : (ModuleConfig | {}),
 *  name : (string | "dist.js"),
 *  tsConfig : string,
 *  tsInstalled : boolean,
 *  order : (string[] | []),
 *  output : string,
 *  separator : (string | "\n"),
 *  source : (string | "src"),
 *  start : (boolean | true),
 *  watch : (boolean | false)
 * })} DistributorArgs
 * 
 * @summary validates config to avoid errors on non-cli usage
 * @param {DistributorArgs} [argv] 
 * @returns {DistributorArgs}
 */
const validateArgv = (argv = {}) => {

    const {
        exclude = [],
        ignore = [],
        moduleConfig = {
            moduleName = "",
            moduleType = "none"
        } = {},
        name = "dist.js",
        order = [],
        output = "dist",
        separator = "\n",
        source = "src",
        start = true,
        tsConfig = findTsConfig({
            pathOnly: true
        }),
        watch = false
    } = argv;

    const tsInstalled = tsInstall({ env: "dev" });

    return {
        exclude,
        ignore,
        moduleConfig,
        name,
        order,
        output: resolve(output, name),
        separator,
        source,
        start,
        tsConfig,
        tsInstalled,
        watch
    };
};

module.exports = {
    validateArgv
};