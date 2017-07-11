#!/usr/bin/env bash

# setup environment
source ./constants.sh

# Invoke the function
aws lambda invoke --function-name $LAMBDA_NAME output.txt
