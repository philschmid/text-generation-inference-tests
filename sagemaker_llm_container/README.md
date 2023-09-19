# Benchmark TGI on Amazon SageMaker

## Run all `configs.yaml` 

`python benchmark.py --config-file configs.yaml`




## Prerequisites
* `sagemaker` sdk installed
* quota for instance you want to test

# Run

1. deploy model 

```bash
python deploy.py --action deploy --model_id <model_id> --instance_type <instance_type> --tp_degree <degree>
```

2. run benchmark

const ENDPOINT_NAME = __ENV.ENDPOINT_NAME;
const REGION = __ENV.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = __ENV.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = __ENV.AWS_SECRET_ACCESS_KEY;
const AWS_SESSION_TOKEN = __ENV.AWS_SESSION_TOKEN;

* `ENDPOINT_NAME` is the endpoint name you want to test
* `REGION` is the region of endpoint
* `AWS_ACCESS_KEY_ID` is the access key id of your aws account
* `AWS_SECRET_ACCESS_KEY` is the secret access key of your aws account
* `AWS_SESSION_TOKEN` is the session token of your aws account
* `DO_SAMPLE=1``


```bash
k6 run sagemaker_load.js -e ENDPOINT_NAME=<name> -e REGION=us-east-1 -e AWS_ACCESS_KEY_ID=key_id -e AWS_SECRET_ACCESS_KEY=secret_key -e AWS_SESSION_TOKEN=token -e DO_SAMPLE=1
```

3. retrieve metrics
```bash
python get_metrics.py  --endpoint_name Llama-2-7b-hf-endpoint-2023-07-31-05-50-26-571 --st 1690790829904 --et 1690790829904 --vu 1 --max_vu 2
```

4. delete endpoint
``` 
python deploy.py --action delete --model_id <model_id>
```


## Tested models & configurations

See [run.sh](run.sh)