const { expect } = require("chai");

const fs = require('fs');
const os = require('os');
const pt = require('path');

const { 
    getQuasiUniqueHexString, 
    removeDirRecursive 
} = require("../src/utilities.js");

const { run } = require("../src/distribute.js");

describe('run', function () {

    this.timeout(5e3);

    it('Integration test: JS + TS', async function () {
        const tmp = os.tmpdir();

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

        process.on("beforeExit", () => removeDirRecursive(tmpName,[], true));

        await run(Promise.resolve({
            exclude: ["dist.js"],
            source: tmpName,
            output: tmpName
        }));

        const content = fs.readFileSync(tmpJSpath);
        expect(content).to.not.be.empty;
    });

});