#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5000}"
echo "Reversing TCP port $PORT to device via adb..."
adb reverse tcp:$PORT tcp:$PORT || true
adb reverse --list || true

echo "If reverse fails, set EXPO_PUBLIC_API_URL to http://<HOST_LAN_IP>:$PORT before starting Metro."

