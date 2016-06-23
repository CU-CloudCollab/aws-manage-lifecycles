#!/usr/bin/env bash

# Upload source code changes to S3
# then update the Lambda function with the new code.

# setup environment
source ./constants.sh

# zip the code and upload it to S3
./go-upload.sh

# create/update lamda function
aws lambda update-function-code \
  --function-name $LAMBDA_NAME \
  --s3-bucket $S3BUCKET \
  --s3-key $CODE_ZIPFILE
# [--s3-object-version <value>]
#[--publish | --no-publish]
