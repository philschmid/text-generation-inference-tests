import {check} from 'k6';
import http from 'k6/http';
import {Trend} from 'k6/metrics';
import {scenario} from 'k6/execution';
import {SharedArray} from 'k6/data';

const host = __ENV.HOST || '127.0.0.1:3000';

const totalTime = new Trend('total_time', true);
const validationTime = new Trend('validation_time', true);
const queueTime = new Trend('queue_time', true);
const inferenceTime = new Trend('inference_time', true);
const timePerToken = new Trend('time_per_token', true);

const samples = new SharedArray('ShareGPT samples', function () {
    return JSON.parse(open('./samples.json'));
});

export const options = {
    thresholds: {
        http_req_failed: ['rate==0'],
    },
    scenarios: {
        // throughput: {
        //     executor: 'shared-iterations',
        //     vus: 100,
        //     iterations: samples.length,
        //     maxDuration: '20m',
        // },
        load_test: {
            executor: 'constant-arrival-rate',
            duration: '10s',
            preAllocatedVUs: 1,
            rate: 3,
            timeUnit: '1s',
            gracefulStop: '1s',
        },
    },
};

export default function () {
    const sample = samples[scenario.iterationInTest];

    const payload = JSON.stringify({
        inputs: sample[0],
        parameters: {
            max_new_tokens: sample[2],
        },
    });
    console.log(payload)

    const headers = {'Content-Type': 'application/json'};
    const res = http.post(`${host}/generate`, payload, {
        headers, timeout: '20m'
    });

    console.log(res.json());

    check(res, {
        'Post status is 200': (r) => res.status === 200,
    });

    if (res.status === 200) {
        totalTime.add(res.headers["X-Total-Time"]);
        validationTime.add(res.headers["X-Validation-Time"]);
        queueTime.add(res.headers["X-Queue-Time"]);
        inferenceTime.add(res.headers["X-Inference-Time"]);
        timePerToken.add(res.headers["X-Time-Per-Token"]);
    }
}
