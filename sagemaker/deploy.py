import sagemaker
from sagemaker.huggingface import get_huggingface_llm_image_uri
import boto3
import json
from sagemaker.huggingface import HuggingFaceModel, HuggingFacePredictor
import nanoid
import argparse


def parse_args():
    parser = argparse.ArgumentParser(description="A simple argument parser example")
    parser.add_argument("--action", choices=["deploy", "delete"], required=True)
    parser.add_argument("--model_id", type=str, required=True)
    parser.add_argument("--iam_role", default="sagemaker_execution_role", type=str)
    parser.add_argument("--tp_degree", type=int)
    parser.add_argument("--instance_type", type=str)
    parser.add_argument("--token", type=str)
    parser.add_argument("--quantize", choices=["bnb", "gptq"])

    return parser.parse_args()


def main(args):
    iam = boto3.client("iam")
    role = iam.get_role(RoleName=args.iam_role)["Role"]["Arn"]
    endpoint_name = f'{args.model_id.split("/")[-1]}-endpoint-{nanoid.generate(size=4)}'

    print(f"sagemaker role arn: {role}")
    print(f"endpoint name: {endpoint_name}")

    if args.action == "deploy":
        # retrieve the llm image uri
        llm_image = get_huggingface_llm_image_uri("huggingface", version="0.8.2")
        # TGI config
        config = {
            "HF_MODEL_ID": args.model_id,  # model_id from hf.co/models
            "SM_NUM_GPUS": json.dumps(args.tp_degree),  # Number of GPU used per replica
            "MAX_INPUT_LENGTH": json.dumps(1024),  # Max length of input text
            "MAX_TOTAL_TOKENS": json.dumps(2048),  # Max length of the generation (including input text)
            # 'HF_MODEL_QUANTIZE': "bitsandbytes", # comment in to quantize
            "HUGGING_FACE_HUB_TOKEN": args.token,
        }
        if args.quantize:
            config["HF_MODEL_QUANTIZE"] = "bitsandbytes"

        # create HuggingFaceModel
        llm_model = HuggingFaceModel(role=role, image_uri=llm_image, env=config)

        llm = llm_model.deploy(
            initial_instance_count=1,
            endpoint_name=endpoint_name,
            instance_type=args.instance_type,
            container_startup_health_check_timeout=300,
        )
    else:
        predictor = HuggingFacePredictor(endpoint_name="Llama-2-7b-hf-endpoint-2023-07-31-05-50-26-571")
        predictor.delete_model()
        predictor.delete_endpoint()


if __name__ == "__main__":
    args = parse_args()
    main(args)
