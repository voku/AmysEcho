# Deployment Guide

This guide explains how to deploy both the webapp and the backend server.

## Webapp
1. Install dependencies:
   ```bash
   npm install --prefix webapp
   ```
2. Build the webapp:
   ```bash
   npm run build --prefix webapp
   ```
3. Deploy the contents of `webapp/dist` to your hosting provider.

## Backend Server
1. Install dependencies and build:
   ```bash
   npm install --prefix server
   pip install -r server/requirements.txt
   npm run build --prefix server
   ```
2. MediaPipe assets are bundled in the webapp; no server-side download step is required.
3. Start the server (set `JWT_SECRET`/`JWT_REFRESH_SECRET` in your environment or `.env` file—startup fails if they are missing):
   ```bash
   node server/dist/server.js
   ```
4. Configure sendmail (default) or SMTP for verification emails (required for registration/login):
   ```bash
   MAIL_TRANSPORT=sendmail
   SENDMAIL_PATH=/usr/sbin/sendmail
   SMTP_FROM=no-reply@example.com
   APP_BASE_URL=https://your-webapp-host
   ```

   For SMTP instead:
   ```bash
   MAIL_TRANSPORT=smtp
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-user
   SMTP_PASS=your-pass
   SMTP_FROM=no-reply@example.com
   APP_BASE_URL=https://your-webapp-host
   ```
5. Create a caregiver account on first boot (if needed):
   ```bash
   curl -X POST http://<server-host>:5000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"your-user","email":"your-user@example.com","password":"your-password"}'
   ```
6. Reverse proxy or containerize the service as needed for your environment.

## Updating Models
- Trigger a new training run when fresh samples are available. Obtain an access token via `/api/v1/auth/login` first and pass it as a Bearer token to `/api/v1/train-model`:
  ```bash
  ACCESS_TOKEN=$(curl -s -X POST http://<server-host>:5000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"your-user","password":"your-password"}' | jq -r '.tokens.accessToken')

  curl -X POST -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    http://<server-host>:5000/api/v1/train-model -d '{"samples": [], "trigger": "bundles"}'
  ```
- Monitor progress via `GET /api/v1/train-status/<jobId>` and redeploy the resulting NPZ files if you are distributing the server statically.

With these steps the webapp and server are ready for production deployment.
