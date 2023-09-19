# EXPORT AWS CREDENTIALS
export AWS_ACCESS_KEY_ID=$(aws --profile hf-sm configure get aws_access_key_id)
export AWS_SECRET_ACCESS_KEY=$(aws --profile hf-sm configure get aws_secret_access_key)

## Deploy Endpoint
python benchmark.py --token $(cat ~/.huggingface/token) --config-file configs.yaml