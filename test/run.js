const { expect } = require("chai");

const fs = require('fs');
const os = require('os');
const pt = require('path');

const { appendFile } = fs.promises;

const {
    getQuasiUniqueHexString,
    removeDirRecursive
} = require("../src/utilities.js");

const { run } = require("../src/distribute.js");

describe('run', function () {
    const tmp = os.tmpdir();

    this.timeout(5e3);

    it('should correctly work with several files', async function () {
        const folderName = await getQuasiUniqueHexString();
        const tmpName = pt.join(tmp, folderName);

        fs.mkdirSync(tmpName);

        const files = new Array(20).fill(1).map((p, i) => {
            const tmpJSpath = pt.join(tmpName, `temp_file${i}.js`);
            return appendFile(
                tmpJSpath,
                `const {test} = require("test${i}");` + "repeated line\n".repeat(200)
            );
        });

        await Promise.all(files);

        const separator = "=======================";

        await run(Promise.resolve({
            ignore: [
                "dist*"
            ],
            source: tmpName,
            output: tmpName,
            separator,
            start: true
        }));

        const content = fs.readFileSync(pt.join(tmpName, "dist.js"), { encoding: "utf-8" });
        expect(content).to.include(`const { test } = require("test2");`);
        expect(content).to.include(separator);

        process.on("beforeExit", () => removeDirRecursive(tmpName, [], true));
    });

    it('should separate files correctly', function () {



    });

    it('Integration test: JS + TS', async function () {
        const folderName = await getQuasiUniqueHexString();
        const tmpName = pt.join(tmp, folderName);

        const tmpJSpath = pt.join(tmpName, "temp_file.js");
        const tmpTSpath = pt.join(tmpName, "temp_file.ts");

        const jsData = `

            const second = "second line";

            const { readdir } = require("fs").promises;

            function fibonacci(n = 1, acc = [0]) {

                if(n === 1) {
                    return acc;
                }

                const len = acc.length;

                acc.push( acc[len - 1] + acc[len - 2] || 1 );

                return fibonacci(n - 1, acc);
            }
        `;

        const tsData = `
            interface Label {
                first : string;
                second: string;
            }

            const { execSync } = require("child_process");

            enum = Weekends {
                saturday = 0,
                sunday = 1,
            }
        `;

        fs.mkdirSync(tmpName);
        fs.appendFileSync(tmpJSpath, jsData);
        fs.appendFileSync(tmpTSpath, tsData);

        process.on("beforeExit", () => removeDirRecursive(tmpName, [], true));

        await run(Promise.resolve({
            exclude: ["dist.js"],
            source: tmpName,
            output: tmpName
        }));

        const content = fs.readFileSync(tmpJSpath);
        expect(content).to.not.be.empty;
    });

});