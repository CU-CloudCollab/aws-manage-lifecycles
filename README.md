# aws-manage-lifecycles

This repo contains Node.js functionality to manage lifecycles of AWS EC2 and RDS instances using policies specified in tags. A CloudFormation template creates all of the resources required for running the Lambda function. If you wish to customize the functionality, supplemental scripts are provided to upload the code to an S3 bucket, update the Lambda function with new code, and invokes the Lambda functionally.

The idea is to create one Lambda function in your AWS account that runs at 1 minute after each hour and scans EC2 and RDS instances tagged with a lifecycle policy. When it finds such instances it takes action to implement the policy. E.g., starting instances to fulfill a daily on/off cycle.

This functionality does not launch new instances. It can terminate EC2 instances (but not RDS or OpsWorks instances) if desired, but it operates only on instances that exist and are in a "running" or "stopped" state.

When stopping RDS instances, a snapshot will be created (be default) after the instance is stopped, but this is configurable.

If an EC2 instance is tagged with an OpsWorks instance ID (tag key "opsworks-instance-id", tag value e.g., 	
67959b64-d86c-454d-8ad5-54608e2cae3d), the lambda function will start or stop the instance using OpsWorks. This is important because OpsWorks gets confused if you stop an instance using the EC2 API/console instead of the OpsWorks API/console. NOTE: You are responsible for ensuring that EC2 instances that are owned by OpsWorks are tagged with an "opsworks-instance-id". If not tagged, the lambda function will blindly use the EC2 API to stop/start instances.

## Lifecycle policies

Lifecycle policies are specified by tagging EC2 and RDS instances with a tag named "lifecycle-policy". Some lifecycle policies cannot be applied to RDS instance because at present there is no metadata available about RDS instances that indicate the most recent time an instance was started, or how long it has been running.

* Label name: **lifecycle-policy**
* Label value formats:
  * **none**
    * A policy that does nothing.
  * **limit-stop:[h]**
    * *This policy is applicable only to EC2 and OpsWorks instances.*
    * Stop the instance if it is running and if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-stop:0" means to stop the instance as soon as the policy is checked.
  * **limit-terminate:[h]**
    * *This policy is applicable only to EC2 and OpsWorks instances.*
    * Terminate the instance if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-terminate:0" means to terminate the instance as soon as the policy is checked.
    * If an instance with this policy has an "opsworks-instance-id" tag, the instance will be stopped instead of terminated.
  * **limit-email:[h]/[email-address]**
    * *This policy is applicable only to EC2 and OpsWorks instances.*
    * Send an email to [email-address] if more than [h] hours have elapsed since instance launch date/time.
    * The special case "limit-email:0/[email-address]" means "send the email every time the policy is checked".
  * **cycle-daily:[on-hour]/[off-hour]**
    * *This policy is valid for EC2, OpsWorks, and RDS instances.*
    * Cycle this instance daily, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region (as long as that has been set in the Lambda function code).
    * If [on-hour] > [off-hour] then this is interpreted that the instance should be running overnight. E.g., cycle-daily:20/4 would turn on the instance at 8pm and off at 4am.
    * If [on-hour] == [off-hour], the policy is non-sensical and nothing is done.
  * **cycle-weekday:[on-hour]/[off-hour]**
    * *This policy is valid for EC2, OpsWorks, and RDS instances.*
    * Cycle this instance on weekdays, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region (as long as that has been set in the Lambda function code). Instances remain off on weekends.
    * If [on-hour] > [off-hour], then the instance is turned on at [on-hour] on each weekday (Monday-Friday) and off at [off-hour] on Tuesday-Saturday.
    * If [on-hour] == [off-hour], the policy is nonsensical and nothing is done.
  * **cycle-weekly:[on-hour]/[off-hour]/[day]**
    * *This policy is valid for EC2, OpsWorks, and RDS instances.*
    * Cycle this instance once per week on the specified day, turning it on at [on-hour] and off at [off-hour]. Hour values are 0-23 and are relative to the local time of the AWS region (as long as that has been set in the Lambda function code). Day values can be 0-6 corresponding to Sunday-Saturday.
    * If [on-hour] > [off-hour], the the instance is turned on at [oh-hour] of the designated day and turned off at [off-hour] on the following day.
    * If [on-hour] == [off-hour], the policy is nonsensical and nothing is done.

