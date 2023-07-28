import {check} from 'k6';
import http from 'k6/http';
import {Trend, Counter} from 'k6/metrics';
import {scenario} from 'k6/execution';
import {SharedArray} from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// Define configurations
const host = __ENV.HOST || '127.0.0.1:3000';
const doSample = __ENV.DO_SAMPLE || '0';
const experimentName = __ENV.EXPERIMENT_NAME || 'ShareGPT';

// Define the metrics
const totalTime = new Trend('total_time', true);
const validationTime = new Trend('validation_time', true);
const queueTime = new Trend('queue_time', true);
const inferenceTime = new Trend('inference_time', true);
const timePerToken = new Trend('time_per_token', true);
const generatedTokens = new Counter('generated_tokens');

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
        //     vus: 75,
        //     iterations: samples.length,
        //     maxDuration: '2m',
        //     gracefulStop: '1s',
        // },
        load_test: {
            executor: 'constant-arrival-rate',
            duration: '2s',
            preAllocatedVUs: 1,
            rate: 3,
            timeUnit: '1s',
            gracefulStop: '1s',
        },
    },
};

export default function () {
    // Load ShareGPT random example
    const sample = samples[scenario.iterationInTest];

    // Create Body 
    const payload = {
        inputs: sample[0],
        parameters: {
            max_new_tokens: sample[2],
            details: true
        },
    };
    if (doSample === '1') {
        console.log("Using sampling")
        payload.parameters.sample = true
        payload.parameters.top_p = 0.9
        payload.parameters.top_k = 50
        payload.parameters.temperature = 0.2
        
    }

    const headers = {'Content-Type': 'application/json'};
    const res = http.post(`${host}/generate`, JSON.stringify(payload), {
        headers, timeout: '20m'
    });
    check(res, {
        'Post status is 200': (r) => res.status === 200,
    });

    if (res.status === 200) {
        totalTime.add(res.headers["X-Total-Time"]);
        validationTime.add(res.headers["X-Validation-Time"]);
        queueTime.add(res.headers["X-Queue-Time"]);
        inferenceTime.add(res.headers["X-Inference-Time"]);
        timePerToken.add(res.headers["X-Time-Per-Token"]);
        generatedTokens.add(res.json().details.generated_tokens);
    }
}


function traverseAndFlatten(currentNode, target, flattenedKey) {
    for (var key in currentNode) {
        if (currentNode.hasOwnProperty(key)) {
            var newKey;
            if (flattenedKey === undefined) {
                newKey = key;
            } else {
                newKey = flattenedKey + ' ' + key;
            }

            var value = currentNode[key];
            if (typeof value === "object") {
                traverseAndFlatten(value, target, newKey);
            } else {
                target[newKey] = value;
            }
        }
    }
}

function flatten(obj) {
    var flattenedObject = {};
    traverseAndFlatten(obj, flattenedObject);
    return flattenedObject;
}


export function handleSummary(data) {
    for (const key in data.metrics) {
        if (key.startsWith('http')) delete data.metrics[key];
        if (key.startsWith('data')) delete data.metrics[key];
      }


    const metrics = data.metrics;

    const resultObject = {
        'Host': host,
        'Do Sample': doSample,
        'Virtual Users': metrics.vus.values.value,
        'Max Virtual Users': metrics.vus_max.values.value,
        'Thorughput (tokens/second)': metrics.generated_tokens.values.rate,
        'Latency (ms/token)': metrics.time_per_token.values,
        'Latency Request ms': metrics.total_time.values,
        'Latency Infernece ms': metrics.inference_time.values,
        'Queue Time ms': metrics.queue_time.values,
        'Validation Time ms': metrics.validation_time.values,
    } 
    
    const file = `${experimentName}.json`
    return {
    stdout: textSummary(data, { indent: '', enableColors: true }),
    [file] : JSON.stringify(flatten(resultObject)), //the default data object
    };
  }