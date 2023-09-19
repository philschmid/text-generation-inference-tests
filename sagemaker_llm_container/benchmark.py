import os
import time
from sagemaker.huggingface import get_huggingface_llm_image_uri
import boto3
import json
from sagemaker.huggingface import HuggingFaceModel
import argparse
import yaml

from utils.get_metrics import get_metrics_from_cloudwatch


def parse_args():
    parser = argparse.ArgumentParser(description="A simple argument parser example")
    parser.add_argument("--model_id", type=str)
    parser.add_argument("--iam_role", default="sagemaker_execution_role", type=str)
    parser.add_argument("--tp_degree", type=int)
    parser.add_argument("--instance_type", type=str)
    parser.add_argument("--token", type=str)
    parser.add_argument("--vu", type=int, default=1)
    parser.add_argument("--quantize", choices=["gptq"])
    parser.add_argument("--config-file", type=str, default=None)

    return parser.parse_args()


def run_benchmark(iam_role, token, model_id, instance_type, tp_degree, vu, quantize):
    start = time.time()
    iam = boto3.client("iam")
    role = iam.get_role(RoleName=iam_role)["Role"]["Arn"]

    print(f"sagemaker role arn: {role}")
    print(f"token: {token[:10]}")
    print(f"model id: {model_id}")
    print(f"instance type: {instance_type}")
    print(f"tp_degree: {tp_degree}")
    print(f"vu: {vu}")
    print(f"quantize: {quantize}")

    # retrieve the llm image uri
    llm_image = get_huggingface_llm_image_uri("huggingface", version="1.0.3")
    # TGI config
    config = {
        "HF_MODEL_ID": model_id,  # model_id from hf.co/models
        "SM_NUM_GPUS": json.dumps(tp_degree),  # Number of GPU used per replica
        "MAX_INPUT_LENGTH": json.dumps(1024),  # Max length of input text
        "MAX_TOTAL_TOKENS": json.dumps(2048),  # Max length of the generation (including input text)
        "HUGGING_FACE_HUB_TOKEN": token,
    }
    if quantize:
        config["HF_MODEL_QUANTIZE"] = "gptq"

    # create HuggingFaceModel
    llm_model = HuggingFaceModel(role=role, image_uri=llm_image, env=config)
    endpoint_region = llm_model.sagemaker_session._region_name
    credentials = llm_model.sagemaker_session.boto_session.get_credentials()

    # deploy model to endpoint
    try:
        llm = llm_model.deploy(
            initial_instance_count=1,
            instance_type=instance_type,
            container_startup_health_check_timeout=300,
        )
        try:
            # run warm up inference
            for i in range(2):
                llm.predict({"inputs": "This is a sample sentence to warm up the model"})

            # run k6 load test
            time.sleep(10)
            benchmark_start_time = time.time()
            os.system(
                f"k6 run sagemaker_load.js -e ENDPOINT_NAME={llm.endpoint_name} -e REGION={endpoint_region} -e DO_SAMPLE=0 -e VU={vu} -e AWS_ACCESS_KEY_ID={credentials.access_key} -e AWS_SECRET_ACCESS_KEY={credentials.secret_key}"
            )

            # wait for cloudwatch logs to be populated and ready to read
            print("Waiting for cloudwatch logs to be populated")
            time.sleep(120)
            benchmark_end_time = time.time()

            # get cloudwatch logs
            results = get_metrics_from_cloudwatch(
                endpoint_name=llm.endpoint_name,
                st=int(benchmark_start_time),
                et=int(benchmark_end_time),
                instance_type=instance_type,
                tp_degree=tp_degree,
                vu=vu,
                quantize=quantize,
                model_id=model_id,
            )

            # print results
            with open(
                f"{model_id.split('/')[-1]}_{instance_type}_tp_{int(tp_degree)}_vu_{int(vu)}.json",
                "w",
            ) as f:
                f.write(json.dumps(results))
        except Exception as e:
            print(e)
        finally:
            # delete endpoint
            llm.delete_model()
            llm.delete_endpoint()
    except Exception as e:
        print(e)
        print(f"Failed to deploy model with config {model_id}, {instance_type}, {tp_degree}, {vu}")
    finally:
        print(f"Total time: {round(time.time() - start)}s")


if __name__ == "__main__":
    args = parse_args()

    if args.config_file:
        with open(args.config_file, "r") as file:
            configs = yaml.load(file, Loader=yaml.FullLoader)["configs"]

        # run each config for each vu group
        vu_group = [1, 5, 10, 20]

        # run each config for each vu group
        print(f"Running benchmark for {len(configs) * 4} configs")
        print(f"Expected time between: {len(configs) * 4 * 18}-{len(configs) * 4 * 27} minutes")

        for config in configs:
            for vu in vu_group:
                run_benchmark(
                    iam_role=args.iam_role,
                    token=args.token,
                    model_id=config["model_id"],
                    instance_type=config["instance_type"],
                    tp_degree=config["tp_degree"],
                    vu=vu,
                    quantize="gptq" if "quantize" in config else None,
                )

    else:
        run_benchmark(**args)
