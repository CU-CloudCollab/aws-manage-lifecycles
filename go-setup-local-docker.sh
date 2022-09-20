#!/usr/bin/env bash
#
# Create necessary local Javascript resources. Assumes Node/npm is already installed.

docker pull node:16
docker run -it --rm -v "$PWD":/usr/src/app -w /usr/src/app node:16 npm install aws-sdk moment moment-timezone
