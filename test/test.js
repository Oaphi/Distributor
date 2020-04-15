const { makeJobQueue } = require('../src/queue.js');

const { expect } = require('chai');



describe('Distributor', () => {

    it('should use distrc if any present', function () {

    });

});

describe('Job control', function () {

    let JC;

    this.beforeEach(() => {
        JC = makeJobQueue();
    });

    it('should assign control to job', function () {
        const job = () => [].concat([1]);

        JC.enqueue(job);

        const [firstJob] = JC.getJobs();

        expect(firstJob.control).to.be.deep.equal(JC);
    });

    it('should run enqueued job correctly', function () {
        let count = 0;

        const job = () => count++;

        JC.enqueue(job);

        const [enqueued] = JC.getJobs();

        expect(enqueued).to.exist;

        JC.nextJob();

        expect(count).to.equal(1);
    });

    it('should block until finished job', function () {
        let count = 0;

        this.timeout(5000);

        const job = () => count++;

        JC.enqueue(job).enqueue(job);

        JC.nextJob().nextJob();

        expect(count).to.equal(1);
    });

    it('should enqueue blocked job', function (done) {
        let count = 0;

        this.slow(300);

        const job1 = () => new Promise((r, j) => {
            setTimeout(() => {
                count++;
                r();
            }, 100);
        });

        const job2 = () => count += 2;

        JC
            .enqueue(job1).enqueue(job2)
            .nextJob().nextJob();

        setTimeout(() => JC.nextJob(), 101);

        setTimeout(() => {
            expect(count).to.equal(3);
            expect(JC.size).to.equal(0);
            done();
        }, 102);
    });

    it('should eventually run all jobs', function (done) {
        const job1 = async () => "Ann";
        const job2 = async () => "John";
        const job3 = () => 1e3 * 60 * 60 * 24;

        JC.enqueue(job1).enqueue(job2).enqueue(job3).run();

        JC.onDone(() => {
            expect(JC.size).to.equal(0);
            done();
        });

    });

    it('should dequeue jobs that failed and add to failed', function () {
        const div0 = () => ({}).not.exists;

        JC.enqueue(div0).run();

        JC.onDone(() => {
            expect(JC.size).to.equal(0);
            expect(JC.failed).to.equal(1);
        });
    });

    it('should dequeue jobs that succeeded and add to complete', function () {
        const sum = (a, b) => a + b;

        JC
            .enqueue(sum)
            .onDone(() => {
                const { completeJobs, size, failedJobs } = JC;
                
                expect(failedJobs.length).to.equal(0);
                expect(completeJobs.length).to.equal(1);
                expect(size).to.equal(0);
            })
            .run(2, 3);
    });

    it('should return correct completion percentage', function (done) {
        const job1 = () => 42;
        const job2 = async () => new Promise((r, j) => {
            setTimeout(r, 100);
        });
        const job3 = () => "I am a job";

        JC.enqueue(job1, job2, job3);

        this.slow(300);

        let start = 0;

        JC
            .onDone(() => done())
            .onFinished(() => {
                const { percentage, processed } = JC;

                try {
                    const percentToCompare = parseFloat((processed / 3).toFixed(2));

                    expect(processed).to.equal(start += 1);
                    expect(percentage === percentToCompare).to.be.true;
                }
                catch (assetionError) {
                    done(assetionError);
                }
            })
            .run();
    });

    describe('resetOnDone()', function () {

        it('should reset percentage and jobs done on rerun', function (done) {
            const job1 = () => 2 * 24;
            const job2 = async () => await "end";

            JC.resetOnDone();

            JC.enqueue(job1, job2).run();
            JC.enqueue(job1, job2).run();

            JC.onDone(() => {
                const { complete, failed, percentage, size } = JC;

                try {
                    expect(percentage).to.equal(parseFloat((0).toFixed(2)));
                    expect(complete + failed + size).to.equal(0);
                    done();
                } catch (error) {
                    done(error);
                }
            });

        });

    });

    describe('runOnNewJob()', function () {

        it('should make job control run on new job in', function () {
            let floor = 0;

            const goUp = () => floor++;
            const goDown = () => floor--;

            JC.enqueue(goUp).runOnNewJob().enqueue(goDown);

            JC.onDone(() => {
                expect(floor).to.equal(0);
                expect(JC.size).to.equal(0);
            });

        });

    });

});