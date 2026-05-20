## Device Testing Guide (Webapp)

This guide covers device validation for the browser-based webapp.
For end-to-end validation, also follow the checklist in
[`docs/testing/real-world-validation-guide.md`](./real-world-validation-guide.md).

### Prereqs
- A device with a modern browser that supports `getUserMedia`.
- Network access to the server when testing uploads/training.

### Start the Webapp (Local)
```bash
npm ci --prefix webapp
npm run dev --prefix webapp
```

### Start the Server (Local)
```bash
npm ci --prefix server
npm start --prefix server
```

### Device Checklist
- Grant camera permissions.
- Verify overlay landmarks track hands/pose/face.
- Record a training sample and ensure it queues/uploads.
- Trigger `/train-model` and download the updated model.
- Confirm recognition uses the personalized model (if available).

### Debugging Tips
- Use browser devtools to inspect console logs and network requests.
- Watch server logs for bundle ingestion and training progress.
