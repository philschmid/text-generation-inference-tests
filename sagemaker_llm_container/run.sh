MODEL=meta-llama/Llama-2-7b-hf
INSTANCE_TYPE=ml.g5.2xlarge # g5.12xlarge, p4d.24xlarge
TP_DEGREE=1
VU=1
# QUANTIZE=bnb

# EXPORT AWS CREDENTIALS
export AWS_ACCESS_KEY_ID=$(aws --profile hf-sm configure get aws_access_key_id)
export AWS_SECRET_ACCESS_KEY=$(aws --profile hf-sm configure get aws_secret_access_key)

## Deploy Endpoint
python benchmark.py --model_id $MODEL --instance_type $INSTANCE_TYPE --vu $VU --tp_degree $TP_DEGREE --token $(cat ~/.huggingface/token)