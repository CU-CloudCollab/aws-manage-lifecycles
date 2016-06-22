#!/usr/bin/env bash

# setup environment
source ./constants.sh

# zip the code and upload it to S3
./go-upload.sh

# create the initial function

aws lambda create-function \
  --function-name $LAMBDA_NAME \
  --runtime nodejs4.3 \
  --role $LAMBDA_ROLE \
  --handler lambda.myhandler \
  --code S3Bucket=$S3BUCKET,S3Key=$CODE_ZIPFILE \
  --description "Automatically manage EC2 instances." \
  --timeout 10 \
  --memory-size 128

# additional parameters for lambda-create
  # [--publish | --no-publish]
  # [--vpc-config <value>]
  # [--zip-file <value>]
  # [--cli-input-json <value>]
  # [--generate-cli-skeleton]
