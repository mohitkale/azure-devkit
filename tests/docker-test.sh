#!/bin/sh
set -eu

node -c hooks/session-start.js
node -c hooks/post-tool-use.js
node tests/run.js
