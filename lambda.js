'use strict';

// misc. constants
var MILLISECONDS_PER_HOUR = 1000 * 60 * 60;
var POLICY_TAG_NAME = "lifecycle-policy";
var EMAIL_FROM_ADDRESS = "cloud-support@cornell.edu";
var POLICY_SYNTAX_SEPARATOR_PRIMARY = ":";
var POLICY_SYNTAX_SEPARATOR_SECONDARY = ";";
var MOMENT_TIMEZONE = "America/New_York";

// Are instance stop/start/terminate dry runs?
var DRY_RUN = false;

// policy names
var POLICY_LIMIT_STOP = "limit-stop";
var POLICY_LIMIT_TERMINATE = "limit-terminate";
var POLICY_LIMIT_EMAIL = "limit-email";
var POLICY_CYCLE_DAILY = "cycle-daily";
var POLICY_CYCLE_WEEKDAY = "cycle-weekday";
var POLICY_NONE = "none";

// possible actions
var ACTION_ERROR = "error";
var ACTION_NONE = "none";
var ACTION_STOP = "stop";
var ACTION_TERMINATE = "terminate";
var ACTION_START = "start";
var ACTION_EMAIL = "email";

var moment = require('moment-timezone');
moment.tz.setDefault(MOMENT_TIMEZONE);

var aws = require('aws-sdk');
aws.config.region = 'us-east-1';
var ec2Client = new aws.EC2();
var sesClient = new aws.SES();

function getTagValue(targetTag, tags) {
  var result = tags.filter(function(item) {
    return item.Key === targetTag;
    }
  )
  if (targetTag.length < 1) {
    console.log ("targetTag '" + targetTag + "' is missing.");
    return null;
  }
  return result[0].Value;
}

function getInstanceName(instance) {
  var result = getTagValue("Name", instance.Tags);
  if (!result) result = instance.InstanceId;
  return result;
}

function getLifeCyclePolicy(instance) {
  return getTagValue(POLICY_TAG_NAME, instance.Tags);
}

function checkPolicy(instance) {
  var instanceName = getTagValue("Name", instance.Tags);
  var policy = getLifeCyclePolicy(instance);

  // console.log(instance);
  // console.log(instance.Tags)
  // console.log("lifecycle-policy = " + policy);
  console.log("--------------------------------");
  console.log("Instance: " + instanceName + " (" + instance.InstanceId + ")");

  var result = policy.split(POLICY_SYNTAX_SEPARATOR_PRIMARY);
  var policyName = result[0];
  var policyParms = result[1];
  console.log("policyName: " + policyName + "\tpolicyParms: " + policyParms);
  var running = isInstanceRunning(instance);
  console.log("running?: " + running);
  if (running)  console.log("launch time: " + instance.LaunchTime);

  var response = ACTION_NONE;

  switch (policyName) {
    case POLICY_LIMIT_STOP:
      response = checkPolicyLimitStopOrTerminate(instance, policyName, policyParms);
      break;
    case POLICY_LIMIT_TERMINATE:
      response = checkPolicyLimitStopOrTerminate(instance, policyName, policyParms);
      break;
    case POLICY_LIMIT_EMAIL:
      response = checkPolicyLimitEmail(instance, policyName, policyParms);
      break;
    case POLICY_CYCLE_DAILY:
      response = checkPolicyCycle(instance, policyName, policyParms);
      break;
    case POLICY_CYCLE_WEEKDAY:
      response = checkPolicyCycle(instance, policyName, policyParms);
      break;
    case POLICY_NONE:
      response = ACTION_NONE;
      break;
    default:
      response = checkPolicyDummy(instance, policyName, policyParms)
      //
  }
  return response;
}

function checkPolicyDummy(instance, policyName, policyParms) {
  console.log("The '" + policyName + "' policy is not yet implemented.");
  return ACTION_ERROR;
}

function checkPolicyCycle(instance, policyName, policyParms) {

  var response = ACTION_NONE;

  var temp = policyParms.split(POLICY_SYNTAX_SEPARATOR_SECONDARY);
  var onHour = Number(temp[0]);
  var offHour = Number(temp[1]);

  var now = moment();
  var currentHour = now.hour();
  var weekday =  isWeekday(now);

  // console.log("on-off: " + onHour + " - " + offHour);
  // console.log("current time:: hour: " + currentHour + "\tisWeekday?:" + weekday);

  var withinTarget = isWithinTargetPeriod(policyName, onHour, offHour, currentHour, weekday)

  if (withinTarget) {
    console.log("Current hour (" + currentHour+ ") is INSIDE target period.")
    if (!isInstanceRunning(instance)) {
      console.log("Instance should be turned ON.")
      response = ACTION_START;
    }
  }
  else {
    console.log("Current hour (" + currentHour+ ") is OUTSIDE target period.")
    if (isInstanceRunning(instance)) {
      console.log("Instance should be turned OFF.")
      response = ACTION_STOP;
    }
  }
  return response;
}

function isWithinTargetPeriod(policyName, policyOnHour, policyOffHour, nowHour, nowWeekday) {

  var inverse = policyOnHour > policyOffHour;

  if (((policyName == POLICY_CYCLE_WEEKDAY) && inverse) || (policyOnHour == policyOffHour)) {
    console.log("Invalid parameters.");
    return false;
  }

  if (inverse) {
    var temp = policyOnHour;
    policyOnHour = policyOffHour;
    policyOffHour = temp;
  }
  var withinTarget = (policyOnHour <= nowHour) && (nowHour < policyOffHour);

  if (inverse) withinTarget = !withinTarget;

  if (policyName == POLICY_CYCLE_WEEKDAY) withinTarget = withinTarget && nowWeekday;

  return withinTarget;

}

