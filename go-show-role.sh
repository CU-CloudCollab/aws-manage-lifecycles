#!/usr/bin/env bash

# Show relevant roles and policy

# setup environment
source ./constants.sh

ROLE_NAME="manage-lifecycle-lambda"

aws iam get-role --role-name $ROLE_NAME

aws iam list-attached-role-policies --role-name $ROLE_NAME

aws iam list-role-policies --role-name $ROLE_NAME

aws iam get-role-policy --role-name $ROLE_NAME --policy-name SendEmail

aws iam get-role-policy --role-name $ROLE_NAME --policy-name SendEmail

aws iam get-role-policy --role-name $ROLE_NAME --policy-name StopStartTerminateEC2Instances
