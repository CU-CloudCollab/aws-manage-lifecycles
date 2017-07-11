'use strict';

// Do some testing of the Lambda function code.

const lambda = require('./lambda');

// Test the isWithinTargetPeriod function
//
var testWeekday = [true, false];
var testPolicy = ["cycle-daily", "cycle-weekday", "cycle-weekly"];

var policyOnArray = ["08", "22"];
var policyOffArray = ["17", "04"];
var policyTargetDay = [6, 6];

for (var policy = 0; policy < testPolicy.length; policy++) {
  for (var policyLoop = 0; policyLoop < policyOnArray.length; policyLoop++) {
    console.log("policy: " + testPolicy[policy])
    console.log("policy specifics: " + policyOnArray[policyLoop] + "-" + policyOffArray[policyLoop] + " targetDay: " + policyTargetDay[policyLoop]);
    console.log("");
    var index = "hour:  ";
    for (var testHour = 0; testHour < 24; testHour++) {
      if (testHour >= 10) index = index + " " + testHour;
      else index = index + "  " + testHour;
    }
    console.log(index);
    for (var testDay = 0; testDay < 7; testDay++) {
      var row   = "day " + testDay + ": ";
      var isWeekday = !(testDay == 0 || testDay == 6)
      for (var testHour = 0; testHour < 24; testHour++) {
        var result = lambda.testIsWithinTargetPeriod(testPolicy[policy], policyOnArray[policyLoop], policyOffArray[policyLoop], policyTargetDay[policyLoop], testHour, isWeekday, testDay);
        row = row + "  " + (result ? "1" : "0");
      }
      console.log(row);
    }
    console.log("------------------------------------------------------------------------------------------");
    console.log("");
  }
}