// Expose this function for testing outside of this file.
exports.testIsWithinTargetPeriod = isWithinTargetPeriod;

function checkPolicyLimitEmail(instance, policyName, policyParms) {
  var response = ACTION_NONE;

  var temp = policyParms.split(POLICY_SYNTAX_SEPARATOR_SECONDARY);
  var hours = temp[0];
  var email = temp[1];
  instance.automanageEmail = email;
  var beyondLimit = isBeyondRunningTimeLimit(instance, hours);
  // console.log("notification address: " + email);
  // console.log("hours: " + hours);
  if (beyondLimit) {
    console.log("Email should be sent about this instance.")
    response = ACTION_EMAIL;
  }
  else {
    console.log("Email should NOT be sent about this instance.")
  }
  return response;
}

function checkPolicyLimitStopOrTerminate(instance, policyName, policyParms) {
  var response = ACTION_NONE;
  var beyondLimit = isBeyondRunningTimeLimit(instance, policyParms);
  if (beyondLimit) {
    if (policyName == POLICY_LIMIT_TERMINATE ) {
      // terminate
      console.log("This instance should be terminated.")
      response = ACTION_TERMINATE;
    }
    else {
      // stop
      console.log("This instance should be stopped.")
      response = ACTION_STOP;
    }
  }
  else {
    console.log("This instance run time limit is not yet reached.")
  }
  return response;
}

function getRunningTimeMilliSeconds(instance) {
  var result = -1;
  if (isInstanceRunning(instance)) {
    result = Date.now() - instance.LaunchTime
  }
  // console.log("RunningTime: " + result);
  return result;
}

function isBeyondRunningTimeLimit(instance, hours) {
  var runningTimeMilliSecs = getRunningTimeMilliSeconds(instance);
  // console.log("MILLISECONDS_PER_HOUR: " + MILLISECONDS_PER_HOUR);
  // console.log("policy limit: " + MILLISECONDS_PER_HOUR * hours + "ms");
  var result = (hours * MILLISECONDS_PER_HOUR < runningTimeMilliSecs);
  // console.log("isBeyondRunningTimeLimit: " + result);
  return result;
}

function isInstanceRunning(instance) {
  return instance.State.Name == 'running'
}

function isWeekday(moment) {
  return (moment.day()) >= 1 && (moment.day() <= 5)
}

function takeAction(ec2Client, sesClient, instance, action) {


  var ec2Params = {
    InstanceIds: [ instance.InstanceId ],
    DryRun: DRY_RUN
  };

  var sesParams = {
    Destination: { /* required */
      ToAddresses: [ instance.automanageEmail ]
    },
    Message: { /* required */
      Body: { /* required */
        Text: {
          Data:  emailBody(instance)/* required */
        }
      },
      Subject: { /* required */
        Data: emailSubject(instance) /* required */
      }
    },
    Source: EMAIL_FROM_ADDRESS, /* required */
  };

  var callback = function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  };

  switch (action) {
    case ACTION_EMAIL:
      console.log("ACTION: Sending email to " + instance.automanageEmail + " about " + getInstanceName(instance));
      sesClient.sendEmail(sesParams, callback);
      break;
    case ACTION_START:
      console.log("ACTION: Starting instance " + getInstanceName(instance));
      ec2Client.startInstances(ec2Params, callback);
      break;
    case ACTION_STOP:
      console.log("ACTION: Stopping instance " + getInstanceName(instance));
      ec2Client.stopInstances(ec2Params, callback);
      break;
    case ACTION_TERMINATE:
      console.log("ACTION: Terminating instance " + getInstanceName(instance));
      ec2Client.terminateInstances(ec2Params, callback);
      break;
    default:
      console.log("ACTION: " + action );
  }


}

function emailSubject(instance) {
  return "lambda-automanage notification - " + getInstanceName(instance);
}

function emailBody(instance) {
  return "Notification from lambda-automanage\n" +
    "\ninstanceId: " + instance.InstanceId +
    "\ninstance name: " + getInstanceName(instance) +
    "\nlifecycle-policy: " + getLifeCyclePolicy(instance) +
    "\n\n\n" + JSON.stringify(instance, null, 2);
}

exports.myhandler = (event, context) => {

  // console.log('Received event:', JSON.stringify(event, null, 2));
  // console.log("\n\nInside handler\n\n");

  var ec2Params = {
    Filters: [
      // {Name: 'instance-state-name', Values: ['running']},
      {Name: 'tag-key', Values: ['lifecycle-policy']}
    ]
  };

  ec2Client.describeInstances( ec2Params, function(err, data) {
    // console.log("\nIn describe instances:\n");
    if (err) console.log(err, err.stack); // an error occurred
    else {
      // console.log("\n\n" + data + "\n\n"); // successful response
      // console.log("\n\n" + data.Reservations + "\n\n"); // successful response

      // console.log(data.Reservations)
      var i;
      for (i = 0; i < data.Reservations.length; i++) {
        var r = data.Reservations[i]
        // console.log(r)
        var j;
        for (j = 0; j < r.Instances.length; j++) {
            var target = r.Instances[j]
            // console.log(target)
            var response = checkPolicy(target);
            takeAction(ec2Client, sesClient, target, response);
        }
      }
     }
  });
  // callback(null, "success");
  // callback('Something went wrong');
};
