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
2. MediaPipe runtime and model are loaded by the mobile app from public CDNs; no server download step is required.
3. Start the server (set `JWT_SECRET`/`JWT_REFRESH_SECRET` in your environment or `.env` file—startup fails if they are missing):
   ```bash
   node server/dist/server.js
   ```
4. Create a caregiver account on first boot (if needed):
   ```bash
   curl -X POST http://<server-host>:5000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"your-user","password":"your-password"}'
   ```
5. Reverse proxy or containerize the service as needed for your environment.

## Updating Models
- Trigger a new training run when fresh samples are available. Obtain an access token via `/api/v1/auth/login` first and pass it as a Bearer token to `/train-model`:
  ```bash
  ACCESS_TOKEN=$(curl -s -X POST http://<server-host>:5000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"your-user","password":"your-password"}' | jq -r '.tokens.accessToken')

  curl -X POST -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    http://<server-host>:5000/train-model -d '{"samples": [], "trigger": "manual"}'
  ```
- Monitor progress via `GET /train-status/<jobId>` and redeploy the resulting NPZ files if you are distributing the server statically.

With these steps the app and server are ready for production deployment.
