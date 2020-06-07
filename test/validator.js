const { resolve } = require("path");

const { expect } = require("chai");

const { validateArgv } = require("../src/validators.js");

describe('validateArgv', function () {

    it('Should correctly set default values', function () {

        const config = validateArgv();

        expect(config.exclude).to.be.an("array").and.be.empty;
        expect(config.ignore).to.be.an("array").and.be.empty;
        expect(config.order).to.be.an("array").and.be.empty;
        expect(config.name).to.equal("dist.js");
        expect(config.source).to.equal("src");
        expect(config.output).to.equal(resolve("dist", "dist.js"));
    });

});