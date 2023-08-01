MODEL=meta-llama/Llama-2-7b-hf
ENDPOINT_NAME=$(echo $MODEL | sed 's/\//-/g')-$(echo $RANDOM | md5sum | head -c 20; echo)
INSTANCE_TYPE=ml.g5.12xlarge # g5.12xlarge, p4d.24xlarge
TP_DEGREE=4
VU=1
# QUANTIZE=bnb

# print parameters
echo "Model: $MODEL"
echo "Instance Type: $INSTANCE_TYPE"
echo "TP Degree: $TP_DEGREE"
echo "Endpoint Name: $ENDPOINT_NAME"

# EXPORT AWS CREDENTIALS
export AWS_ACCESS_KEY_ID=$(aws --profile hf-sm configure get aws_access_key_id)
export AWS_SECRET_ACCESS_KEY=$(aws --profile hf-sm configure get aws_secret_access_key)

## Deploy Endpoint
echo "python deploy.py --action deploy --model_id $MODEL --instance_type $INSTANCE_TYPE --endpoint_name $ENDPOINT_NAME  --tp_degree $TP_DEGREE --token $(cat ~/.huggingface/token)"
python deploy.py --action deploy --model_id $MODEL --instance_type $INSTANCE_TYPE --endpoint_name $ENDPOINT_NAME  --tp_degree $TP_DEGREE --token $(cat ~/.huggingface/token)

## Run Load Test
START_TIME=$(date -d "-90 seconds" +%s)
echo "run sagemaker_load.js -e ENDPOINT_NAME=$ENDPOINT_NAME -e REGION=us-east-1 -e DO_SAMPLE=1 -e VU=$VU -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
k6 run sagemaker_load.js -e ENDPOINT_NAME=$ENDPOINT_NAME -e REGION=us-east-1 -e DO_SAMPLE=1 -e VU=$VU -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
END_TIME=$(date -d "+90 seconds" +%s)

## Wait 
echo "Waiting for 2 minutes for results"
sleep 120

# Get metrics
echo "python get_metrics.py  --endpoint_name $ENDPOINT_NAME --st $START_TIME --et $END_TIME --vu $VU --max_vu $VU --instance_type $INSTANCE_TYPE --tp_degree $TP_DEGREE --model_id $MODEL "
python get_metrics.py  --endpoint_name $ENDPOINT_NAME --st $START_TIME --et $END_TIME --vu $VU --max_vu $VU --instance_type $INSTANCE_TYPE --tp_degree $TP_DEGREE --model_id $MODEL

# Delete
echo "python deploy.py --action delete --endpoint_name $ENDPOINT_NAME"
python deploy.py --action delete --endpoint_name $ENDPOINT_NAME

