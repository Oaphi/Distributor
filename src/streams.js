const {
    createReadStream,
    createWriteStream
} = require("fs");

const {
    appendFile,
    unlink
} = require("fs").promises;

const util = require("util");

const { Writable, Readable, Transform, pipeline } = require("stream");
const asyncPipeline = util.promisify(pipeline);

const { getQuasiUniqueHexString, log } = require("./utilities.js");

const OS = require("os");
const pt = require('path');
const { tsInstall } = require("./typescript.js");

const BYTES = {
    NEWLINE: 10
};

const CHARS = {
    NEWLINE: "\n"
};

/**
 * @typedef {function(string,number[]) : string} LineInspectorCallback
 * @callback LineInspectorCallback
 * @param {string} line
 * @param {number[]} lineBytes
 * @returns {string}
 */

/**
 * @typedef {object} ImportExportsReference
 * @property {boolean} destructured
 * @property {("var"|"let"|"const")} type
 * @property {Object.<string, ImportVariableProperties>} variables
 *
 * @typedef {object} ImportModuleReference
 * @property {ImportExportsReference} [full]
 * @property {ImportExportsReference}
 */

/**
 * @summary creates Readable Stream and prepushes a string to it
 * @param {string} data 
 * @param {import("stream").ReadableOptions} options 
 * @returns {NodeJS.ReadableStream}
 */
const readableFromString = (data, options = {}) => {
    const combinedOptions = Object.assign({}, options, { read() { } });
    const stream = new Readable(combinedOptions);
    stream.push(data);
    stream.push(null);
    return stream;
};

/**
 * @summary shifts buffer until newlines no longer at start
 * @param {Buffer} buffer 
 * @returns {Buffer}
 */
const shiftWhileNewLineAtStart = (buffer, newLineByte) => {
    while (buffer[0] === newLineByte) {
        buffer = buffer.slice(1);
    }
    return buffer;
};

/**
 * @summary error message namespace
 * @namespace
 */
const Errors = {
    Prepender: {
        TempFailure: "Failed to create temp file:",
        PipeFailure: "Failed to pipe temporary file:\nFalling back to appending file"
    }
};

class Tap extends Transform {

    constructor(opts) {
        super(opts);
    }

    _transform(chunk, encoding, callback) {
        console.log(`${chunk ? chunk.toString() : "no chunk"}`);
        this.push(chunk, encoding);
        callback();
    }

}

/**
 * @typedef {function(PrependerSuccess) : void} SuccessHandler
 */

/**
 * @typedef {Object} PrependerSuccess
 * @property {string} outputName
 * @property {string} sourceName
 * @property {number} sizeAdded
 * @event PrependerSuccess
 */

/**
 * @class
 */
class Prepender extends Writable {

    /**
     * @typedef {import("stream").WritableOptions} WritableOptions
     *
     * @typedef {object} PrependerConfig
     * @property {string} outName
     * @property {string} prepend
     * @property {string} srcName
     * @property {boolean} recursive
     * @property {SuccessHandler} onSuccess
     * 
     * @param {WritableOptions & PrependerConfig} config
     */
    constructor(config) {
        super(config);

        this.alreadyPrepended = false;

        const {
            outName,
            prepend,
            recursive,
            srcName,
            onSuccess = e => void e
        } = config;

        this.outName = outName;
        this.prepend = prepend;
        this.srcName = srcName;

        this.temp = (async () => {
            try {
                const uid = await getQuasiUniqueHexString();

                const tmpFileName = pt.join(OS.tmpdir(), `${uid}.tmp`);

                await appendFile(tmpFileName, "", { encoding: "utf-8" });

                this.tmpName = tmpFileName;

                return createWriteStream(tmpFileName);
            }
            catch (error) {
                log(`${error}\n${Errors.Prepender.TempFailure}`);
            }
        })();

        this.on("success", onSuccess);

        this.on("finish", async () => {
            const { outName, tmpName } = this;

            try {
                const input = createReadStream(tmpName);
                const output = createWriteStream(outName);
                await asyncPipeline(input, output);
                await unlink(tmpName);
                this.resolver();

            }
            catch (error) {
                log(`${error}\n${Errors.Prepender.PipeFailure}`);
                this.resolver(error);
            }
        });

        this.recursive = recursive || false;
    }

    /**
     * @summary starts the stream if recursive
     * @returns {Promise<Prepender>}
     */
    async start() {

        const { outName, prepend, recursive, srcName, temp } = this;

        if (recursive) {
            try {
                await temp;
                const src = createReadStream(srcName);
                await asyncPipeline(src, this);

                this.emit("success", {
                    outputName: outName,
                    sourceName: srcName,
                    sizeAdded: Buffer.byteLength(prepend)
                });

                await new Promise((resolve) => (this.resolver = resolve));
            }
            catch (error) {
                log(error);
            }
        }

        return this;
    }

