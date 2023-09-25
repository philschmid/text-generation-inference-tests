# Benchmark TGI on Amazon SageMaker

This directory contains the code to benchmark TGI on Amazon SageMaker. The benchmark can be used to compare the performance of different models, instance types, and number of concurrent clients.

## Prerequisites

* `sagemaker` sdk installed
* quota for instance you want to test
* `huggingface-cli` installed and logged in

## Run all `configs.yaml`

You can run all the benchmarks in `configs.yaml` by running. You can modify the `configs.yaml` to add more benchmarks or modify the existing ones. The `configs.yaml` file is a list of dictionaries. 

```yaml
- model_id: meta-llama/Llama-2-7b-hf
  instance_type: ml.g5.2xlarge
  tp_degree: 1
```

For each configuration 4 benchmarks will we run with `[1,5,10,20]` concurrent clients. You can run the benchmarks by running the following command.

`python benchmark.py --config-file configs.yaml`

The results will be saved in a `json` file.


## Run Single Benchmark 

You can run a single benchmark, with a single configuration by running the following command. 

```bash
python benchmark.py \
  --model_id meta-llama/Llama-2-7b-hf \
  --instance_type ml.g5.2xlarge \
  --tp_degree 1 \
  --vu 1 \
  --quantize gptq \
  --iam_role sagemaker_execution_role \
  --token $(cat ~/.huggingface/token)
```
