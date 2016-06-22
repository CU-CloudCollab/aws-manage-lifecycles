# aws-manage-lifecycles

This repo contains Node.js functionality to manage lifecycles of AWS EC2 instances using policies specified in tags. Supplemental scripts create and upload the code into AWS Lambda and schedule it to run hourly.

The idea is to create one Lambda function in your AWS account that runs at 5 minutes after each hour and scans instances tagged with a lifecycle-policy. When it finds such instances it takes action to implement the policy. E.g., starting instances to fulfill a daily (or weekday) on/off cycle.

This functionality does not launch new instances. It can terminate instances, if desired, but it operates only on instances that exist and are in a "running" or "stopped" state.

## Lifecycle Policies

EC2 instance lifecycle policies are specified by tagging EC2 instances with a tag named "lifecycle-policy".

* Label name: **lifecycle-policy**
* Label value formats:
  * **limit-stop:[h]**
    * Stop the instance if it is running and if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-stop:0" means to stop as soon as the policy is checked.
  * **limit-terminate:[h]**
    * Terminate the instance (or destroy the resource) if more than [h] hours have elapsed since instance launch date/time.
  * **limit-email:[h];[email-address]**
    * Send an email to [email-address] if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-email:0;[email-address]" means "send the email every time the policy is checked".
  * **cycle-daily:[on-hour];[off-hour]**
    * Cycle this instance daily, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region.
    * If [on-hour] > [off-hour] then this is interpreted that the instance should be running overnight. E.g., cycle-daily:20;4 would turn on the instance at 8pm and off at 4am.
    * If [on-hour] == [off-hour], the policy is non-sensical and nothing is done.
  * **cycle-weekday:[on-hour];[off-hour]**
    * Cycle this instance on weekdays, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region. Instances remain off on weekends.
    * If [on-hour] > [off-hour], nothing is done.
    * If [on-hour] == [off-hour], the policy is nonsensical and nothing is done.

## JavaScripts

**lambda.js** contains a Node.js script for executing in Lambda.

**run-local.js** will run that script on a local machine, instead of in AWS Lambda. Command line:

  ```
  $ node run-local.js
  ```

**test.js** Test JavaScript functionality locally. Command line:

  ```
  $ node test.js
  ```

## bash Scripts

**constants.sh** constants required for the bash scripts. Note that this script does NOT supply constants for lambda.js.

**go-upload.sh** zips the local lambda.js script and supporting Javascript modules into a Lambda-compatible package of code and uploads it to S3. This script is called by other scripts here.

**go-create.sh** creates the Lambda function, pointing it to the uploaded code package in S3.

**go-schedule.sh**  create an CloudWatch rule to be evaulated on a schedule. It connects the Lambda function to the rule and adds the necessary permission to the Lambda function that allows the event to trigger the funciton.

**go-update.sh** Updates the Lambda function with the current version of the local lambda.js file.

**go-invoke.sh** allows you to manually invoke the lambda.js functionality on Lambda

## Dependencies for Development

These scripts expect the following on your development workstation:

* [Node.js](https://nodejs.org/en/). This code was targeted against Lambda support for Node.js 4.3.
* [NPM](https://www.npmjs.com/)
* NPM modules:
  * [aws-sdk](https://www.npmjs.com/package/aws-sdk)
  * [moment](http://momentjs.com/)
  * [moment-timezone](http://momentjs.com/timezone/)
* [jq](https://stedolan.github.io/jq/)

## AWS Resource Dependencies

**S3.** These scripts expect an S3 bucket has already been created to use as the target for the Lambda code package. In running these scripts you need enough privileges on S3 of that bucket to create/update objects in it.

**IAM Role.** The IAM role referenced in these scripts is a role that attacheds AWSLambdaBasicExecutionRole, AmazonEC2ReadOnlyAccess, and dfines inline policies SendEmail, and StopStartTerminateEC2Instances. The scripts included in this repo DO NOT define these. You will have to create them yourself.

```
$ aws iam get-role --role-name pea1-lambda-automanage
{
    "Role": {
        "AssumeRolePolicyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "sts:AssumeRole",
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "lambda.amazonaws.com"
                    }
                }
            ]
        },
        "RoleId": "AROAIE5FAEQ4AFRTAJJZ2",
        "CreateDate": "2016-06-21T19:19:56Z",
        "RoleName": "pea1-lambda-automanage",
        "Path": "/",
        "Arn": "arn:aws:iam::225162606092:role/pea1-lambda-automanage"
    }
}

$ aws iam list-attached-role-policies --role-name pea1-lambda-automanage
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonEC2ReadOnlyAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }
    ]
}

$ aws iam list-role-policies --role-name pea1-lambda-automanage
{
    "PolicyNames": [
        "SendEmail",
        "StopStartTerminateEC2Instances"
    ]
}

$ aws iam get-role-policy --role-name pea1-lambda-automanage --policy-name SendEmail
{
    "RoleName": "pea1-lambda-automanage",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "ses:SendEmail"
                ],
                "Resource": "*",
                "Effect": "Allow",
                "Sid": "Stmt1466617229994"
            }
        ]
    },
    "PolicyName": "SendEmail"
}

$ aws iam get-role-policy --role-name pea1-lambda-automanage --policy-name StopStartTerminateEC2Instances
{
    "RoleName": "pea1-lambda-automanage",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "ec2:StartInstances",
                    "ec2:StopInstances",
                    "ec2:TerminateInstances"
                ],
                "Resource": "arn:aws:ec2:*:225162606092:instance/*",
                "Effect": "Allow",
                "Sid": "Stmt1466617309959"
            }
        ]
    },
    "PolicyName": "StopStartTerminateEC2Instances"
}

```
