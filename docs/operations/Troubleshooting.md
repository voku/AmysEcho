# Troubleshooting Guide

This guide lists common issues encountered when setting up or running **Amy's Echo** and how to resolve them.

## App fails to start
- Ensure all dependencies are installed:
  ```bash
  npm install
  npm install --prefix app
  npm install --prefix server
  ```
- If the metro bundler does not start, run `npm start --prefix app` manually.

## CDN assets blocked
- Ensure the device/network can reach:
  - `https://cdn.jsdelivr.net` (Tasks Vision runtime/WASM)
  - `https://storage.googleapis.com` (gesture_recognizer.task model)

## Camera or microphone not working
- Verify that permissions are granted in the device settings.
- Close other apps that might be using the camera or microphone.

## Gesture not recognized
- Make sure there is adequate lighting and the hand is fully within the camera frame.
- Re-run the gesture teaching flow from the **Admin Panel** to add more samples.

## Gesture runtime diagnostics
- In the web gesture runtime, call `window.__getGestureSystemStatus?.()` in the browser console.
- Check `detectorRuntime.delegates` to confirm whether MediaPipe is running on `GPU` or CPU fallback.
- Check `detectorRuntime.modules` to verify whether gesture, pose, and face modules were initialized.
- If startup fails, inspect `detectorRuntime.lastInitializationError` for the latest initialization error message.

If problems persist, please open an issue in the repository with logs or screenshots so the team can assist.
