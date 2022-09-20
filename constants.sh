#!/usr/bin/env bash

##########################################################################
# You must replace this an S3 bucket you can write to, if you will be
# customizing/updating this Lambda function.
#
# Name of the S3 bucket where Lambda function code will be uploaded to.
export S3_BUCKET="public.cloud.cit.cornell.edu"
#
##########################################################################

# Arbitrary name for your Lambda function.
export LAMBDA_NAME="lambda-manage-lifecycle"

# Arbitrary name of the ZIP file to upload.
export CODE_ZIPFILE="lambda-code.v1_4.zip"

# Prefix of S3 key for the CODE_ZIPFILE
export S3_KEY_PREFIX="examples/aws-manage-lifecycles/"
# Full S3 key name is $S3_KEY_PREFIX$CODE_ZIPFILE

# Environment parameters required by lambda.js.
export EMAIL_FROM_ADDRESS="me@example.com"
export MOMENT_TIMEZONE="America/New_York"
export EC2_DRY_RUN="false" # RDS does not have a dry_run option.
export SNAPSHOT_ON_RDS_STOP="false"
