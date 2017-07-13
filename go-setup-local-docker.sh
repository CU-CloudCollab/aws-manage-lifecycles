#!/usr/bin/env bash
#
# Create necessary local Javascript resources. Assumes Node/npm is already installed.

docker pull node:4
docker run -it --rm -v "$PWD":/usr/src/app -w /usr/src/app node:4 npm install aws-sdk
#docker run -it --rm -v "$PWD":/usr/src/app -w /usr/src/app node:4 npm install aws-sdk@2.54.0
docker run -it --rm -v "$PWD":/usr/src/app -w /usr/src/app node:4 npm install moment
docker run -it --rm -v "$PWD":/usr/src/app -w /usr/src/app node:4 npm install moment-timezone