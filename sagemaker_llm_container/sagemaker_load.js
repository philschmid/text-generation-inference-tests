// https://k6.io/docs/examples/http-authentication/#aws-signature-v4-authentication-with-the-k6-jslib-aws
import http from 'k6/http';
import { AWSConfig, SignatureV4 } from 'https://jslib.k6.io/aws/0.8.0/aws.js'
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { scenario } from 'k6/execution';
import { SharedArray } from 'k6/data';

const ENDPOINT_NAME = __ENV.ENDPOINT_NAME;
const INFERENCE_COMPONENT = __ENV.INFERENCE_COMPONENT || undefined;
const REGION = __ENV.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = __ENV.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = __ENV.AWS_SECRET_ACCESS_KEY;
const doSample = __ENV.DO_SAMPLE || '0';
const vu = __ENV.VU || 1;

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
    http_req_failed: ['rate<0.1'],
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
      vus: vu,
    },
  },
};


export default function () {
  // Load ShareGPT random example
  const sample = "Write a 500 word long story about llamas";

  // Create Body 
  const payload = {
    inputs: sample,
    parameters: {
      details: true,
      // max_new_tokens: sample[2],
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
  const headers = {
    'Content-Type': 'application/json',
  };
  if (INFERENCE_COMPONENT) {
    headers['X-Amzn-SageMaker-Inference-Component'] = INFERENCE_COMPONENT
  }

  const signedRequest = signer.sign({
    method: 'POST',
    protocol: 'https',
    hostname: `runtime.sagemaker.${REGION}.amazonaws.com`,
    path: `/endpoints/${ENDPOINT_NAME}/invocations`,
    headers: headers,
    body: JSON.stringify(payload),
    uriEscapePath: false,
    applyChecksum: false,
  });


  const res = http.post(signedRequest.url, signedRequest.body, { headers: signedRequest.headers });

  check(res, {
    'Post status is 200': (r) => res.status === 200,
  });


}