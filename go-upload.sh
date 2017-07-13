#!/usr/bin/env bash

# zip the code and upload it to S3

# setup environment
source ./constants.sh

# zip contents
zip -qr lambda-code.zip lambda.js node_modules/moment-timezone node_modules/moment node_modules/aws-sdk
# zip -qr lambda-code.zip lambda.js node_modules/node-json2html node_modules/node-rest-client

# load to S3
aws s3 cp ./lambda-code.zip s3://$S3_BUCKET/$S3_KEY_PREFIX$CODE_ZIPFILE

