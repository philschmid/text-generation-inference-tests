import json
import time
import boto3
import argparse
import awswrangler as wr
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
    return {
        "total_time_ms": convert_string_to_float_ms(kpi_dict["total_time"]),
        "inference_time_ms": convert_string_to_float_ms(kpi_dict["inference_time"]),
        "time_per_token_ms": convert_string_to_float_ms(kpi_dict["time_per_token"]),
        "queue_time_ms": convert_string_to_float_ms(kpi_dict["queue_time"]),
    }


def main(args):
    client = boto3.client("logs")

    loggroup = f"/aws/sagemaker/Endpoints/{args.endpoint_name}"

    ## For the latest
    stream_response = client.describe_log_streams(
        logGroupName=loggroup,  # Can be dynamic
        orderBy="LastEventTime",  # For the latest events
        limit=1,  # the last latest event, if you just want one
    )

    start_query_response = client.start_query(
        logGroupName=loggroup,
        startTime=args.st,
        endTime=args.et,
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
        metrics.append(extract_metrics(record[0]["value"]))

    if len(metrics) == 0:
        raise Exception("No metrics found")

    df = pd.DataFrame.from_records(metrics)

    generated_tokens = len(df) * 50
    throughput_gen_per_s = generated_tokens / df["total_time_ms"].sum() * 1000

    # calculate the average inference time
    inference_time = {
        "Host": "sagemaker",
        "Instance": args.instance_type,
        "generated_tokens per request": "50",
        "Do Sample": "1",
        "Number of requests": len(df),
        "Virtual Users": args.vu,
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
    # write to json
    with open(f"metrics_{args.endpoint_name.lower()}_{args.vu}.json", "w") as f:
        f.write(json.dumps(inference_time))


if __name__ == "__main__":
    args = parse_args()
    main(args)
