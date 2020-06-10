const { expect } = require("chai");

const {
    appendFileSync,
    createReadStream,
    createWriteStream,
    mkdtempSync,
    unlinkSync
} = require("fs");

const {
    unlink
} = require("fs").promises;

const {
    Writable,
    Readable,
    pipeline
} = require("stream");

const OS = require("os");

const {
    ModuleExtractor,
    Prepender
} = require("../src/streams.js");

const {
    removeDirRecursive
} = require("../src/utilities.js");

describe('Prepender', function () {

    it('should correctly prepend data', function () {

        const tmp = mkdtempSync(OS.tmpdir());
        const tmpFilePath = `${tmp}/tmpInput.tmp`;
        const tmpOutFilePath = `${tmp}/tmpOut.tmp`;

        appendFileSync(tmpFilePath, "some data\nsome more\nmany more");

        const prepender = new Prepender({
            recursive: true,
            outName: tmpOutFilePath,
            prepend: "HEADER",
            srcName: tmpFilePath
        });

        prepender.start();

        process.once("beforeExit", () => removeDirRecursive(tmp, [], true));
    });

});

describe('Intergration Test', function () {

    it('Should extract modules, hoist and pass through', function () {

        const readable = new Readable({
            read() { }
        });

        const pass = new ModuleExtractor();

        const testLines = [
            "const simpleConst = require(\"testId\")",
            "const { destConst } = require(\"other-id\")",
            "const testConst = require(\"other-id\")",
            "const { a, b, c12, gzip, $ } = require(\"https://example.com\")",
            "some normal line without requires",
            "let { highFive } = require(\"someModule\").patition",
            "var { a : b, b : _c, d : e2 } = require(\"gotcha\")",
            "2\n3\n4\n5",
            null
        ];

        const referenceLines = [
            'const simpleConst = require("testId");',
            'const { destConst, testConst } = require("other-id");',
            'const { a, b, c12, gzip, $ } = require("https://example.com");',
            'let { highFive } = require("someModule").patition;',
            'var { a : b, b : _c, d : e2 } = require("gotcha");',
            'some normal line without requires', '2', '3', '4', '5'
        ];

        testLines.forEach(line => readable.push(line));

        const outTestName = "./src/TEST.txt";

        const expector = new Writable({
            write(chunk, encoding, callback) {
                const stringified = chunk.toString();

                const lines = stringified.split("\n");

                const result = lines.filter(Boolean).every(line => referenceLines.includes(line));

                expect(result).to.be.true;
                callback(null, chunk);
            }
        });

        process.once("beforeExit", () => unlink(outTestName));

        const file = createWriteStream(outTestName);

        pipeline(
            readable,
            pass,
            file,
            () => {
                const readFile = createReadStream(outTestName);

                const prepender = new Prepender({
                    prepend: pass.parsedImports,
                    outName: outTestName,
                    srcName: outTestName,
                });

                readFile
                    .pipe(prepender)
                    .pipe(expector);
            }
        );
    });

});