# Gesture Recognition Testing (Webapp)

This guide focuses on validating gesture recognition in the browser-based webapp.
For full end-to-end checks, see `docs/training/video-recording-and-training-workflow.md`
and `docs/testing/device-testing.md`.

## Quick Checks

1. Open the webapp and grant camera permissions.
2. Verify overlay landmarks track hands/pose/face.
3. Perform a known gesture and confirm recognition output.
4. Record a training sample and ensure it queues/uploads.
5. Download the updated model and confirm recognition improves.

## Debugging

- Use browser devtools to inspect console logs and network requests.
- Watch server logs for bundle ingestion and training progress.
