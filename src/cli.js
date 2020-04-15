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
            aliases: ["c"],
            default: "auto",
            describe: "Use external config",
            type: "string"
        }, 
        "exclude": {
            aliases: ["E"],
            default: [],
            describe: "File paths to exclude",
            type: "array"
        },
        "name": {
            aliases: ["n"],
            describe: "Output file path",
            type: "string"
        },
        "order": {
            aliases: ["O"],
            default: [],
            describe: "Source files order",
            type: "array"
        },
        "output": {
            aliases: ["o", "out"],
            describe: "Output source path",
            type: "string"
        },
        "separator": {
            aliases: ["S"],
            describe: "Files separator",
            type: "string"
        },
        "source": {
            aliases: ["i", "input"],
            describe: "Source path",
            type: "string"
        },
        "start": {
            aliases: ["s"],
            describe: "Pipe at launch",
            type: "boolean"
        },
        "watch": {
            aliases: ["w"],
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
        const { name, output, source } = args;
        !output && (args.output = 'dist');
        !source && (args.source = 'src');
        !name && (args.name = 'dist.js');
    })    
    .middleware((args) => {
        const { name, output } = args;
        const outputPath = pt.resolve(output, name);
        args.output = outputPath;
    })
    .help();

run(yargs.argv);