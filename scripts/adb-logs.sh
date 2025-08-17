#!/usr/bin/env bash
set -euo pipefail

echo "Filtering logcat for useful tags (Ctrl-C to stop)..."
echo "Tags: ReactNativeJS, VisionCamera, ReactNativeJNI, AndroidRuntime"

adb logcat -v time \
  ReactNativeJS:D VisionCamera:D ReactNativeJNI:D AndroidRuntime:E *:S

