const { execSync } = require("child_process");
const fs = require("fs");
const pt = require("path");
const { promisify } = require("util");

const _ = require("lodash");
const { yellow } = require("chalk");

const asyncExists = promisify(fs.exists);
const asyncCreate = promisify(fs.appendFile);
const asyncDir = promisify(fs.opendir);
const asyncTrunc = promisify(fs.truncate);
const asyncReaddir = promisify(fs.readdir);

const { log, parseFile, percentify } = require("./utilities.js");
const { makeJobQueue } = require("./queue.js");

/**
 * @summary Event log colouring map
 * @type {Map<string, function>}
 */
const colorMap = new Map().set("change", yellow);

/**
 * @summary Directory iterator
 * @param {String} path 
 * @param {Function} callback 
 * @param {Function} [errorHandler]
 * @returns {Promise}
 * @async
 */
const dirR = async (path, callback, errorHandler = err => console.error(err)) => {

    /**
     * 
     * @param {fs.Dirent} entry 
     * @returns {Promise<any[]>}
     */
    const processEntry = async (entry) => {
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

    try {
        const files = await asyncReaddir(path, { withFileTypes: true });
        const result = await Promise.all(files.map(processEntry));

        return result.filter(e => e).flat();
    }
    catch (err) {
        return errorHandler(err);
    }
};

/**
 * @summary Searches path starting from CWD for config
 * @returns {Promise<?object>}
 * @async
 */
const findConfig = async () => {
    log("Searching for config file...");

    const configRegExp = /^\.*distrc\.*js\w*$/;

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
 * @param {fs.Dir} dir 
 * @param {String[]} [order]
 * @param {string[]} [ignore]
 * @returns {fs.Dirent[]}
 * @async
 */
const iterateEntries = async (dir, order = [], ignore = []) => {
    const entries = [];

    const noIgnore = ignore.length === 0;

    for await (const entry of dir) {
        try {

            if (noIgnore) {
                entries.push(entry);
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
            entries.push(entry);
        }
    }

    order && entries
        .sort((a, b) => {
            const aOrder = order.lastIndexOf(a.name);
            const bOrder = order.lastIndexOf(b.name);

            return aOrder - bOrder;
        });

    return entries;
};

/**
 * @summary Pipes source files into dist
 * @param {string} path 
 * @param {object} argv 
 * @param {number} [startFrom]
 * @returns {Promise<number>}
 */
const readAndPipe = (path, argv, startFrom = 0) => {
    return asyncDir(path)
        .then(async dir => {

            const { path } = dir;

            const { ignore, order, output, separator = '\n' } = argv;

            const { size: distSize } = fs.statSync(output);

            const entries = await iterateEntries(dir, order, ignore);

            const separatorByteAdd = Buffer.byteLength(separator) + 1;

            _.forEach(entries, async entry => {
                const { name } = entry;

                const fullPath = pt.resolve(path, name);

                if (entry.isDirectory()) {
                    startFrom = await readAndPipe(fullPath, argv, startFrom);
                    return;
                }

                const { size } = fs.statSync(fullPath);

                const reader = fs.createReadStream(fullPath);

                const dist = fs.createWriteStream(output, { flags: "r+", start: startFrom });

                reader.pipe(dist, { end: false });

                reader
                    .on('end', () => {
                        dist.end(`\n${separator}`);
                    });

                startFrom += (size + separatorByteAdd);
            });

            (startFrom < distSize) && asyncTrunc(output, startFrom);

            return startFrom;
        })
        .catch(log);
};

/**
 * @summary pipes source files to dist
 * @param {object} argv
 * @returns {Promise<void>}
 */
const exportToDist = (argv) => {
    log("Started preparing output");

    const { output, source } = argv;

    return asyncExists(output)
        .then(status => {

            if (!status) {
                const parsed = pt.parse(output);

                const { dir } = parsed;

                log("Missing output folder, creating");
                fs.mkdirSync(dir, { recursive: true });
            }

            return asyncCreate(output, "");
        })
        .catch(log)
        .then(() => {
            log("Finished preparing output");
            return readAndPipe(source, argv);
        })
        .catch(log)
        .finally(() => {
            log("Finished piping into output");
        });;
};


/**
 * @summary entry point
 * @param {Promise<object>} argv 
 * @returns {Promise<void>}
 */
const run = async (argv) => {

    const preparedArgv = await argv;

    const { source, start, watch } = preparedArgv;

    const mainJob = () => exportToDist(preparedArgv).catch(log);

    const JOBS = makeJobQueue();

    JOBS.onFinished(() => {
        log(`${percentify(JOBS.percentage)} done`);
    });

    JOBS.runOnNewJob().enqueue(mainJob);

    start && JOBS.nextJob();

    watch && fs.watch(source, (event, fname) => {
        const colour = colorMap.get(event);

        log(colour(`Source file ${fname} ${event}d`));

        JOBS.enqueue(mainJob);
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