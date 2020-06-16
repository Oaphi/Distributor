const { expect } = require("chai");

const {
    appendFileSync,
    createReadStream,
    createWriteStream,
    mkdtempSync,
    unlinkSync
} = require("fs");

const { unlink } = require("fs").promises;

const { Writable, Readable, pipeline } = require("stream");

const { promisify } = require("util");
const asyncPipeline = promisify(pipeline);

const OS = require("os");

const {
    ModuleExtractor,
    Prepender
} = require("../src/streams.js");

const {
    removeDirRecursive
} = require("../src/utilities.js");

describe('Prepender', function () {

    it('should correctly prepend data', async function () {

        try {
            const tmp = mkdtempSync(OS.tmpdir());
            const tmpFilePath = `${tmp}/tmpInput.tmp`;
            const tmpOutFilePath = `${tmp}/tmpOut.tmp`;

            appendFileSync(tmpFilePath, "some data\nsome more\nmany more");

            const prepender = new Prepender({
                recursive: true,
                outName: tmpOutFilePath,
                prepend: "HEADER",
                srcName: tmpFilePath,
            });

            await prepender.start();

            process.once("beforeExit", () => removeDirRecursive(tmp, [], true));
        } catch (error) {
            console.log(`Running in environment with no access to temp, skip...\n${error}`);
        }
    });

});

describe('Intergration Test', function () {

    it('Should extract modules, hoist and pass through', async function () {

        try {

            const readable = new Readable({ read() { } });

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

            testLines.forEach(line => readable.push(line));

            const outTestName = "./src/TEST.txt";

            process.once("beforeExit", () => unlink(outTestName));

            const file = createWriteStream(outTestName);

            await asyncPipeline(readable, pass, file);

            const { parsedImports } = pass;

            const prepender = new Prepender({
                onSuccess: (event) => {
                    const { outputName, sizeAdded, sourceName } = event;
                    
                    expect(outputName).to.equal(outTestName);
                    expect(sourceName).to.equal(outTestName);
                    expect(sizeAdded).to.equal(Buffer.byteLength( parsedImports ));
                },
                prepend: pass.parsedImports,
                outName: outTestName,
                srcName: outTestName,
                recursive: true
            });

            await prepender.start();
        }
        catch (error) {
            console.log(error);
        }

    });

});