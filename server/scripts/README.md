# Server Utility Scripts

Dieses Verzeichnis bündelt nicht-produktive Wartungs- und Debug-Skripte für den Server,
damit `server/` auf Laufzeitcode (`src/`, `training/`, `test/`) fokussiert bleibt.

## Struktur

- `generate-token.js` / `stress-test.js`: lokale Last- und API-Hilfen.
- `create-real-bundle.js`: Hilfstool für Trainingsbundle-Generierung.
- `create_synthetic_gestures*.py`: Datengeneratoren für synthetische Gesten.
- `create_working_model.py`: Legacy-Helfer zur Modellinitialisierung.
- `debug_mediapipe.py`: lokale MediaPipe-Diagnose.
- `extract_frame_for_inspection.py`: extrahiert Referenzbilder nach `dev-artifacts/`.
- `dev-artifacts/`: lokale Bildartefakte aus Debug-Läufen (nicht versioniert).

## Hinweise

- Diese Skripte sind optional für Entwicklung und Fehlersuche.
- Produktivpfade verwenden weiterhin die Implementierungen unter `server/src/` und `server/training/`.

## Schneller Start

- Token erzeugen: `npm run generate-token --prefix server`
- Lasttest starten: `STRESS_TEST_TOKEN=$(npm run -s generate-token --prefix server) npm run stress-test --prefix server`
