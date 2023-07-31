// https://k6.io/docs/examples/http-authentication/#aws-signature-v4-authentication-with-the-k6-jslib-aws
import http from 'k6/http';
import { AWSConfig, SignatureV4 } from 'https://jslib.k6.io/aws/0.8.0/aws.js'
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { scenario } from 'k6/execution';
import { SharedArray } from 'k6/data';

const ENDPOINT_NAME = __ENV.ENDPOINT_NAME;
const REGION = __ENV.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = __ENV.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = __ENV.AWS_SECRET_ACCESS_KEY;
const doSample = __ENV.DO_SAMPLE || '0';

console.log("ENDPOINT_NAME: " + ENDPOINT_NAME)
console.log("REGION: " + REGION)


const awsConfig = new AWSConfig({
  region: REGION,
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
});

const samples = new SharedArray('ShareGPT samples', function () {
  return JSON.parse(open('../samples.json'));
});

export const options = {
  thresholds: {
    http_req_failed: ['rate==0'],
  },
  scenarios: {
    // throughput: {
    //   executor: 'shared-iterations',
    //   vus: 50,
    //   iterations: samples.length,
    //   maxDuration: '2m',
    //   gracefulStop: '1s',
    // },
    test: {
      executor: 'constant-vus',
      duration: '90s',
      vus: 1,
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
      details: true,
      max_new_tokens: 50,
    },
  };
  if (doSample === '1') {
    console.log("Using sampling")
    payload.parameters.sample = true
    payload.parameters.top_p = 0.9
    payload.parameters.top_k = 50
    payload.parameters.temperature = 0.2

  }
  /**
   * Create a signer instance with the AWS credentials.
   * The signer will be used to sign the request.
   */
  const signer = new SignatureV4({
    service: 'sagemaker',
    region: awsConfig.region,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
    },
  });

  /**
   * Use the signer to prepare a signed request.
   * The signed request can then be used to send the request to the AWS API.
   * https://k6.io/docs/javascript-api/jslib/aws/signaturev4/
   */
  const signedRequest = signer.sign({
    method: 'POST',
    protocol: 'https',
    hostname: `runtime.sagemaker.${REGION}.amazonaws.com`,
    path: `/endpoints/${ENDPOINT_NAME}/invocations`,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    uriEscapePath: false,
    applyChecksum: false,
  });


  const res = http.post(signedRequest.url, signedRequest.body, { headers: signedRequest.headers });

  check(res, {
    'Post status is 200': (r) => res.status === 200,
  });


}

export function handleSummary(data) {
  const end_time = new Date().getTime() + (30 * 1000);
  const start_time = end_time - (140 * 1000);

  console.log(`python get_metrics.py  --endpoint_name ${ENDPOINT_NAME} --st ${start_time} --et ${end_time} --vu ${data.metrics.vus.values.value} --max_vu ${data.metrics.vus_max.values.value}`)
  return {
    'getms.sh': `python get_metrics.py  --endpoint_name ${ENDPOINT_NAME} --st ${start_time} --et ${end_time} --vu ${data.metrics.vus.values.value} --max_vu ${data.metrics.vus_max.values.value}`
  };
}