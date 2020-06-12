const { appendFileSync, existsSync, readFileSync, mkdirSync } = require("fs");
const pt = require('path');


const { expect } = require("chai");

const { removeDirRecursive } = require('../src/utilities.js');

const { findTsConfig } = require("../src/typescript.js");

const { run } = require("../src/distribute.js");

describe('findTsConfig', function () {

    this.timeout(3e3);

    it('should return null if not found', function () {
        const config = findTsConfig({ pathToStart: "./src" });
        expect(config).to.be.null;
    });

    it('should return parsed config if found', function () {

        const config = findTsConfig();

        expect(config).to.be.an.instanceof(Object);
        expect(config).to.have.property("compilerOptions");
    });

    describe('Options', function () {

        it('closestToStart: should return last found if set to false', function () {

            const config = findTsConfig({ pathOnly: true, closestToStart: false });

            expect(config).to.match(/node_modules/);
        });

        it('pathOnly: should return string only if set', function () {

            const config = findTsConfig({ pathOnly: true });

            expect(config).to.be.a("string");
        });
    });

});

describe("Typescript parsing", function () {

    const testOutputFolder = pt.join(__dirname, "test_ts_config");
    const tsTestFilePath = pt.join(testOutputFolder, "test_typescript.ts");
    const jsTestFilePath = `${tsTestFilePath.slice(0, -2)}js`;

    it('should correctly perform workflow', async function () {

        //should run on typescript only, compile ts -> js, output here
        const config = {
            ignore: ["*.js"],
            name: jsTestFilePath,
            output: testOutputFolder,
            start: true,
            source: __dirname
        };

        //is not valid JS
        const data = `declare var Numbers : number[];

        const header = "Requires should go before this line";
        
        const { readdir } = require("fs");

        class Test {
            test : string;
            constructor() {
                this.test = "we did it!";
            }
        }`;

        //create test folder
        !existsSync(testOutputFolder) && mkdirSync(testOutputFolder);

        //create a .ts file
        appendFileSync(tsTestFilePath, data, { encoding: "utf8" });

        await run(Promise.resolve(config));

        expect(existsSync(jsTestFilePath)).to.be.true;

        const testContent = readFileSync(jsTestFilePath, { encoding: "utf8" });

        expect(testContent.includes(data)).to.be.false;
    });

    //clean up
    process.once('beforeExit', () => removeDirRecursive(testOutputFolder, [], true));

});