const _ = require("lodash");

const { clear, copyWithGetters, pushIfNew } = require("./utilities.js");

/**
 * @summary Job constructor
 * @param {object} control 
 * @param {function} callback 
 * @class
 */
function Job(control, callback) {

    let running = 0;

    let lastError = null;

    return {
        control,

        run: async (...args) => {

            running |= 1;

            const res = await callback(...args);

            running ^= 1;

            return res;
        },

        get error() {
            return lastError;
        },

        set error(val) {
            val instanceof Error && (lastError = val);
        },

        get running() {
            return Boolean(running);
        }
    };
}

/**
 * @summary Finds index of job last ran
 * @param {Job[]} queue 
 * @returns {number}
 */
function runningIndex(queue) {
    return _.findLastIndex(queue, { running: true });
}

/**
 * @typedef {object} JobQueue
 * @property {Job[]} completeJobs
 * @property {boolean} empty
 * @property {object} events
 * @property {number} failed
 * @property {Job[]} failedJobs
 * @property {number} percentage
 * @property {number} processed
 * @property {boolean} processing
 * @property {Job} runningJob
 * @property {number} size
 * @property {Job[]} queue
 */

/**
 * @summary Factory for Job queues
 * @returns {JobQueue}
 */
function makeJobQueue() {

    const proto = {

        events: Object.seal({
            added: [],
            done: [],
            finished: []
        }),

        completeJobs: [],
        failedJobs: [],
        
        queue: [],

        /**
         * @summary Number of complete jobs getter
         * @returns {number}
         */
        get complete() {
            return this.completeJobs.length;
        },

        /**
         * @summary No jobs left getter
         * @returns {boolean}
         */
        get empty() {
            return this.queue.length === 0;
        },

        /**
         * @summary Number of failed jobs getter
         * @returns {number}
         */
        get failed() {
            return this.failedJobs.length;
        },

        /**
         * @summary Percent of processed jobs getter
         * @returns {number}
         */
        get percentage() {
            const { processed, size } = this;

            const total = processed + size;

            if(!total) {
                return 0;
            }

            const done = processed / ( processed + size );
            
            return parseFloat((done).toFixed(2));
        },

        /**
         * @summary Number of processed jobs getter
         * @returns {number}
         */
        get processed() {
            const { complete, failed } = this;
            return complete + failed;
        },

        /**
         * @summary Any jobs running getter
         * @returns {boolean}
         */
        get processing() {
            return this.queue.some(job => job.running);
        },

        /**
         * @summary Current active job getter
         * @returns {Job}
         */
        get runningJob() {
            const { queue } = this;

            return _.findLast(queue, { running: true });
        },

        /**
         * @summary Queue size getter
         * @returns {number}
         */
        get size() {
            return this.queue.length;
        },

        /**
         * @summary Removes job from queue
         * @returns {JobQueue}
         */
        dequeue() {
            const { queue } = this;

            queue.shift();

            return this;
        },

        /**
         * @summary Emits event
         * @param {string} type 
         * @param  {...any} args 
         * @returns {JobQueue}
         */
        emit(type, ...args) {
            const { events } = this;

            const listeners = events[type];

            if (!listeners) {
                return this;
            }

            for (const listener of listeners) {
                listener(this, ...args);
            }

            return this;
        },

        /**
         * @summary Adds a job to queue
         * @param  {...any} jobs 
         * @returns {JobQueue}
         */
        enqueue(...jobs) {

            for (const job of jobs) {
                const jobToRun = new Job(this, job);
                this.queue.push(jobToRun);
                this.emit("added", jobToRun);
            }

            return this;
        },

        /**
         * @summary Gets queued jobs
         * @returns {Job[]}
         */
        getJobs() {
            const { queue } = this;
            return queue.map(job => job);
        },

        /**
         * @summary starts next job if possible
         * @param  {...any} args 
         * @returns {JobQueue}
         * @emits JobQueue#finished
         * @emits JobQueue#done
         */
        nextJob(...args) {
            const { completeJobs, failedJobs, empty, queue, processing } = this;

            if (empty) {
                return this;
            }

            const lastRI = runningIndex(queue);

            if (!processing) {
                const jobToRun = queue[lastRI + 1];

                const runningJob = jobToRun.run(...args);

                const boundDequeue = this.dequeue.bind(this);

                runningJob
                    .then(() => {
                        pushIfNew(completeJobs, jobToRun);
                    })
                    .catch(error => {

                        jobToRun.error = error;

                        pushIfNew(failedJobs, jobToRun);

                    })
                    .finally(() => {
                        boundDequeue();

                        this.emit("finished", runningJob);

                        if (this.empty) {
                            this.emit("done", runningJob);
                        }
                    });
            }

            return this;
        },

        /**
         * @summary Removes event listener
         * @param {string} type 
         * @param {function} listener 
         * @returns {JobQueue}
         */
        off(type, listener) {
            const { events } = this;
            const listeners = events[type];

            if (listeners) {
                const index = listeners.indexOf(listener);
                index > -1 && listeners.splice(index, 1);
            }

            return this;
        },

        /**
         * @summary Adds event listener
         * @param {string} type 
         * @param {function} listener 
         * @returns {JobQueue}
         */
        on(type, listener) {
            const { events } = this;
            const listeners = events[type];

            listeners && pushIfNew(listeners, listener);

            return this;
        },

        /**
         * @summary Alias for adding listener to "done" event
         * @param {function} callback 
         * @returns {JobQueue}
         * @listens JobQueue#done
         */
        onDone(callback) {
            this.on("done", callback);
            return this;
        },

        /**
         * @summary Aliad for adding listener to "finished" event
         * @param {function} callback 
         * @returns {JobQueue}
         * @listens JobQueue#finished
         */
        onFinished(callback) {
            this.on("finished", callback);
            return this;
        },

        /**
         * @summary Alias for adding listener to "added" event
         * @param {function} callback 
         * @returns {JobQueue}
         * @listens JobQueue#added
         */
        onNewJob(callback) {
            this.on("added", callback);

            return this;
        },

        /**
         * @summary Resets queue when it is done
         * @returns {JobQueue}
         * @listens JobQueue#done
         */
        resetOnDone() {
            this.on('done',() => {
                const { completeJobs, failedJobs } = this;
                clear(completeJobs);
                clear(failedJobs);
            });

            return this;
        },

        /**
         * @summary Runs the queue in sequence
         * @param  {...any} args 
         * @returns {JobQueue}
         */
        run(...args) {
            const { processing } = this;

            const listener = () => this.nextJob(...args);

            this.onFinished(listener);

            !processing && listener();

            return this;
        },

        /**
         * @summary Runs queue when a job is added
         * @param  {...any} args 
         * @returns {JobQueue}
         */
        runOnNewJob(...args) {
            this.onNewJob(() => this.run(...args));

            return this;
        }

    };

    return copyWithGetters({}, proto);
}

module.exports = {
    Job,
    makeJobQueue
};