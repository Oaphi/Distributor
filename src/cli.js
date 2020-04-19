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
            describe: "File paths to exclude",
            group: "Input options: ",
            type: "array"
        },
        "module-type": {
            aliases: ["M"],
            choices: ["AMD", "CommonJS", "none", "UMD", "web"],
            describe: "Module type to wrap into",
            group: "Output options: ",
            requiresArg: true,
            type: "string"
        },
        "module-name": {
            aliases: ["N"],
            describe: "Module name",
            group: "Output options: ",
            requiresArg: true,
            type: "string"
        },
        "name": {
            aliases: ["n"],
            describe: "Output file path",
            group: "Output options: ",
            type: "string"
        },
        "order": {
            aliases: ["O"],
            describe: "Source files order",
            group: "Input options: ",
            type: "array"
        },
        "output": {
            aliases: ["o", "out"],
            describe: "Output source path",
            group: "Output options: ",
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
    .implies("module-name","module-type")
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
        const { exclude, moduleType, name, order, output, source } = args;
        !exclude && (args.exclude = []);
        !order && (args.order = []);
        !output && (args.output = 'dist');
        !source && (args.source = 'src');
        !moduleType && (args.moduleType = 'none');
        !name && (args.name = 'dist.js');
    })
    .middleware((args) => {
        const { name, output } = args;
        const outputPath = pt.resolve(output, name);
        args.output = outputPath;
    })
    .middleware((args) => {
        const { moduleType, moduleName } = args;

        args.moduleConfig = {
            moduleName,
            moduleType
        };
    })
    .help();

run(yargs.argv);