### OpsWorks tagging

If an EC2 instance is part of an OpsWorks stack, you must ensure that the instance is tagged with the OpsWorks instance ID using tag key "opsworks-instance-id". See the [opsworks-utils-cookbook](https://github.com/CU-CommunityApps/opsworks-utils-cookbook) Chef cookbook for recipes that will help perform that tagging.

## Deploying the function to your AWS account

Deploying this functionality to your own AWS account is easy to do by following the few steps below. If you want to customize the deployment beyond the parameters provided in the CloudFormation template, you will want to first deploy the function as below, and then see the "Customize the function" documentation below.

### CloudFormation template

Since the deployment package required by Lambda is available publicly (at https://s3.amazonaws.com/public.cloud.cit.cornell.edu/examples/aws-manage-lifecycles/lambda-code.zip) all you need to do is to create a CloudFormation stack using the [lambda-manage-lifecycles.yaml](cloudformation/lambda-manage-lifecycles.yaml) in this project. See [AWS CloudFormation documentation](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stack.html) for information about creating CloudFormation stacks.

Note that if you wish to use the "limit-email" policy, you will need to ensure that AWS Simple Email Service (SES) is configured in your AWS account and that you have at least one email address that SES will allow sending mail from.  See [AWS SES documentation](http://docs.aws.amazon.com/ses/latest/DeveloperGuide/setting-up-email.html). Use that validated email address for the CloudFormation template "EmailFromAddressParam" parameter.

### Confirming your CloudFormation deployment

1. Create a few new EC2 instances and give them `lifecycle-policy` tags. Use policies like these so that you don't have to wait for a certain time of the day
  * Key = `lifecycle-policy` Value = `limit-stop:0`
  * Key = `lifecycle-policy` Value = `limit-email:0/yourself@example.com`
2. In the AWS Console, navigate to `Lambda > Functions > lambda-manage-lifecycle`.
3. Click on the `Test` button. This will bring up the `Input test event` dialog.
4. Since this Lambda function ignores its input, and we just care about invoking the function, you can use any sample test data. Leave the default `Hello World` sample event template as is, and click on `Save and test`.
5. Check that the function saw the EC2 instances you tagged with lifecycle policies in the `Log output` window.
6. The function doesn't output anything as a specific result, so you will see `null` as the overall execution result in the AWS Console.

## Customizing the function

These instructions will get you setup to customize and deploy your custom version to your AWS account. They assume you are using a Mac/Linux workstation.

### Setup your development environment

1. [Install the AWS Command Line Interface](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) on your system.
2. [Configure the AWS CLI](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) with credentials for your AWS account.
3. Install Javascript and supporting libraries.
  * If you want to use Node.js in a Docker container:
    1. Ensure you have Docker installed on your workstation. See https://www.docker.com/get-docker.
    1. Run the [go-setup-local-docker.sh](go-setup-local-docker.sh) script to install the following Javascript libraries (npm modules):
      1. [aws-sdk](https://www.npmjs.com/package/aws-sdk)
      1. [moment](http://momentjs.com/)
      1. [moment-timezone](http://momentjs.com/timezone/)
  * If you want to install/use Node.js directly on your workstation.
    1. Install [Node.js](https://nodejs.org/en/). This code was targeted against Lambda support for Node.js 10.16.3.
    1. Install [npm](https://www.npmjs.com/).
    1. Run the [go-setup-local.sh](go-setup-local.sh) script to install the following Javascript libraries (npm modules):
      1. [aws-sdk](https://www.npmjs.com/package/aws-sdk)
      1. [moment](http://momentjs.com/)
      1. [moment-timezone](http://momentjs.com/timezone/)

### Customize the function

1. Create an S3 bucket or identify an existing bucket to hold the code to be deployed to Lambda.
  * The only permissions required for the bucket are whatever is needed for you to create and update objects in the bucket.
1. If you wish to use the "limit-email" policy, you will need to ensure that AWS Simple Email Service (SES) is configured in your AWS account and that you have at lease one email address that SES will allow sending mail from. See [AWS SES documentation](http://docs.aws.amazon.com/ses/latest/DeveloperGuide/setting-up-email.html).    
1. Deploy the original version of the function using the CloudFormation template as described above. This will provide a baseline deployment of the function that you can then modify.
1. Clone this repo to your local machine.
  ```
  $ git clone https://github.com/CU-CloudCollab/aws-manage-lifecycles.git
  $ cd aws-manage-lifecycles
  ```
1. Update the [constants.sh](constants.sh) file:
  1. Set the bucket name (S3_BUCKET) to the bucket you created or identified at the beginning of these customization steps above.
  1. Optionally, update other names and values.
1. Make other changes you wish to [lambda.js](lambda.js).

### Test your configuration

1. Tag a few running EC2 instances with "lifecycle-policy" tags.
  * Use policies like these so that you don't have to wait for a certain time of the day
    * Key = `lifecycle-policy` Value = `limit-stop:0`
    * Key = `lifecycle-policy` Value = `limit-email:0/yourself@example.com`
1. Invoke lambda.js once locally.
  * Using Node.js installed on your workstation:
    ```
    $ ./go-run-local.sh
    ```
  * Using Node.js in Docker:
    ```
    $ ./go-run-local-docker.sh
    ```
1. Review the script output and check the state of your EC2 instances to see the results of the policies.

### Push your configuration to AWS

1. Package up the code, upload it to S3, and update the existing Lambda function to use it. This is all taken care of in one script. It will upload a package with the appropriate format to the S3 bucket named in [constants.sh](constants.sh).

  ```
  $ ./go-update.sh
  ```

### (Optional) Invoke the updated Lambda function from the CLI

1. Update tags on EC2/RDS instance or change the instance states so that the function will have something to do.

2. Invoke the function in AWS using the CLI

 ```  
 $ ./go-invoke.sh
 ```

### Update the CloudFormation stack

This step bakes in the customizations that you made locally.

Here, you simply want to find the CloudFormation stack you made earlier, and update it. Specify the same template ([cloudformation/lambda-manage-lifecycles.yaml](cloudformation/lambda-manage-lifecycles.yaml)) but this time around, change the CodeS3BucketNameParam to be the S3 bucket you used in the "Customize the function" step. Change other stack parameters to match the settings you updated in [constants.sh](constants.sh).

After the stack successfully updates, you can push new versions of [lambda.js](lambda.js) to the S3 bucket using the [go-update.sh](go-update.sh) script. When you want to finalize the script, bake it into the stack simply by updating the CloudFormation stack again, using the previous set of stack parameters.

## bash Scripts

* **[constants.sh](constants.sh)** constants required for the bash scripts and for running lambda.js locally.

* **[go-setup-local.sh](go-setup-local.sh)** installs the Javascript libraries (npm modules) locally so that lambda.js can be run locally and so that you can create an appropriately structured Lambda deployment package for uploading.
  * **[go-setup-local-docker.sh](go-setup-local-docker.sh)** does the same thing but uses a Node.js Docker container to do it.

* **[go-upload.sh](go-upload.sh)** zips the local lambda.js script and supporting Javascript modules into a Lambda-compatible package of code and uploads it to S3. This script is called by other scripts here.

* **[go-update.sh](go-update.sh)** Updates the Lambda function with the current version of the local lambda.js file.

* **[go-run-aws.sh](go-run-aws.sh)** invokes your Lambda function in AWS from the CLI.

* **[go-run-local.sh](go-run-local.sh)** runs the lambda.js function locally, not by invoking the code in Lambda.

* **[go-run-local-docker.sh](go-run-local-docker.sh)** runs the lambda.js function locally in a Node.js Docker container, not by invoking the code in Lambda.

* **[go-run-test.sh](go-run-test)** runs some tests to show the interpretation of example lifecycle policies.
  * **[go-run-test-docker.sh](go-run-test-docker.sh)** runs the same tests, but uses a Node.js Docker container to do it.

## Javascripts

* **[lambda.js](lambda.js)** contains a Node.js script for executing in Lambda.

* **[run-local.js](run-local.js)** will run that script on a local machine, instead of in AWS Lambda.

* **[run-test.js](run-test.js)** tests some of the functions in lambda.js locally. Command line:

