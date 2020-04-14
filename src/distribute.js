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
const asyncStat = promisify(fs.stat);

const { isNotExistent, isNotPermitted, log, parseFile } = require("./utilities.js");
const { makeJobQueue } = require("./queue.js");


const CONFIG = {
    MAX_RETRY: 3
};

/**
 * @summary Event log colouring map
 * @type {Map<string, function>}
 */
const colorMap = new Map().set("change", yellow);

/**
 * 
 * @param {String} path 
 * @param {Function} callback 
 * @param {Function} [errorHandler]
 * @returns {Promise}
 * @async
 */
const dirR = async (path, callback, errorHandler = err => console.error(err)) => {

    const processEntry = async (fname) => {
        const entryPath = pt.join(path, fname);

        try {
            const stat = await asyncStat(entryPath);

            const isDir = stat.isDirectory();

            if (isDir) {
                return dirR(entryPath, callback);
            }

            const status = callback(entryPath, fname);

            if (status) {
                return entryPath;
            }

        }
        catch (statErr) {
            return errorHandler(statErr);
        }
    };

    try {
        const files = await asyncReaddir(path);
        const result = await Promise.all(files.map(processEntry));

        return result.filter(e => e).flat();
    }
    catch (err) {
        return errorHandler(err);
    }
};

/**
 * @summary Searches path starting from CWD for config
 * @returns {Promise<object>}
 * @async
 */
const findConfig = async () => {
    log("Searching for config file...");

    try {
        const config = await dirR(
            process.cwd(),
            (path, fname) => /^\.*distrc\.*js\w*$/.test(fname)
        )
            .then(res => {
                const { length } = res;

                if (!length) {
                    log("No config file found, skipping...");
                    
                    return null;
                }

                const [configPath] = res;

                return parseFile(configPath);
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
 * @param {Dir} dir 
 * @param {String[]} [order]
 * @param {string[]} [ignore]
 * @returns {any[]}
 * @async
 */
const iterateEntries = async (dir, order = [], ignore = []) => {
    const entries = [];

    for await (const entry of dir) {
        try {

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
 * @summary stats the path or tries to create it
 * @param {string} path 
 * @param {number} [retried] 
 * @returns {object}
 * @throws {Error}
 */
const statIfExistOrCreate = (path, retried = 0) => {

    try {

        const stat = fs.statSync(path);

        return stat;

    } catch (error) {

        if (isNotPermitted(error)) {
            throw new Error("Not enough permissions to create path");
        }

        if (isNotExistent(error) && retried <= CONFIG.MAX_RETRY) {
            retried += 1;

            const parsedPath = pt.parse(path);

            const { dir } = parsedPath;

            fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true });

            fs.appendFileSync(path, "");

            return statIfExistOrCreate(path, retried);
        }

    }

};

/**
 * @summary pipes source files to dist
 * @param {object} argv
 * @returns {Promise<void>}
 */
const exportToDist = (argv) => {

    const { output, source } = argv;

    log("Started checking output");

    return asyncExists(output)
        .then(status => {
            log("Finished checking output");
            
            return !status && asyncCreate(output, "");
        })
        .catch(log)
        .then(() => asyncDir(source)
                .then(async dir => {
                    let startFrom = 0;

                    const { ignore, order } = argv;

                    const { size: distSize } = statIfExistOrCreate(output);

                    const entries = await iterateEntries(dir, order, ignore);

                    log("Started piping into output");

                    _.forEach(entries, entry => {
                        const { name } = entry;

                        const filePath = pt.join(dir.path, name);

                        const { size } = fs.statSync(filePath);

                        const dist = fs.createWriteStream(output, { flags: "r+", start: startFrom });

                        fs.createReadStream(filePath).pipe(dist).write("\n");

                        startFrom += size + 1;
                    });

                    (startFrom < distSize) && asyncTrunc(output, startFrom);
                })
                .catch(log)
                .finally(() => {
                    log("Finished piping into dist");
                }))
        .catch(log);
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
        log(`${Math.floor(JOBS.percentage * 100)}% done`);
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