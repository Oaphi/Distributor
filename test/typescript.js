const { appendFileSync, existsSync, readFileSync, mkdirSync } = require("fs");

const { expect } = require("chai");

const { removeDirRecursive } = require('../src/utilities.js');

const { findTsConfig } = require("../src/typescript.js");

const { run } = require("../src/distribute.js");

describe('findTsConfig', function () {

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
            
            const config = findTsConfig({ pathOnly: true, closestToStart : false });

            expect(config).to.match(/node_modules/);
        });
        
        it('pathOnly: should return string only if set', function () {

            const config = findTsConfig({ pathOnly : true });

            expect(config).to.be.a("string");
        });
    });

});

describe("Typescript parsing", function () {

    const testOutputFolder = `${__dirname}/test_ts_config`;
    const tsTestFilePath = `${testOutputFolder}/test_typescript.ts`;

    it('should correctly perform workflow', async function () {

        //should run on typescript only, compile ts -> js, output here
        const config = {
            ignore: "*.js",
            name: "test_typescript.js",
            output: testOutputFolder,
            start: true,
            source: __dirname
        };

        const tsTestOutFilePath = `${testOutputFolder}/${config.name}`;

        //is not valid JS
        const data = `declare var Numbers : number[];\n`;

        //create test folder
        !existsSync(testOutputFolder) && mkdirSync(testOutputFolder);

        //create a .ts file
        appendFileSync(tsTestFilePath, data, { encoding: "utf8" });

        await run(Promise.resolve(config));

        expect(existsSync(tsTestOutFilePath)).to.be.true;

        const testContent = readFileSync(tsTestOutFilePath, { encoding: "utf8" });

        expect(testContent.includes(data)).to.be.false;

        //clean up
        process.once('beforeExit', () => removeDirRecursive(testOutputFolder, [], true));

    });

});