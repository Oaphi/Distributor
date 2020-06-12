const { execSync } = require("child_process");
const fs = require("fs");
const pt = require("path");
const { promisify } = require("util");

const {
    readFile: asyncReadfile,
    appendFile: asyncCreate,
    readdir: asyncReaddir,
    truncate: asyncTrunc
} = fs.promises;

const { pipeline } = require("stream");

const asyncExists = promisify(fs.exists);
const asyncPipeline = promisify(pipeline);

const { yellow } = require("chalk");

const {
    readableFromString,
    ModuleExtractor,
    Prepender
} = require("./streams.js");

const { validateArgv } = require("./validators.js");

const {
    dirR,
    forAwait,
    log,
    parseFile,
    percentify,
    recursiveDirLookupSync
} = require("./utilities.js");

const { makeJobQueue } = require("./queue.js");

/**
 * @typedef {import("./validators.js").DistributorArgs} DistributorArgs
 */

/**
 * @summary Event log colouring map
 * @type {Map<string, function>}
 */
const colorMap = new Map().set("change", yellow);

/**
 * @summary Searches path starting from CWD for config
 * @returns {Promise<?object>}
 */
const findConfig = async () => {
    log("Searching for config file...");

    const configRegExp = /^\.*distrc\.*js\w*$/;

    recursiveDirLookupSync({
        onSuccess: (paths) => {
            console.log({ paths });
        },
        entryCallback: (path, fname) => /^\.*distrc\.*js\w*$/.test(fname),
        errorHandler: (error) => {
            console.warn(error);
            return null;
        }
    });

    try {
        const config = await dirR(
            process.cwd(),
            (path, fname) => configRegExp.test(fname)
        )
            .then(res => {
                const { length } = res;

                if (!length) {
                    log("No config file found, skipping...");
                    return null;
                }

                const examplesPath = pt.resolve(__dirname, '../examples');

                const examples = fs.readdirSync(examplesPath);

                const [configPath, nextConfigPath] = res;

                const caughtExample = examples.some(example => pt.join(examplesPath, example) === configPath);

                if (!caughtExample) {
                    log(`Found config file in "${configPath}"`);
                    return parseFile(configPath);
                }

                if (caughtExample && !nextConfigPath) {
                    log("No config file found, skipping...");
                    return null;
                }

                log(`Found config file in "${nextConfigPath}"`);
                return parseFile(nextConfigPath);
            });

        return config;
    }
    catch (configErr) {
        //TODO: handle

        return null;
    }
};

/**
 * @summary Entry iterator
 * @param {string} path
 * @param {fs.Dirent[]} entriesToCheck
 * @param {DistributorArgs} [config]
 * @returns {Promise<fs.Dirent[]>}
 */
const iterateEntries = async (path, entriesToCheck, config = {}) => {
    const { ignore, order } = config;

    const noIgnore = ignore.length === 0;

    const entries = [];

    for (const entry of entriesToCheck) {
        entry.path = path;

        try {

            if (noIgnore) {
                await directoryFork(path, entries, entry, config);
                continue;
            }

            //grep on execSync will throw on no match
            ignore.every(
                check => {
                    execSync(`grep -E "${check}" -`, {
                        input: entry.name
                    });
                }
            );

        } catch (error) {
            await directoryFork(path, entries, entry, config);
        }
    }

    const { length } = order;

    length && entries
        .sort((a, b) => {
            const aOrder = order.lastIndexOf(a.name);
            const bOrder = order.lastIndexOf(b.name);
            return aOrder - bOrder;
        });

    return entries;
};

/**
 * @summary Pushes entry to entries list or recurses
 * @param {string} path
 * @param {fs.Dirent[]} entries 
 * @param {fs.Dirent} entry 
 * @param {DistributorArgs} config
 * @returns {Promise<fs.Dirent[]>}
 */
const directoryFork = async (path, entries, entry, config) => {

    if (entry.isDirectory()) {

        const { name } = entry;

        const dirPath = pt.join(path, name);

        const subEntries = fs.readdirSync(dirPath, { withFileTypes: true });

        entries.push(...(await iterateEntries(dirPath, subEntries, config)));
        return;
    }

    entries.push(entry);

    return entries;
};

/**
 * @summary opens module wrapper
 * @param {string} output
 * @param {ModuleConfig} moduleConfig
 * @param {number} [start]
 * @returns {number}
 */
const openModule = (output, { moduleName: name, moduleType: type }, start = 0) => {

    if (type === 'none') {
        return start;
    }

    let moduleOpener = '';

    if (type === 'web') {

        moduleOpener += `(function ${name}(context) {
        
            context["${name}"] = ${name};
            
        `;
    }

    if (moduleOpener) {
        const writeStream = fs.createWriteStream(output, { flags: "r+", start });
        writeStream.write(`${moduleOpener}\n`);
        return start + Buffer.byteLength(moduleOpener) + 1;
    }

    return start;
};

/**
 * @summary closes module wrapper
 * @param {string} output
 * @param {ModuleConfig} moduleConfig
 * @param {number} [start]
 * @returns {number}
 */
const closeModule = (output, { moduleType: type }, start = 0) => {

    if (type === 'none') {
        return;
    }

    let moduleCloser = '';

    if (type === 'web') {

        moduleCloser += `})( typeof window !== "undefined" ? window : this );`;

    }

    if (moduleCloser) {
        const writeStream = fs.createWriteStream(output, { flags: "r+", start });
        writeStream.write(`${moduleCloser}\n`);
        return start + Buffer.byteLength(moduleCloser) + 1;
    }

    return start;
};

/**
 * @summary pipes stream through extractor and appends separator
 * @param {State} state
 * @param {string} separator 
 */
