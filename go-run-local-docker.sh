#!/usr/bin/env bash
#
# Execute the function locally, using Node.js in a Docker container.

# setup environment
source ./constants.sh

# Invoke the function locally in a container
docker run -it --rm -e EMAIL_FROM_ADDRESS -e MOMENT_TIMEZONE -e EC2_DRY_RUN -v ~/.aws:/root/.aws -v "$PWD":/usr/src/app -w /usr/src/app node:4 node run-local.js
