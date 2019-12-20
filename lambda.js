'use strict';

var CODE_VERSION="1.3"

// CHANGE LOG

// Version 1.3
// - added support for "always-on" and "always-off" policies.
// - added validation to ensure that an EC2 instance that was part of an 
//   OpsWorks stack was NOT acted upon unless it has a 'opsworks-instance-id' 
//   tag.

// Version 1.1
// - added support for managing instances that are part of OpsWorks stacks. 
//   Assumes that such instances are tagged with their OpsWorks instance ID

// Constants used to customize the configuration of your deployment.
// You MUST update these according to your situation.
var EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;
var MOMENT_TIMEZONE = process.env.MOMENT_TIMEZONE;

// Are instance stop/start/terminate dry runs? For EC2 policies only.
var EC2_DRY_RUN = ("true" == process.env.EC2_DRY_RUN);
var SNAPSHOT_ON_RDS_STOP = ("true" == process.env.SNAPSHOT_ON_RDS_STOP);

// misc. constants
var MILLISECONDS_PER_HOUR = 1000 * 60 * 60;
var POLICY_TAG_NAME = "lifecycle-policy";
var POLICY_SYNTAX_SEPARATOR_PRIMARY = ":";
var POLICY_SYNTAX_SEPARATOR_SECONDARY = "/";
var OPSWORKS_INSTANCE_ID_TAG_KEY = "opsworks-instance-id";

// This is a tag that OpsWorks adds to it's EC2 instances.
// We use this to ensure that we aren't accidentally 
// turning on/off an EC2 instance that doesn't have the 
// OPSWORKS_INSTANCE_ID_TAG_KEY key set. 
var OPSWORKS_VALIDATION_KEY = "opsworks:stack";

// policy names
var POLICY_LIMIT_STOP = "limit-stop";
var POLICY_LIMIT_TERMINATE = "limit-terminate";
var POLICY_LIMIT_EMAIL = "limit-email";
var POLICY_CYCLE_DAILY = "cycle-daily";
var POLICY_CYCLE_WEEKDAY = "cycle-weekday";
var POLICY_CYCLE_WEEKLY = "cycle-weekly";
var POLICY_NONE = "none";
var POLICY_ALWAYS_ON = "always-on";
var POLICY_ALWAYS_OFF = "always-off";

// possible actions
var ACTION_ERROR = "error";
var ACTION_NONE = "none";
var ACTION_STOP = "stop";
var ACTION_TERMINATE = "terminate";
var ACTION_START = "start";
var ACTION_EMAIL = "email";

var moment = require('moment-timezone');
moment.tz.setDefault(MOMENT_TIMEZONE);

// try to use our local aws-sdk version (~2.83.0) instead of the built in one for
// Lambda, which is 2.54.0 as of July 15, 2017.
var aws = require('aws-sdk');

aws.config.region = 'us-east-1';
var ec2Client = new aws.EC2();
var sesClient = new aws.SES();
var rdsClient = new aws.RDS();
var owClient = new aws.OpsWorks();

function getTagValue(targetTag, tags) {
  var result = tags.filter(function(item) {
    return item.Key === targetTag;
    }
  )
  if (result.length < 1) {
    // console.log ("targetTag '" + targetTag + "' is missing.");
    return null;
  }
  return result[0].Value;
}

function isRds(instance) {
  if (instance.DBInstanceArn) return true;
  return false;
}

function isEc2(instance) {
  return !isRds(instance);
}

function isPartOfOpsWorks(instance) {
  if (instance.OpsWorksStack) return true;
  return false;
}

function hasOpsWorksInstanceIdTag(instance) {
  if (instance.OpsWorksInstanceId) return true;
  return false;
}

function getInstanceName(instance) {
  if (isRds(instance)) return instance.DBInstanceArn;        // RDS
  var result = getTagValue("Name", instance.Tags);    // EC2
  if (!result) result = instance.InstanceId;
  return result;
}

function getLifeCyclePolicy(instance) {
  return getTagValue(POLICY_TAG_NAME, instance.Tags);
}

