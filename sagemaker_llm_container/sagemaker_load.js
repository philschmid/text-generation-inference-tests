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
  const sample = `I require your assistance to rewrite our service page about Construction Contracts Lawyer in Brisbane for the persona of a homeowner in Brisbane, Australia. I will give you multiple information that you have to consider such as the contents from the top ranking pages online, and target keywords. Do you understand?

Are you looking for a construction contracts lawyer in Brisbane to help you navigate the complex legal landscape of construction projects? Look no further than our team of experienced and knowledgeable lawyers.

At our firm, we understand that construction projects can be fraught with potential legal pitfalls. From contract negotiations and disputes to regulatory compliance and risk management, there are many ways that things can go wrong. That's why it's essential to have a trusted legal partner on your side who can help you protect your interests and ensure that your project runs smoothly.

Our team of construction contracts lawyers has extensive experience representing clients in all aspects of construction law. We work with a wide range of clients, including owners, developers, contractors, subcontractors, architects, engineers, and suppliers, providing them with the guidance and support they need to achieve their goals.

One of the key services we offer is contract drafting and negotiation. A well-drafted construction contract can help prevent disputes before they arise by clearly outlining the roles, responsibilities, and expectations of each party involved in the project. Our lawyers will work closely with you to understand your unique needs and objectives and craft a customized contract that meets those requirements.

Of course, even with the most carefully crafted contracts, disputes can still occur. When they do, our lawyers are prepared to vigorously represent your interests in litigation or alternative dispute resolution proceedings. Whether you're facing a breach of contract claim, a delay or disruption claim, or any other type of construction dispute, we have the skills and expertise to help you reach a favorable outcome.

In addition to our contract drafting and dispute resolution services, we also provide comprehensive advice and counsel on all aspects of construction law. This includes:

Regulatory Compliance: Navigating the maze of regulations that govern construction projects can be challenging. Our lawyers can help ensure that you comply with all applicable laws and regulations, from building codes and zoning ordinances to environmental regulations and labor laws.
Risk Management: Construction projects involve numerous risks, from financial risks to safety risks. Our lawyers can help you identify and manage these risks, developing strategies to mitigate potential problems and protect your bottom line.
Bid Protests: If you believe that a public agency has unfairly awarded a construction contract to another bidder, our lawyers can help you file a bid protest and advocate on your behalf.
Mechanic's Liens: If you're a contractor or supplier who hasn't been paid for your work on a construction project, you may be able to file a mechanic's lien to secure payment. Our lawyers can guide you through this process and help you enforce your rights.
No matter what stage your construction project is at, our team of lawyers is here to help. We pride ourselves on delivering personalized, attentive service to each and every one of our clients, taking the time to understand their unique needs and concerns. We'll work closely with you throughout the entire process, providing regular updates on the status of your case and ensuring that you're always informed and empowered to make decisions that are in your best interest.

If you're in need of a construction contracts lawyer in Brisbane, we encourage you to contact us today to schedule a consultation. We'll take the time to get to know you and your business, answer any questions you may have, and help you develop a customized legal strategy tailored to your specific needs. With our team of experienced lawyers on your side, you can focus on what you do best – running a successful construction project – while we handle the legal details.
If you're in need of a construction contracts lawyer in Brisbane, we encourage you to contact us today to schedule a consultation. We'll take the time to get to know you and your business, answer any questions you may have, and help you develop a customized legal strategy tailored to your specific needs. With our team of experienced lawyers on your side, you can focus on what you do best – running a successful`

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