    /**
     * @summary implementation of _transform
     * @param {string|Buffer} chunk
     * @param {strting} encoding
     * @param {function} callback
     * @returns {void}
     */
    _write(chunk, encoding, callback) {

        const { alreadyPrepended, temp } = this;

        temp.then(tmpStream => {

            if (!alreadyPrepended) {
                const { prepend } = this;

                const separatedPrepend = prepend + CHARS.NEWLINE;

                tmpStream.write(separatedPrepend);

                this.alreadyPrepended = true;
            }

            tmpStream.write(chunk);
            callback(null, chunk);
        });
    }
}

class LineInspector extends Transform {

    /**
     * @param {internal.TransformOptions} options
     */
    constructor(options = {}) {

        super(options);

        /** @type {LineInspectorCallback} */
        this.inspector = null;

        this.currentSize = 0;
    }

    /**
     * @summary implementation of _transform
     * @param {string|Buffer} chunk 
     * @param {strting} encoding
     * @param {function} callback
     * @returns {void}
     */
    _transform(chunk, encoding, callback) {

        this.breakAndInspect(chunk);

        callback();
    }

    /**
     * @summary Breaks a chunk into lines
     * @param {string|Buffer} chunk 
     * @returns {void}
     */
    breakAndInspect(chunk) {

        const { inspector } = this;

        const bufferized = shiftWhileNewLineAtStart(
            Buffer.from(chunk),
            BYTES.NEWLINE
        );

        const linecharBytes = [];

        for (const byte of bufferized) {
            if (byte === BYTES.NEWLINE) {
                break;
            }

            linecharBytes.push(byte);
        }

        const line = Buffer.from(linecharBytes).toString();
        const modified = inspector(line, linecharBytes);

        this.currentSize += Buffer.byteLength(modified);

        this.push(modified);

        const { length } = linecharBytes;
        const { length: bufferedLength } = bufferized;

        if (length === bufferedLength) {
            return;
        }

        return this.breakAndInspect(bufferized.slice(length));
    }

    /**
     * @summary resets current processed size
     * @returns {LineInspector}
     */
    resetCurrentSize() {
        this.currentSize = 0;
        return this;
    }

    /**
     * @summary sets line inspecting callback
     * @param {LineInspectorCallback} callback
     * @returns {LineInspector}
     */
    setInspector(callback) {
        if (typeof callback === 'function') {
            this.inspector = callback;
        }
        return this;
    }

}

class ModuleExtractor extends LineInspector {

    /**
     * @param {import("stream").TransformOptions} opts 
     */
    constructor(opts) {
        super(opts);

        this.imports = {};

        this.parsedImports = "";

        this.moduleRegExp = /(const|var|let)\s*({?)\s*((?:[\w$]+\s*(?:(?::?\s*\w+\s*)*),?\s*)+)}?\s*=\s*require\s*\((?:"|')([\w/.:-]+)(?:"|')\)\.?(\w+)?/;

        this.setInspector(
            (line) => this.matchRequire(line)
        );
        
        this.on("finish", () => {
            const { imports, parsedImports } = this;

            const importLines = Object
                .entries(imports)
                .map(entry => {
                    const [id, value] = entry;

                    let partType = "full";

                    const part = Object
                        .entries(value)
                        .map(subentry => {
                            const [key, importConfig] = subentry;
                            key !== "full" && (partType = key);
                            return importConfig;
                        })[0];

                    const { destructured, type, variables } = part;

                    const varNames = Object
                        .entries(variables)
                        .map(varEntries => {
                            const [name, alias] = varEntries;
                            return alias ? `${name} : ${alias}` : name;
                        })
                        .join(", ");

                    const partition = partType === "full" ? "" : `.${partType}`;

                    const wrappedNames = destructured ? `{ ${varNames} }` : varNames;

                    const requires = `${type} ${wrappedNames} = require("${id}")${partition};`;

                    return requires;
                });

            const prefixNewline = parsedImports ? CHARS.NEWLINE : "";
            this.parsedImports += `${prefixNewline}${importLines.join(CHARS.NEWLINE)}`;
        });
    }

    /**
     * @param {string} line 
     * @returns {string}
     */
    matchRequire(line) {

        const { moduleRegExp, imports } = this;

        const matched = line.match(moduleRegExp);

        if (!matched) {
            return line + CHARS.NEWLINE;
        }

        const trimmed = matched.map(group => group ? group.trim() : "");

        const [,
            declarationType,
            openBracket,
            nameString,
            moduleId,
            partialImport
        ] = trimmed;

        const moduleReference = imports[moduleId] || {};

        const type = partialImport ? partialImport : "full";

        /** @type {ImportExportsReference} */
        const exportsReference = moduleReference[type] || {
            destructured: !!openBracket,
            type: declarationType,
            variables: {}
        };

        const varNames = nameString.split(", ");

        const withAliases = varNames.map(name => name.split(/\s*:\s*/));

        withAliases.forEach(varName => {
            const [name, alias] = varName;
            exportsReference.variables[name] = alias;
        });

        moduleReference[type] = exportsReference;
        this.imports[moduleId] = moduleReference;

        return "";
    }
}

module.exports = {
    LineInspector,
    ModuleExtractor,
    Prepender,
    readableFromString,
    Tap
};