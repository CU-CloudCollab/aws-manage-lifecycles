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
    * The special case "limit-stop:0" means to stop the instance as soon as the policy is checked.
  * **limit-terminate:[h]**
    * Terminate the instance if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-terminate:0" means to terminate the instance as soon as the policy is checked.
  * **limit-email:[h];[email-address]**
    * Send an email to [email-address] if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-email:0;[email-address]" means "send the email every time the policy is checked".
  * **cycle-daily:[on-hour];[off-hour]**
    * Cycle this instance daily, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region (as long as that has been set in the Lambda function code).
    * If [on-hour] > [off-hour] then this is interpreted that the instance should be running overnight. E.g., cycle-daily:20;4 would turn on the instance at 8pm and off at 4am.
    * If [on-hour] == [off-hour], the policy is non-sensical and nothing is done.
  * **cycle-weekday:[on-hour];[off-hour]**
    * Cycle this instance on weekdays, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region (as long as that has been set in the Lambda function code). Instances remain off on weekends.
    * If [on-hour] > [off-hour], nothing is done. This could be improved eventually, after deciding on what these overnight cycles mean for Mondays and Fridays.
    * If [on-hour] == [off-hour], the policy is nonsensical and nothing is done.

## Deploying

These instructions will get you setup to customize and deploy this functionality to your AWS account. They assume you are using a Mac/Linux workstation.

**Setup your environment**

1. [Install the AWS Command Line Interface](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) on your system.
1. [Configure the AWS CLI](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) with credentials for your AWS account.
1. Install [jq](https://stedolan.github.io/jq/) onto your workstation.
1. Install Javascript and supprting libraries.
  1. Install [Node.js](https://nodejs.org/en/). This code was targeted against Lambda support for Node.js 4.3.
  1. Install [NPM](https://www.npmjs.com/)
  1. Install supporting Javascript libraries (NPM modules):
    1. [aws-sdk](https://www.npmjs.com/package/aws-sdk)
    1. [moment](http://momentjs.com/)
    1. [moment-timezone](http://momentjs.com/timezone/)

**Customize and configure the code**

1. Download this repo to your local machine.
1. Create an S3 bucket or identify an existing bucket to hold the code to be deployed to Lambda.
  * The only permissions required for the bucket are whatever is needed for you to create and update objects in the bucket.
1. If you wish to use the "limit-email" policy, you will need to ensure that AWS Simple Email Service (SES) is configured in your AWS account and that you have at lease one email address that SES will allow sending mail from.  
1. Create an IAM role to be assigned to the Lambda function.
  1. Go to IAM in the AWS console.
  1. Create a new role with a name of your choosing.
  1. In "Select Role Type", select "AWS Lambda" under "AWS Service Roles".
  1. Attach the following built-in policies:
    * AmazonEC2ReadOnlyAccess
    * AWSLambdaBasicExecutionRole
  1. And "Create Role"
  1. Navigate to the newly created role.
  1. On the "Permissions" tab, open the "Inline Policies" section and click on the link to create a new inline policy.
  1. Select "Custom Policy"
  1. Set "Policy Name" to "SendEmail".
  1. Paste the following policy as the Policy Document:
  ```
  {
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
  }
  ```
  1. Click "Apply Policy".
  1. Repeat the process to add another inline policy with name "StopStartTerminateEC2Instances" and policy document as follows:
  ```
  {
      "Version": "2012-10-17",
      "Statement": [
          {
              "Action": [
                  "ec2:StartInstances",
                  "ec2:StopInstances",
                  "ec2:TerminateInstances"
              ],
              "Resource": "arn:aws:ec2:*:*:instance/*",
              "Effect": "Allow",
              "Sid": "Stmt1466617309959"
          }
      ]
  }
  ```
1. Update the constants.sh file:
  1. Set the bucket name (S3BUCKET) and role ARN (LAMBDA_ROLE) to the values resulting from earlier configuration steps.
  1. Optionally change the schedule you wish to apply to your Lambda function. See http://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
  1. Optionally, update other names and labels.
1. Update lambda.js:
  1. Set MOMENT_TIMEZONE value to match whatever time you wish to use for specifying on/off times for the "cycle-daily" and "cycle-weekday" policies. See http://momentjs.com/timezone/docs/ and http://momentjs.com/timezone/docs/#/data-loading/getting-zone-names/.
  1. Set the EMAIL_FROM_ADDRESS to one that is configured to be accepted for sending by SES. This is required only if you wish to use the "limit-email" policy.
  1. Optionally, change any of the other constants configured in lambda.js. E.g., POLICY_TAG_NAME.

**Test your configuration**

1. Tag a few running EC2 instances with "lifecycle-policy" tags.
  * E.g., start some new instances and give them a policies like:
    * "lifecycle-policy=limit-stop:0"
    * "lifecycle-policy=limit-email:0;yourself@example.com"
1. Invoke lambda.js once locally, using the run-local.js wrapper:
 ```
 $ node run-local.js
 ```
1. Review local output and check your EC2 instances to see the results of the policies.

**Create and configure the Lambda function**

1. Create the Lambda function:

 ```
 $ ./go-create.sh
 ```

2. Set the schedule for the function:

 ```
$ ./go-schedule.sh
 ```

3. Optionally, invoke the function the run in AWS immediately:

 ```  
 $ ./go-invoke.sh
 ```

4. Check the output of your Lambda function.
  1. In the AWS Console, navigate to you Lambda function.
  1. Click on the "Monitoring" tab.
  1. Click on the "View logs in CloudWatch" link.

**Update the Lambda function**

1. Whenever you change the lambda.js code, you will need to upload a new package for Lambda to the S3 bucket and tell Lambda to get it.

 ```
 $ ./go-update.sh
 ```

## JavaScripts

**lambda.js** contains a Node.js script for executing in Lambda.

**run-local.js** will run that script on a local machine, instead of in AWS Lambda.

**test.js** tests some of the functions in lambda.js locally. Command line:

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

**go-show-role.sh** shows configuration of the role you are assigning to the Lmabda function. Be sure to set `ROLE_NAME` in the script to be the name you used.

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

**S3.** These scripts expect an S3 bucket has already been created to use as the target for the Lambda code package. In running these scripts you need enough privileges on S3 of that bucket to create and update objects in it.

**IAM Role.** The IAM role referenced in these scripts is a role that attaches AWSLambdaBasicExecutionRole, AmazonEC2ReadOnlyAccess, and defines inline policies SendEmail, and StopStartTerminateEC2Instances. The scripts included in this repo DO NOT define these. You will have to create them yourself. Use the go-show-role.sh script to confirm that your role looks like the following:

```
$ ./go-show-role.sh
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
        "RoleId": "AROAJHLL5RCZQQ6BHRG4G",
        "CreateDate": "2016-06-23T13:50:08Z",
        "RoleName": "manage-lifecycle-lambda",
        "Path": "/",
        "Arn": "arn:aws:iam::225162606092:role/manage-lifecycle-lambda"
    }
}
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
{
    "PolicyNames": [
        "SendEmail",
        "StopStartTerminateEC2Instances"
    ]
}
{
    "RoleName": "manage-lifecycle-lambda",
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
{
    "RoleName": "manage-lifecycle-lambda",
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
{
    "RoleName": "manage-lifecycle-lambda",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "ec2:StartInstances",
                    "ec2:StopInstances",
                    "ec2:TerminateInstances"
                ],
                "Resource": "arn:aws:ec2:*:*:instance/*",
                "Effect": "Allow",
                "Sid": "Stmt1466617309959"
            }
        ]
    },
    "PolicyName": "StopStartTerminateEC2Instances"
}```
