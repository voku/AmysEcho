# Camera Permission Best Practices

To keep gesture detection secure and transparent in the webapp:

- Serve the webapp over HTTPS so browsers allow camera access.
- Request camera permissions only when the user starts recording or recognition.
- Keep the UI clear about why the camera is needed and how the feed is used.
- Provide an obvious stop/pause control to disable the camera instantly.

These practices reduce the risk of unauthorized camera use while keeping the user in control.

## References

- [MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
