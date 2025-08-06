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

## Models fail to download
- Run the model download script again:
  ```bash
  npm run build --prefix server
  node server/dist/tools/downloadModels.js
  ```
- Confirm that the device has enough storage space.

## Camera or microphone not working
- Verify that permissions are granted in the device settings.
- Close other apps that might be using the camera or microphone.

## Gesture not recognized
- Make sure there is adequate lighting and the hand is fully within the camera frame.
- Re-run the gesture teaching flow from the **Admin Panel** to add more samples.

If problems persist, please open an issue in the repository with logs or screenshots so the team can assist.

