#!/bin/bash
set -e

# Run type check and tests for the React Native app
npm run type-check --prefix app
npm test --prefix app

# Install backend Python deps (if needed) and run server tests
pip install -r server/requirements.txt
npm test --prefix server
