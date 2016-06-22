'use strict';

// Runs the Lambda function handler on localhost, not in Lamnda

const lambda = require('./lambda');

const callback = function(error, message) {
  console.log("Error: " + error);
  console.log('---------------------------------------------------')
  console.log("Message: " + message);
  console.log('---------------------------------------------------')
}

lambda.myhandler(null, null, callback);
