# App/Server Integration Guide

This guide explains how to verify end-to-end communication between the Amy's Echo app and the backend server.

## Prerequisites
- Node.js and npm installed
- Expo development environment
- Valid JWT access token from `/api/v1/auth/login` (see step 1)

## Steps
1. **Start the server**
   ```bash
   npm start --prefix server
   ```
2. **Create a test user and log in**
   ```bash
   curl -X POST http://localhost:5000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"demo","password":"super-secret"}'

   ACCESS_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"demo","password":"super-secret"}' | jq -r '.tokens.accessToken')
   ```
3. **Start the app**
   ```bash
   ./scripts/dev-run.sh
   ```
4. **Send training data**
   In the app open "Teach New Gesture", record a sample, and submit it.
   The server console should log the upload.
5. **Check training status**
   ```bash
   curl -H "Authorization: Bearer ${ACCESS_TOKEN}" http://localhost:5000/train-status
   ```
6. **Download the model**
   After training reaches 100%:
   ```bash
   curl -H "Authorization: Bearer ${ACCESS_TOKEN}" -o dgs_model.npz \
     http://localhost:5000/latest-mlp-model
   ```
7. **Refresh the app**
   Reload the app or trigger a refresh so the new model is used.

Completing these steps confirms that authentication, data flow, and model download work end to end.