function checkPolicy(instance) {
  var instanceName = getInstanceName(instance);
  var policy = getLifeCyclePolicy(instance);
  
  // Check whether this is an OpsWorks instance
  var opsworksInstanceId = getTagValue(OPSWORKS_INSTANCE_ID_TAG_KEY, instance.Tags);
  if (opsworksInstanceId) {
    instance.OpsWorksInstanceId = opsworksInstanceId;
    console.log("OpsWorksInstanceId: " + instance.OpsWorksInstanceId);
  }

  var opsworksValidation = getTagValue(OPSWORKS_VALIDATION_KEY, instance.Tags);
  if (opsworksValidation) {
    instance.OpsWorksStack = opsworksValidation;
    console.log("OpsWorksStack: " + instance.OpsWorksStack);
  }

  // console.log(instance);
  // console.log(instance.Tags)
  // console.log("lifecycle-policy = " + policy);
  console.log("--------------------------------");
  if (hasOpsWorksInstanceIdTag(instance)) {
    console.log("OpsWorks Instance: " + instanceName + " (" + instance.OpsWorksInstanceId + ", " + instance.InstanceId + ")");
  } else if (isEc2(instance)) {
    console.log("EC2 Instance: " + instanceName + " (" + instance.InstanceId + ")");
  } else if (isRds(instance)) {
    console.log("RDS Instance: " + instanceName);
  }

  var result = policy.split(POLICY_SYNTAX_SEPARATOR_PRIMARY);
  var policyName = result[0];
  var policyParms = result[1];
  console.log("policyName: " + policyName + "\tpolicyParms: " + policyParms);
  var running = isInstanceRunning(instance);
  // console.log("running?: " + running);
  // if (running && instance.LaunchTime)  console.log("launch time: " + instance.LaunchTime);

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
    case POLICY_CYCLE_WEEKLY:
      response = checkPolicyCycle(instance, policyName, policyParms);
      break;
    case POLICY_NONE:
      response = ACTION_NONE;
      break;
    case POLICY_ALWAYS_OFF:
      response = checkPolicyAlwaysOnOff(instance, policyName);
      break;
    case POLICY_ALWAYS_ON:
      response = checkPolicyAlwaysOnOff(instance, policyName);
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

function checkPolicyAlwaysOnOff(instance, policyName) {
  
  var response = ACTION_NONE;
  if (isInstanceRunning(instance)) {
    if (policyName == POLICY_ALWAYS_OFF) {
      console.log("Instance should be turned OFF.")
      response = ACTION_STOP;
    }
  }
  else {
    // not running
    if (policyName == POLICY_ALWAYS_ON) {
      if (isInstanceStartable(instance)) {
        response = ACTION_START;
        console.log("Instance should be turned ON.")
      }
      else {
        console.log("Instance should be turned ON, but is not in a startable state.")
      }
    }
  }
  return response;
}

function checkPolicyCycle(instance, policyName, policyParms) {

  var response = ACTION_NONE;
  var temp = policyParms.split(POLICY_SYNTAX_SEPARATOR_SECONDARY);
  var onHour = Number(temp[0]);
  var offHour = Number(temp[1]);
  var targetDay = Number(temp[2]);

  var now = moment();
  var currentHour = now.hour();
  var weekday =  isWeekday(now);
  var nowDay = now.day()

  // console.log("on-off: " + onHour + " - " + offHour);
  // console.log("targetDay: " + targetDay);
  // console.log("current time:: hour: " + currentHour + "\tisWeekday?:" + weekday);
  // console.log("current day: " + nowDay);

  var withinTarget = isWithinTargetPeriod(policyName, onHour, offHour, targetDay, currentHour, weekday, nowDay)

  if (withinTarget) {
    console.log("Current hour (" + currentHour+ ") is INSIDE target period.")
    if (isInstanceRunning(instance)) {
      console.log("Instance is already running.");
    }
    else if (isInstanceStartable(instance)) {
      console.log("Instance should be turned ON.")
      response = ACTION_START;
    }
    else {
      console.log("Instance should be running, but current state (" + getInstanceState(instance) + ") will not allow start command to be acted upon.");
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

function isWithinTargetPeriod(policyName, policyOnHour, policyOffHour, policyDay, nowHour, nowWeekday, nowDay) {

  if (policyOnHour == policyOffHour) {
    console.log("Invalid parameters.");
    return false;
  }
  if (policyOnHour > policyOffHour) return isWithingTargetPeriodInverse(policyName, policyOnHour, policyOffHour, policyDay, nowHour, nowWeekday, nowDay)

  var withinTarget = (policyOnHour <= nowHour) && (nowHour < policyOffHour);
  if (policyName == POLICY_CYCLE_WEEKDAY) withinTarget = withinTarget && nowWeekday;
  else if (policyName == POLICY_CYCLE_WEEKLY) withinTarget = withinTarget && (policyDay == nowDay)
  return withinTarget;
}

  // Here we know that policyOnHour > policyOffHour
function isWithingTargetPeriodInverse(policyName, policyOnHour, policyOffHour, policyDay, nowHour, nowWeekday, nowDay) {
  var result = false;
  if (policyName == POLICY_CYCLE_WEEKDAY) {
    if (nowDay == 1 /* Monday */ )        result = nowHour >= policyOnHour
    else if (nowWeekday)                  result = ! ((nowHour >= policyOffHour) && (nowHour < policyOnHour));
    else if (nowDay == 6 /* Saturday */)  result = nowHour < policyOffHour;
  }
  else if (policyName == POLICY_CYCLE_DAILY) {
    result =  ! ((nowHour >= policyOffHour) && (nowHour < policyOnHour));
  }
  else if (policyName == POLICY_CYCLE_WEEKLY) {
      if (nowDay == policyDay)        result = nowHour >= policyOnHour;
      if (nowDay == (policyDay+1)%7)  result = nowHour < policyOffHour;
  }
  return result;
}

// Expose this function for testing outside of this file.
exports.testIsWithinTargetPeriod = isWithinTargetPeriod;

function checkPolicyLimitEmail(instance, policyName, policyParms) {

  if (isRds(instance)) {
    console.log("The '"+policyName+"' policy cannot be applied to RDS instances.");
    return ACTION_ERROR;
  }

  var response = ACTION_NONE;

  var temp = policyParms.split(POLICY_SYNTAX_SEPARATOR_SECONDARY);
  var hours = temp[0];
  var email = temp[1];
  instance.lifecycleEmail = email;
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

  if (isRds(instance)) {
    console.log("The '"+policyName+"' policy cannot be applied to RDS instances.");
    return ACTION_ERROR;
  }

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

function getInstanceState(instance) {
  if (isEc2(instance)) return instance.State.Name
  return instance.DBInstanceStatus
}

function isInstanceRunning(instance) {
  return getInstanceState(instance) == 'running' || getInstanceState(instance) == 'available';
}

function isInstanceStartable(instance) {
  return getInstanceState(instance) == 'stopped'
}


function isWeekday(moment) {
  return (moment.day()) >= 1 && (moment.day() <= 5)
}

function takeActionRds(rdsClient, sesClient, instance, action) {
  var sesParams = {
    Destination: { /* required */
      ToAddresses: [ instance.lifecycleEmail ]
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
      console.log("ACTION: Sending email to " + instance.lifecycleEmail + " about " + getInstanceName(instance));
      sesClient.sendEmail(sesParams, callback);
      break;
    case ACTION_START:
      var rdsParams = {
        DBInstanceIdentifier: instance.DBInstanceIdentifier
      };
      console.log("ACTION: Starting instance " + getInstanceName(instance));
      rdsClient.startDBInstance(rdsParams, callback);
      break;
    case ACTION_STOP:

      var rdsParams = {
        DBInstanceIdentifier: instance.DBInstanceIdentifier, /* required */
        // DBSnapshotIdentifier: instance.DBInstanceIdentifier + "-lifecycle-" + now.format("YYYY-MM-DD-HH-mm")
      };
      if (SNAPSHOT_ON_RDS_STOP) {
        rdsParams.DBSnapshotIdentifier = instance.DBInstanceIdentifier + "-lifecycle-" + moment().format("YYYY-MM-DD-HH-mm");
        console.log("ACTION: Snapshot to be created: " + rdsParams.DBSnapshotIdentifier);
      }
      console.log("ACTION: Stopping instance " + getInstanceName(instance));
      rdsClient.stopDBInstance(rdsParams, callback);
      break;
    case ACTION_TERMINATE:
      console.log("SKIPPING ACTION: Terminating instance " + getInstanceName(instance));
      // var params = {
      //   DBInstanceIdentifier: instance.DBInstanceIdentifier, /* required */
      //   FinalDBSnapshotIdentifier: 'STRING_VALUE',
      //   SkipFinalSnapshot: true || false /* default = false */
      // };
      // rdsClient.terminateInstances(params, callback);
      break;
    case ACTION_NONE:
      console.log("ACTION: None; nothing to do");
      break;
    default:
      console.log("INVALID ACTION: " + action );
  }
}

function takeActionEc2(ec2Client, sesClient, instance, action) {

  var ec2Params = {
    InstanceIds: [ instance.InstanceId ],
    DryRun: EC2_DRY_RUN
  };

  var sesParams = {
    Destination: { /* required */
      ToAddresses: [ instance.lifecycleEmail ]
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
    case ACTION_START:
    case ACTION_STOP:
    case ACTION_TERMINATE:
      if (isPartOfOpsWorks(instance) && !hasOpsWorksInstanceIdTag(instance)) {
        console.log("WARNING: Instance "+ getInstanceName(instance) + " is managed by OpsWorks, but does not have an 'opsworks-instance-id' tag so ACTION has been overridden to NONE.");
        action = ACTION_NONE;
      }
    default:
      break;
  }

  switch (action) {
    case ACTION_EMAIL:
      console.log("ACTION: Sending email to " + instance.lifecycleEmail + " about " + getInstanceName(instance));
      sesClient.sendEmail(sesParams, callback);
      break;
    case ACTION_START:
      console.log("ACTION: Starting instance " + getInstanceName(instance));
      if (hasOpsWorksInstanceIdTag(instance)) {
        owClient.startInstance({ InstanceId: instance.OpsWorksInstanceId }, callback);
      } else {
        ec2Client.startInstances(ec2Params, callback);
      }
      break;
    case ACTION_STOP:
      console.log("ACTION: Stopping instance " + getInstanceName(instance));
      if (hasOpsWorksInstanceIdTag(instance)) {
        owClient.stopInstance({ InstanceId: instance.OpsWorksInstanceId }, callback);
      } else {
        ec2Client.stopInstances(ec2Params, callback);
      }
      break;
    case ACTION_TERMINATE:
      if (hasOpsWorksInstanceIdTag(instance)) {
        console.log("ACTION: TERMINATION was specified in lifecycle policy, but am STOPPING instance instead since it belongs to OpsWorks");      
        owClient.stopInstance({ InstanceId: instance.OpsWorksInstanceId }, callback);
      } else {      
        console.log("ACTION: Terminating instance " + getInstanceName(instance));        
        ec2Client.terminateInstances(ec2Params, callback);
      }
      break;
    case ACTION_NONE:
      console.log("ACTION: None; nothing to do");
      break;
    default:
      console.log("INVALID ACTION: " + action );
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

// Callback for each RDS DB listing tags
function tagsForEachDBInstance(db) {
  return function(data) {
    // console.log(db.DBInstanceArn)
    var policyTag = getTagValue(POLICY_TAG_NAME, data.TagList)
    if (policyTag) {
      // console.log("Found lifecycle policy tag: " + policyTag);
      db.Tags = data.TagList;
      // console.log(JSON.stringify(db, null, 4));
      var response = checkPolicy(db);
      takeActionRds(rdsClient, sesClient, db, response);
    }

  }
}

exports.myhandler = (event, context) => {

  console.log("aws-sdk version: " + aws.VERSION);
  console.log("aws-manage-lifecycles version: " + CODE_VERSION);
  console.log ("EMAIL_FROM_ADDRESS : " + process.env.EMAIL_FROM_ADDRESS);
  console.log ("MOMENT_TIMEZONE : " + process.env.MOMENT_TIMEZONE);
  console.log ("EC2_DRY_RUN : " + process.env.EC2_DRY_RUN);
  console.log ("SNAPSHOT_ON_RDS_STOP : " + process.env.SNAPSHOT_ON_RDS_STOP);

  rdsClient.describeDBInstances({}, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else {
      for (var i = 0; i < data.DBInstances.length; i++) {
        var db = data.DBInstances[i]
        var p1 = rdsClient.listTagsForResource({ ResourceName: db.DBInstanceArn}).promise();
        p1.then(
          tagsForEachDBInstance(db)
        ).catch(function(err) {
          console.log(err, err.stack); // an error occurred
        });
      }
    }
  });

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
            takeActionEc2(ec2Client, sesClient, target, response);
        }
      }
     }
  });
};
