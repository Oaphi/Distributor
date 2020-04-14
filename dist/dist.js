
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
const _ = require("lodash");

const { clear, copyWithGetters, pushIfNew } = require("./utilities.js");

/**
 * @summary Job constructor
 * @param {object} control 
 * @param {function} callback 
 * @class
 */
function Job(control, callback) {

    let running = 0;

    let lastError = null;

    return {
        control,

        run: async (...args) => {

            running |= 1;

            const res = await callback(...args);

            running ^= 1;

            return res;
        },

        get error() {
            return lastError;
        },

        set error(val) {
            val instanceof Error && (lastError = val);
        },

        get running() {
            return Boolean(running);
        }
    };
}

/**
 * @summary Finds index of job last ran
 * @param {Job[]} queue 
 * @returns {number}
 */
function runningIndex(queue) {
    return _.findLastIndex(queue, { running: true });
}

/**
 * @typedef {object} JobQueue
 * @property {Job[]} completeJobs
 * @property {boolean} empty
 * @property {object} events
 * @property {number} failed
 * @property {Job[]} failedJobs
 * @property {number} percentage
 * @property {number} processed
 * @property {boolean} processing
 * @property {Job} runningJob
 * @property {number} size
 * @property {Job[]} queue
 */

/**
 * @summary Factory for Job queues
 * @returns {JobQueue}
 */
function makeJobQueue() {

    const proto = {

        events: Object.seal({
            added: [],
            done: [],
            finished: []
        }),

        completeJobs: [],
        failedJobs: [],
        
        queue: [],

        /**
         * @summary Number of complete jobs getter
         * @returns {number}
         */
        get complete() {
            return this.completeJobs.length;
        },

        /**
         * @summary No jobs left getter
         * @returns {boolean}
         */
        get empty() {
            return this.queue.length === 0;
        },

        /**
         * @summary Number of failed jobs getter
         * @returns {number}
         */
        get failed() {
            return this.failedJobs.length;
        },

        /**
         * @summary Percent of processed jobs getter
         * @returns {number}
         */
        get percentage() {
            const { processed, size } = this;

            const total = processed + size;

            if(!total) {
                return 0;
            }

            const done = processed / ( processed + size );
            
            return parseFloat((done).toFixed(2));
        },

        /**
         * @summary Number of processed jobs getter
         * @returns {number}
         */
        get processed() {
            const { complete, failed } = this;
            return complete + failed;
        },

        /**
         * @summary Any jobs running getter
         * @returns {boolean}
         */
        get processing() {
            return this.queue.some(job => job.running);
        },

        /**
         * @summary Current active job getter
         * @returns {Job}
         */
        get runningJob() {
            const { queue } = this;

            return _.findLast(queue, { running: true });
        },

        /**
         * @summary Queue size getter
         * @returns {number}
         */
        get size() {
            return this.queue.length;
        },

        /**
         * @summary Removes job from queue
         * @returns {JobQueue}
         */
        dequeue() {
            const { queue } = this;

            queue.shift();

            return this;
        },

        /**
         * @summary Emits event
         * @param {string} type 
         * @param  {...any} args 
         * @returns {JobQueue}
         */
        emit(type, ...args) {
            const { events } = this;

            const listeners = events[type];

            if (!listeners) {
                return this;
            }

            for (const listener of listeners) {
                listener(this, ...args);
            }

            return this;
        },

        /**
         * @summary Adds a job to queue
         * @param  {...any} jobs 
         * @returns {JobQueue}
         */
        enqueue(...jobs) {

            for (const job of jobs) {
                const jobToRun = new Job(this, job);
                this.queue.push(jobToRun);
                this.emit("added", jobToRun);
            }

            return this;
        },

        /**
         * @summary Gets queued jobs
         * @returns {Job[]}
         */
        getJobs() {
            const { queue } = this;
            return queue.map(job => job);
        },

        /**
         * @summary starts next job if possible
         * @param  {...any} args 
         * @returns {JobQueue}
         * @emits JobQueue#finished
         * @emits JobQueue#done
         */
        nextJob(...args) {
            const { completeJobs, failedJobs, empty, queue, processing } = this;

            if (empty) {
                return this;
            }

            const lastRI = runningIndex(queue);

            if (!processing) {
                const jobToRun = queue[lastRI + 1];

                const runningJob = jobToRun.run(...args);

                const boundDequeue = this.dequeue.bind(this);

                runningJob
                    .then(() => {
                        pushIfNew(completeJobs, jobToRun);
                    })
                    .catch(error => {

                        jobToRun.error = error;

                        pushIfNew(failedJobs, jobToRun);

                    })
                    .finally(() => {
                        boundDequeue();

                        this.emit("finished", runningJob);

                        if (this.empty) {
                            this.emit("done", runningJob);
                        }
                    });
            }

            return this;
        },

        /**
         * @summary Removes event listener
         * @param {string} type 
         * @param {function} listener 
         * @returns {JobQueue}
         */
        off(type, listener) {
            const { events } = this;
            const listeners = events[type];

            if (listeners) {
                const index = listeners.indexOf(listener);
                index > -1 && listeners.splice(index, 1);
            }

            return this;
        },

        /**
         * @summary Adds event listener
         * @param {string} type 
         * @param {function} listener 
         * @returns {JobQueue}
         */
        on(type, listener) {
            const { events } = this;
            const listeners = events[type];

            listeners && pushIfNew(listeners, listener);

            return this;
        },

        /**
         * @summary Alias for adding listener to "done" event
         * @param {function} callback 
         * @returns {JobQueue}
         * @listens JobQueue#done
         */
        onDone(callback) {
            this.on("done", callback);
            return this;
        },

        /**
         * @summary Aliad for adding listener to "finished" event
         * @param {function} callback 
         * @returns {JobQueue}
         * @listens JobQueue#finished
         */
        onFinished(callback) {
            this.on("finished", callback);
            return this;
        },

        /**
         * @summary Alias for adding listener to "added" event
         * @param {function} callback 
         * @returns {JobQueue}
         * @listens JobQueue#added
         */
        onNewJob(callback) {
            this.on("added", callback);

            return this;
        },

        /**
         * @summary Resets queue when it is done
         * @returns {JobQueue}
         * @listens JobQueue#done
         */
        resetOnDone() {
            this.on('done',() => {
                const { completeJobs, failedJobs } = this;
                clear(completeJobs);
                clear(failedJobs);
            });

            return this;
        },

        /**
         * @summary Runs the queue in sequence
         * @param  {...any} args 
         * @returns {JobQueue}
         */
        run(...args) {
            const { processing } = this;

            const listener = () => this.nextJob(...args);

            this.onFinished(listener);

            !processing && listener();

            return this;
        },

        /**
         * @summary Runs queue when a job is added
         * @param  {...any} args 
         * @returns {JobQueue}
         */
        runOnNewJob(...args) {
            this.onNewJob(() => this.run(...args));

            return this;
        }

    };

    return copyWithGetters({}, proto);
}

module.exports = {
    Job,
    makeJobQueue
};
const _ = require("lodash");

const fs = require("fs");

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

const clear = (array) => (array.length = 0);

module.exports = {
    clear,
    copyWithGetters,
    isNotExistent,
    isNotPermitted,
    log,
    parseFile,
    pushIfNew
};