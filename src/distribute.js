const { execSync } = require('child_process');
const fs = require('fs');
const pt = require('path');
const { promisify } = require('util');

const yargs = require('yargs');

const { yellow } = require('chalk');

const asyncExists = promisify(fs.exists);
const asyncCreate = promisify(fs.appendFile);
const asyncDir = promisify(fs.opendir);
const asyncTrunc = promisify(fs.truncate);
const asyncReaddir = promisify(fs.readdir);
const asyncStat = promisify(fs.stat);

const log = msg => process.stdout.write(`${JSON.stringify(msg)}\n`);

/**
 * 
 * @param {String} path 
 * @param {Function} callback 
 * @param {Function} [errorHandler]
 * @returns {Promise}
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

const findConfig = async () => {
    log(`Searching for config file...`);

    try {
        const config = await dirR(process.cwd(), (path, fname) => /^\.*distrc\.js\w*$/.test(fname))
            .then(res => {
                const { length } = res;

                if (!length) {
                    log(`No config file found, skipping...`);
                    return null;
                }

                const config = fs.readFileSync(res[0]);
                const parsed = JSON.parse(config);
                return parsed;
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
 * @param {String[]} order
 * @param {string[]} ignore
 * @returns {any[]}
 */
const iterateEntries = async (dir, order, ignore) => {
    const entries = [];


    for await (const entry of dir) {
        try {

            //grep on execSync will throw on no match

            ignore.every(
                check => {
                    execSync(`grep -E "${check}" -`,{
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
 * 
 * @param {*} config 
 */
const exportToDist = (argv = {}) => (config = {}) => {

    const { output, source } = argv;

    asyncExists(output)
        .then(status => {
            log('Finished checking dist');
            return !status && asyncCreate(output, '');
        })
        .catch(creationError => {
            console.warn({ creationError });
        })
        .then(() => {

            asyncDir(source)
                .then(async dir => {
                    let startFrom = 0;

                    const { size: distSize } = fs.statSync(output);

                    const { ignore = [], order } = config;

                    const entries = await iterateEntries(dir, order, ignore);

                    log('Started piping into dist');

                    for (const entry of entries) {
                        const { name } = entry;

                        const filePath = pt.join(dir.path, name);

                        const { size } = fs.statSync(filePath);

                        const dist = fs.createWriteStream(output, { flags: 'r+', start: startFrom });

                        fs.createReadStream(filePath).pipe(dist).write('\n');

                        startFrom += size + 1;
                    }

                    (startFrom < distSize) && asyncTrunc(output, startFrom);
                })
                .catch(updateError => {
                    console.warn({ updateError });
                })
                .finally(() => log('Finished piping into dist'));
        });
};

const colorMap = new Map().set('change', yellow);

yargs
    .options({
        'source': {
            aliases: ["i", "input"],
            type: "string",
            default: "src",
            describe: "Source path"
        },
        'name': {
            type: "string",
            default: "dist.js",
            describe: "Output file path"
        },
        'output': {
            aliases: ["o", "out"],
            type: "string",
            default: "dist",
            describe: "Output source path"
        },
        'start': {
            alias: "s",
            type: "boolean",
            default: false,
            describe: "Pipe at launch"
        },
        'watch': {
            alias: "w",
            type: "boolean",
            default: false,
            describe: "Watch files"
        }
    })
    .command('$0','Pipes files into distribution')
    .middleware( (args) => {
        const { name, output } = args;
        const outputPath = pt.resolve(output, name);
        args.output = outputPath;
    })
    .help();

const run = (argv) => {

    log({ argv });

    const { start, source, watch } = argv;

    const distWithArgs = exportToDist(argv);

    start && findConfig()
        .then(distWithArgs)
        .catch(log);

    watch && fs.watch(source, async (event, fname) => {
        const colour = colorMap.get(event);

        log(colour(`Source file ${fname} ${event}d`));

        await findConfig()
        .then(distWithArgs)
        .catch(log);
    });

};

run(yargs.argv);