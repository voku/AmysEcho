# App/Server Integration Guide

This guide explains how to verify end-to-end communication between the Amy's Echo app and the backend server.

## Prerequisites
- Node.js and npm installed
- Expo development environment
- Authentication token for the server (use `demo-token` for local testing)

## Steps
1. **Start the server**
   ```bash
   API_TOKEN=demo-token npm start --prefix server
   ```
2. **Start the app**
   ```bash
   ./scripts/dev-run.sh
   ```
3. **Send training data**  
   In the app open "Teach New Gesture", record a sample, and submit it.  
   The server console should log the upload.
4. **Check training status**
   ```bash
   curl -H "Authorization: Bearer demo-token" http://localhost:5000/train-status
   ```
5. **Download the model**
   After training reaches 100%:
   ```bash
   curl -H "Authorization: Bearer demo-token" -o dgs_model.npz \
     http://localhost:5000/latest-mlp-model
   ```
6. **Refresh the app**  
   Reload the app or trigger a refresh so the new model is used.

Completing these steps confirms that authentication, data flow, and model download work end to end.
