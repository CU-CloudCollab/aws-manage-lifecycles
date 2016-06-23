#!/usr/bin/env bash

# Setup a schedule for executing the function
# All these commands except 'lambda add-permission' can be executed multiple times without issues.

# setup environment
source ./constants.sh

tempfile=$(mktemp)
aws events put-rule \
  --name $SCHEDULE_RULE \
  --schedule-expression "$LAMBDA_SCHEDULE" \
  --state ENABLED \
  --description "Schedule for invoking $LAMBDA_NAME Lamada function." \
  > $tempfile

rule_arn=$(jq -r .RuleArn $tempfile)
echo $rule_arn

tempfile=$(mktemp)
aws lambda get-function \
  --function-name $LAMBDA_NAME \
  > $tempfile

lambda_arn=$(jq -r .Configuration.FunctionArn $tempfile)
echo $lambda_arn

aws events put-targets \
  --rule $SCHEDULE_RULE \
  --targets "{\"Id\" : \"1\", \"Arn\" : \"$lambda_arn\"}"

 aws lambda add-permission \
   --function-name $LAMBDA_NAME \
   --statement-id $STATEMENT_ID \
   --action 'lambda:InvokeFunction' \
   --principal events.amazonaws.com \
   --source-arn $rule_arn
