#!/usr/bin/env bash

export CODE_ZIPFILE="lambda-code.zip"
export S3BUCKET="pea1-test"
export LAMBDA_NAME="pea1-automanage"
export LAMBDA_ROLE="arn:aws:iam::225162606092:role/pea1-lambda-automanage"

# used for scheduling
export STATEMENT_ID="$LAMBDA_NAME-statement"
export SCHEDULE_RULE="$LAMBDA_NAME-rule"
