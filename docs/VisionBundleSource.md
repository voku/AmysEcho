# MediaPipe Vision Bundle Source

The WebView build checks in a local copy of the MediaPipe Tasks vision bundle because Expo cannot fetch external scripts while offline. To stay aligned with the Definition of Done, we record the bundle’s origin, version, and checksum here.

- **Source:** `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js`
- **Last synchronized:** 16 October 2025
- **SHA-256:** `941bdfe7c2c10e113cfebca7825fcfa0de2f0c54e42f6e5d8cc5294e9028a277`
- **Checksum file:** `app/webview/vision_bundle.sha256`

## Updating the bundle

1. Download the new bundle (only update the version after the gesture team signs off):
   ```bash
   curl -L "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<version>/vision_bundle.js" -o app/webview/vision_bundle.js
   ```
2. Compute the new checksum and store it in `app/webview/vision_bundle.sha256`:
   ```bash
   sha256sum app/webview/vision_bundle.js | awk '{print $1}' > app/webview/vision_bundle.sha256
   ```
3. Update this document with the version, date, and checksum you used.
4. Run the Definition-of-Done quality checks:
   ```bash
   npm run lint --prefix app
   npm run type-check --prefix app
   npm test --prefix app
   ```
5. Run `npm run build:webview --prefix app` so the gesture detector bundle test stays green.

## Definition-of-Done checklist for updates

- [ ] Document the new bundle version (source, date, hash).
- [ ] Ensure `vision_bundle.sha256` matches the checked-in bundle.
- [ ] Complete all app linting, type-checking, and test runs successfully.
- [ ] Have a reviewer verify the checksum against an independent download.
