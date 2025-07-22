#!/bin/bash
set -e

# Ensure Node dependencies are installed
# Clear npm proxy settings to avoid warnings in CI
unset npm_config_http_proxy
unset npm_config_https_proxy
npm install --prefix app
npm install --prefix server

# Run type check and tests for the React Native app
npm run type-check --prefix app
npm test --prefix app

# Install backend Python deps (if needed) and run server tests
pip install --root-user-action=ignore -r server/requirements.txt
npm test --prefix server
