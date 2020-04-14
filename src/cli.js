#!/usr/bin/env node

//core modules
const pt = require("path");

//libraries
const _ = require("lodash");
const yargs = require("yargs");

//custom modules
const { parseFile } = require("./utilities.js");
const { findConfig, run } = require("./distribute.js");

yargs
    .options({
        "config": {
            alias: "c",
            default: "auto",
            describe: "Use external config",
            type: "string"
        },
        "name": {
            default: "dist.js",
            describe: "Output file path",
            type: "string"
        },
        "output": {
            aliases: ["o", "out"],
            default: "dist",
            describe: "Output source path",
            type: "string"
        },
        "source": {
            aliases: ["i", "input"],
            default: "src",
            describe: "Source path",
            type: "string"
        },
        "start": {
            alias: "s",
            describe: "Pipe at launch",
            type: "boolean"
        },
        "watch": {
            alias: "w",
            describe: "Watch files",
            type: "boolean"
        }
    })
    .command("$0", "Pipes files into distribution")
    .middleware(async (args) => {

        const { config: pathToConfig } = args;

        const external = pathToConfig === "auto"
            ? (await findConfig())
            : parseFile(pathToConfig);

        _.forIn(
            external,
            (val, key) => {
                const willOverride = _.has(args, key);
                willOverride || (args[key] = val);
            }
        );
    })
    .middleware((args) => {
        const { name, output } = args;
        const outputPath = pt.resolve(output, name);
        args.output = outputPath;
    })
    .help();

run(yargs.argv);