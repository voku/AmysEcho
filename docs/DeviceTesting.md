## Device Testing Guide (Expo Dev Client)

### Prereqs
- Custom Expo dev client installed on device.
- USB debugging authorized (`adb devices` shows your device).

### Start Metro with sensible defaults
```
./scripts/dev-run.sh --clear --host lan
```
- Use `--host tunnel` if LAN discovery fails.

### Start Server (local)
In a new terminal, start the Node server with a dev token and port 5000:
```
./scripts/server-start.sh
```

### Connect App ↔ Server (USB)
If your Android device is USB‑connected, reverse the server port so the app can reach `http://localhost:5000`:
```
./scripts/adb-reverse.sh 5000
```
Alternatively, set an explicit LAN API URL before starting Metro:
```
export EXPO_PUBLIC_API_URL=http://<HOST_LAN_IP>:5000
export EXPO_PUBLIC_API_TOKEN=demo-token
```

### Install/Launch on Android
- In another terminal:
```
cd app
expo run:android
```
- Or Gradle directly:
```
cd app/android
./gradlew :app:installDebug
```

### View device logs
```
./scripts/adb-logs.sh
```
- Look for:
  - `VisionCamera` plugin messages
  - `ReactNativeJS` logs from our pipeline (errors/warnings)

### In‑App Debug Checklist
- Grant camera permission.
- Top-left dot toggles “No hand” ↔ “Hands detected: N”.
- Overlay points/lines track each hand; front camera is mirrored.
- Long‑press status text to open Debug Overlay:
  - FPS > 8, Queue small, Circuit closed, Plugin yes, Latency stable.
- Perform known gesture:
  - Speak + Show (animation) when confident.
  - “Help Me” + correction flow when uncertain.
- Toggle “DGS-Video anzeigen” to verify playback.

### Env Toggles (before starting Metro)
```
export EXPO_PUBLIC_NORMALIZE_LANDMARKS=true
export EXPO_PUBLIC_NORMALIZE_ALIGN_ROTATION=true
export EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION=false   # set true if server available
export EXPO_PUBLIC_REMOTE_TIMEOUT_MS=400
```

### Troubleshooting
- If overlay misaligned: verify device aspect ratio; try switching front/back camera.
- If performance dips: close background apps, keep FPS target ~8–12, and ensure debug overlay is hidden during normal use.
