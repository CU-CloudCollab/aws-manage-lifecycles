'use strict';

// Do some testing of the Lambda function code.

const lambda = require('./lambda');

// Test the isWithinTargetPeriod function
//
var testWeekday = [true, false];
var testPolicy = ["cycle-daily", "cycle-weekday"];

var onArray = ["08", "22"];
var offArray = ["17", "04"];

for (var testIndex = 0; testIndex < onArray.length; testIndex++) {
  for (var policy = 0; policy < testPolicy.length; policy++) {

    if (testPolicy[policy] == "cycle-weekday" && onArray[testIndex] > offArray[testIndex]) continue;

    for (var weekday = 0; weekday < testWeekday.length; weekday++) {
      console.log("policy: " + testPolicy[policy] + "\tweekday: " + testWeekday[weekday])
      console.log("policy: " + onArray[testIndex] + "-" + offArray[testIndex]);
      console.log("");
      var index = "hour:   ";
      var row   = "result: ";
      for (var testHour = 0; testHour < 24; testHour++) {
        if (testHour >= 10) index = index + " " + testHour;
        else index = index + "  " + testHour;
        var result = lambda.testIsWithinTargetPeriod(testPolicy[policy], onArray[testIndex], offArray[testIndex], testHour, testWeekday[weekday]);
        row = row + "  " + (result ? "1" : "0");
      }
      console.log(index);
      console.log(row);
      console.log("---------------------------------------------");
      console.log("");
    }
  }
}
