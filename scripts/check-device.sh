#!/bin/bash
set -e

# Run expo doctor to check for any issues with the development environment
npm run --prefix app expo doctor
