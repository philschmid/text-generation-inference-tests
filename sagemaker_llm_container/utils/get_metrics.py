import json
import time
import boto3
import argparse
import re

import pandas as pd


def parse_args():
    parser = argparse.ArgumentParser(description="A simple argument parser example")
    parser.add_argument("--endpoint_name", required=True)
    parser.add_argument("--vu", required=True)
    parser.add_argument("--max_vu", required=True)
    parser.add_argument("--st", type=int, required=True)
    parser.add_argument("--et", type=int, required=True)
    parser.add_argument("--instance_type", type=str, required=True)
    parser.add_argument("--tp_degree", type=str, required=True)
    parser.add_argument("--model_id", type=str, required=True)
    parser.add_argument("--quantize", type=str)
    return parser.parse_args()


def convert_string_to_float_ms(input_string):
    if input_string[-2:] == "µs":
        return float(input_string[:-2]) / 1000
    elif input_string[-2:] == "ms":
        return float(input_string[:-2])
    elif input_string[-1:] == "s":
        return float(input_string[:-1]) * 1000


def extract_metrics(input_string):
    kpi_pattern = r'#\d+\[3m(\w+)#\d+\[0m#\d+\[2m=#\d+\[0m"([^"]+)"'
    kpis = re.findall(kpi_pattern, input_string)
    kpi_dict = dict(kpis)

    try:
        parsed_kpis = {
            "total_time_ms": convert_string_to_float_ms(kpi_dict["total_time"]),
            "inference_time_ms": convert_string_to_float_ms(kpi_dict["inference_time"]),
            "time_per_token_ms": convert_string_to_float_ms(kpi_dict["time_per_token"]),
            "queue_time_ms": convert_string_to_float_ms(kpi_dict["queue_time"]),
        }
    except:
        print(input_string)
        raise
    return parsed_kpis


def calcluate_throughput(avg_latency, user_count, duration=90, num_gen_tokens=50):
    request_per_user_in_duration = ((duration * 1000) / avg_latency) * user_count
    thorughput = (request_per_user_in_duration / duration) * num_gen_tokens
    return thorughput


def get_metrics_from_cloudwatch(
    endpoint_name=None,
    st=None,
    et=None,
    instance_type=None,
    tp_degree=None,
    vu=None,
    quantize=None,
    model_id=None,
    inference_component=None,
):
    client = boto3.client("logs")

    if inference_component:
        loggroup = f"/aws/sagemaker/InferenceComponents/{inference_component}"
    else:
        loggroup = f"/aws/sagemaker/Endpoints/{endpoint_name}"

    start_query_response = client.start_query(
        logGroupName=loggroup,
        startTime=st,
        endTime=et,
        queryString="fields @message | sort @timestamp desc",
        limit=10000,
    )
    query_id = start_query_response["queryId"]

    response = None

    while response == None or response["status"] == "Running":
        print("Waiting for query to complete ...")
        time.sleep(1)
        response = client.get_query_results(queryId=query_id)
    metrics = []
    for record in response["results"]:
        if "3mtotal_time" in record[0]["value"]:
            metrics.append(extract_metrics(record[0]["value"]))

    if len(metrics) == 0:
        raise Exception("No metrics found")

    df = pd.DataFrame.from_records(metrics)

    throughput_gen_per_s = calcluate_throughput(df["total_time_ms"].mean(), int(vu))

    # get quantization
    if quantize:
        quantization = quantize
    else:
        quantization = "none"

    # calculate the average inference time
    inference_time = {
        "Host": "sagemaker",
        "Model Id": model_id,
        "Instance": instance_type,
        "Tensor parallelism degree": int(tp_degree),
        "quantization": quantization,
        "generated_tokens per request": 50,
        "Do Sample": True,
        "Number of requests": len(df),
        "Virtual Users": int(vu),
        "Thorughput (tokens/second)": throughput_gen_per_s,
        "Latency (ms/token) avg": df["time_per_token_ms"].mean(),
        "Latency (ms/token) min": df["time_per_token_ms"].min(),
        "Latency (ms/token) med": df["time_per_token_ms"].median(),
        "Latency (ms/token) max": df["time_per_token_ms"].max(),
        "Latency (ms/token) p(90)": df["time_per_token_ms"].quantile(0.9),
        "Latency (ms/token) p(95)": df["time_per_token_ms"].quantile(0.95),
        "Latency Request ms p(90)": df["total_time_ms"].quantile(0.9),
        "Latency Request ms p(95)": df["total_time_ms"].quantile(0.95),
        "Latency Request ms avg": df["total_time_ms"].mean(),
        "Latency Request ms min": df["total_time_ms"].min(),
        "Latency Request ms med": df["total_time_ms"].median(),
        "Latency Request ms max": df["total_time_ms"].max(),
        "Latency Infernece ms med": df["inference_time_ms"].median(),
        "Latency Infernece ms max": df["inference_time_ms"].max(),
        "Latency Infernece ms p(90)": df["inference_time_ms"].quantile(0.9),
        "Latency Infernece ms p(95)": df["inference_time_ms"].quantile(0.95),
        "Latency Infernece ms avg": df["inference_time_ms"].mean(),
        "Latency Infernece ms min": df["inference_time_ms"].min(),
        "Queue time ms med": df["queue_time_ms"].median(),
        "Queue time ms max": df["queue_time_ms"].max(),
        "Queue time ms p(90)": df["queue_time_ms"].quantile(0.9),
        "Queue time ms p(95)": df["queue_time_ms"].quantile(0.95),
        "Queue time ms avg": df["queue_time_ms"].mean(),
        "Queue time ms min": df["queue_time_ms"].min(),
    }
    return inference_time


if __name__ == "__main__":
    args = parse_args()
    res = get_metrics_from_cloudwatch(args)

    with open(
        f"{args.instance_type}_tp_{int(args.tp_degree)}_vu_{int(args.vu)}_{args.model_id.replace('/','-')}.json",
        "w",
    ) as f:
        f.write(json.dumps(res))
