# Webapp/Server Integration Guide

This guide explains how to verify end-to-end communication between the Amy's Echo webapp and the backend server.

## Prerequisites
- Node.js and npm installed
- Webapp development environment
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
     -d '{"username":"demo","email":"demo@example.com","password":"super-secret"}'

   # Check the verification email and confirm it before logging in
   # (POST /api/v1/auth/verify-email/confirm with the code from the email)

   ACCESS_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"demo","password":"super-secret"}' | jq -r '.tokens.accessToken')
   ```
3. **Start the webapp**
   ```bash
   npm run dev --prefix webapp
   ```
4. **Send training data**
   In the webapp open the Training page, record a sample, and submit it.
   The server console should log the upload.
5. **Check training status**
   Capture the `pollUrl` from the upload response (or the matching server log entry) and request that exact job URL:
   ```bash
   curl -H "Authorization: Bearer ${ACCESS_TOKEN}" \
     http://localhost:5000/api/v1/train-status/<jobId>
   ```
6. **Download the model**
   After training reaches 100%:
   ```bash
   curl -H "Authorization: Bearer ${ACCESS_TOKEN}" -o amy_model.npz \
     "http://localhost:5000/api/v1/models/latest?profileId=<profileId>"
   ```
7. **Refresh the webapp**
   Reload the webapp or trigger a refresh so the new model is used.

Completing these steps confirms that authentication, data flow, and model download work end to end.