const pipeAndAddSeparator = (state, separator) =>

    /**
     * @param {NodeJS.ReadableStream} input
     * @param {NodeJS.WritableStream} output
     * @returns {Promise<number>}
     */
    async (input, output, start) => {
        const { extractor } = state;

        start = start > 0 ? start - 2 : 0;

        const outputStream = fs.createWriteStream(output, { flags: "r+", start });

        await asyncPipeline(
            input,
            extractor,
            outputStream
        );

        const { currentSize } = extractor;
        extractor.resetCurrentSize();
        return currentSize + Buffer.byteLength(separator) + 1;
    };

/**
 * @summary pipes entry in output
 * @param {State} state
 * @param {DistributorArgs} [config]
 */
const pipeEntry = (state, {
    output,
    exclude,
    separator,
    tsConfig,
    tsInstalled
} = {}) =>

    /**
     * @param {number} start
     * @param {import("fs").Dirent} entry extended with "path"
     * @returns {Promise<number>}
     */
    async (start, entry) => {
        const { name } = entry;

        const PipedFile = {
            name,
            excluded: exclude.some(test => new RegExp(test).test(name)),
            isJS: /.+\.js(?:on)?$/.test(name),
            isTS: /.+\.tsx?$/.test(name)
        };

        const fullPath = pt.resolve(entry.path, name);

        if (!entry.isFile() || PipedFile.excluded) {
            return Promise.resolve(0);
        }

        //TODO: write branching for different file types
        log(`Piping entry ${name}`);

        const commonPipeAndSeparate = pipeAndAddSeparator(state, separator);

        //if we have a js or json file -> pipe to output with no change
        if (PipedFile.isJS) {
            const inputStream = fs.createReadStream(fullPath);
            return commonPipeAndSeparate(inputStream, output, start);
        }

        //if we have TypeScript -> pass through tsc and pipe
        if (PipedFile.isTS && tsInstalled) {

            const tsc = require("typescript");

            const { compilerOptions } = require(tsConfig);

            const content = await asyncReadfile(fullPath, { encoding: "utf-8" });

            const { outputText } = tsc.transpileModule(
                content, { compilerOptions }
            );

            const inputStream = readableFromString(`${outputText}\n${separator}`);
            return commonPipeAndSeparate(inputStream, output, start);
        }
    };



/**
 * @summary Pipes source files into dist
 * @param {State} state
 * @param {string} path 
 * @param {DistributorArgs} argv
 * @param {number} [startFrom]
 * @returns {Promise<number>}
 */
const readAndPipe = async ({
    state,
    path
}, argv) => {
    try {

        const topLevelEntries = await asyncReaddir(path, { withFileTypes: true });

        const { moduleConfig, output } = argv;

        const { size: distSize } = fs.statSync(output);

        const entries = await iterateEntries(path, topLevelEntries, argv);

        let startFrom = openModule(output, moduleConfig, 0);

        const preparedProcessing = pipeEntry(state, argv);

        await forAwait(entries, async (entry) => {
            startFrom += await preparedProcessing(startFrom, entry);
        });

        (startFrom < distSize) && asyncTrunc(output, startFrom);

        startFrom = closeModule(output, moduleConfig, startFrom);

        return startFrom;
    }
    catch (msg) {
        return log(msg);
    }
};

/**
 * @typedef {object} State
 * @property {ModuleExtractor} extractor
 */

/**
 * @summary pipes source files to dist
 * @param {DistributorArgs} argv
 * @returns {Promise<void>}
 */
const exportToDist = async (argv) => {

    log("Started preparing output");

    const { output, source } = argv;

    /** @type {State} */
    const state = {
        extractor: new ModuleExtractor()
    };

    //workaround for restarting stream
    state.extractor.on("end", () => {
        const newExtractor = new ModuleExtractor();
        newExtractor.inherit(state.extractor);
        state.extractor = newExtractor;
    });

    try {
        const status = await asyncExists(output);

        if (!status) {
            const parsed = pt.parse(output);

            const { dir } = parsed;

            log("Missing output folder, creating");
            fs.mkdirSync(dir, { recursive: true });
        }

        await asyncCreate(output, "");
    }
    catch (error) {
        log(error);
    }

    log("Finished preparing output");

    try {
        await readAndPipe({ state, path: source }, argv);

        const { extractor } = state;
        const { parsedImports } = extractor;

        const prepender = new Prepender({
            prepend: parsedImports,
            recursive: true,
            outName: output,
            srcName: output
        });

        await prepender.start();

    }
    catch (error) {
        log(error);
    }

    log(`Finished exporting:\n${output}`);
};

/**
 * @summary entry point
 * @param {Promise<DistributorArgs>} argv
 * @returns {Promise<void>}
 */
const run = async (argv) => {

    const preparedArgv = validateArgv(await argv);

    return new Promise((resolve) => {

        const { source, start, watch } = preparedArgv;

        const mainJob = () => exportToDist(preparedArgv).catch(log);

        const JOBS = makeJobQueue();

        JOBS.onFinished(() => {
            log(`${percentify(JOBS.percentage)} done`);
            resolve();
        });

        JOBS.runOnNewJob().enqueue(mainJob);

        start && JOBS.nextJob();

        watch && fs.watch(source, (event, fname) => {
            const colour = colorMap.get(event);

            log(colour(`Source file ${fname} ${event}d`));

            JOBS.enqueue(mainJob);
        });

    });

};


process
    .on("unhandledRejection", (error) => {
        Promise.resolve();
        log(`[FATAL] Could not complete dist flow:\n\n${error.message}`);
    });

module.exports = {
    findConfig,
    run
};