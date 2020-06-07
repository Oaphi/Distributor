const { resolve } = require("path");

const { findTsConfig } = require("./typescript.js");

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
        watch
    };
};

module.exports = {
    validateArgv
};