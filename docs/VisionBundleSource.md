# MediaPipe Vision Bundle Source

Der WebView-Build verwendet eine lokal eingecheckte Kopie des MediaPipe Tasks Vision Bundles, weil Expo im Offline-Modus keine externen Skripte nachladen darf. Damit die Definition of Done eingehalten wird, dokumentieren wir die Quelle, den Versionsstand und die Prüfsumme des Bundles.

- **Quelle:** `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js`
- **Zuletzt synchronisiert:** 16. Oktober 2025
- **SHA-256:** `941bdfe7c2c10e113cfebca7825fcfa0de2f0c54e42f6e5d8cc5294e9028a277`
- **Checksum-Datei:** `app/webview/vision_bundle.sha256`

## Aktualisieren des Bundles

1. Lade das neue Bundle herunter (Version nur nach Freigabe durch das Gesten-Team anpassen):
   ```bash
   curl -L "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<version>/vision_bundle.js" -o app/webview/vision_bundle.js
   ```
2. Berechne die neue Prüfsumme und schreibe sie in `app/webview/vision_bundle.sha256`:
   ```bash
   sha256sum app/webview/vision_bundle.js | awk '{print $1}' > app/webview/vision_bundle.sha256
   ```
3. Aktualisiere dieses Dokument mit der verwendeten Version, dem Datum und der neuen Prüfsumme.
4. Führe die Qualitätschecks gemäß Definition of Done aus:
   ```bash
   npm run lint --prefix app
   npm run type-check --prefix app
   npm test --prefix app
   ```
5. Führe `npm run build:webview --prefix app` aus, damit der Gesture-Detector-Bundle-Test grün bleibt.

## Definition-of-Done-Prüfliste für Aktualisierungen

- [ ] Neue Bundle-Version ist dokumentiert (Quelle, Datum, Hash).
- [ ] `vision_bundle.sha256` entspricht der aktuellen Datei.
- [ ] Alle App-Lints, Typprüfungen und Tests sind ausgeführt und erfolgreich.
- [ ] Reviewer haben den Hash mit einer unabhängigen Quelle verifiziert.
