# MediaPipe Vision Bundle Source

The WebView build checks in a local copy of the MediaPipe Tasks vision bundle because Expo cannot fetch external scripts while offline. To stay aligned with the Definition of Done, we record the bundle’s origin, version, and checksum here.

- **Source:** `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js`
- **Last synchronized:** 16 October 2025
- **SHA-256:** `941bdfe7c2c10e113cfebca7825fcfa0de2f0c54e42f6e5d8cc5294e9028a277`
- **Checksum file:** `webapp/src/gesture/vision_bundle.sha256`

> The `scripts/update-vision-bundle-doc.js` helper refreshes the date based on the bundle’s modification time (or an optional `--date` override) so reviewers can trust this metadata.

## Updating the bundle

1. Download the new bundle (only update the version after the gesture team signs off):
   ```bash
   curl -L "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<version>/vision_bundle.js" -o webapp/src/gesture/vision_bundle.js
   ```
2. Compute the new checksum and store it in `webapp/src/gesture/vision_bundle.sha256`:
   ```bash
   sha256sum webapp/src/gesture/vision_bundle.js | awk '{print $1}' > webapp/src/gesture/vision_bundle.sha256
   ```
3. Refresh this document’s metadata with the helper script so the checksum and synchronization date stay consistent:
   ```bash
   node scripts/update-vision-bundle-doc.js --source "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<version>/vision_bundle.js"
   # Optional: override the detected date (UTC) with --date=YYYY-MM-DD
   ```
4. Run the Definition-of-Done quality checks:
   ```bash
   npm run lint --prefix webapp
   npm run type-check --prefix webapp
   npm test --prefix webapp
   ```
5. Run `npm run build --prefix webapp` to ensure the build completes successfully.

## Definition-of-Done checklist for updates

- [ ] Document the new bundle version (source, date, hash) via the update script.
- [ ] Ensure `vision_bundle.sha256` matches the checked-in bundle.
- [ ] Complete all webapp linting, type-checking, and test runs successfully.
- [ ] Have a reviewer verify the checksum against an independent download.
