# Deployment Guide

This guide explains how to deploy both the mobile app and the backend server.

## Mobile App (EAS Build)
1. Install dependencies:
   ```bash
   npm install
   npm install --prefix app
   ```
2. Configure Expo Application Services:
   - Ensure you are logged in: `npx eas login`
   - Update `app.json` or `app.config.js` with your bundle identifiers and splash assets.
3. Kick off a build:
   ```bash
   npm run build:android   # or: npm run build:ios
   ```
   The command triggers an [EAS build](https://docs.expo.dev/build/introduction/). The terminal prints a URL where you can monitor progress.
4. After completion, download the artifact from the provided link and distribute it to testers or the app stores.

## Backend Server
1. Install dependencies and build:
   ```bash
   npm install --prefix server
   pip install -r server/requirements.txt
   npm run build --prefix server
   ```
2. Download the MediaPipe gesture model so the server can serve it to the app:
   ```bash
   npm run download-gesture-task --prefix server
   ```
3. Set an authentication token and start the server:
   ```bash
   API_TOKEN=<secret> node server/dist/server.js
   ```
4. Reverse proxy or containerize the service as needed for your environment.

## Updating Models and Analytics
- Retrain the offline model with new gesture data:
  ```bash
  node server/dist/tools/retrainOfflineModel.js <path/to/db.json> dist/offlineModel.json dist/metrics.json [seed]
  ```
  This produces a versioned `offlineModel.json` and a `metrics.json` with accuracy statistics.
- Update caregiver analytics stored in the database:
  ```bash
  node server/dist/tools/updateAnalytics.js <path/to/db.json>
  ```

With these steps the app and server are ready for production deployment.
