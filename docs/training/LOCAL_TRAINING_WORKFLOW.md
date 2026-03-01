# Lokaler Trainings-Workflow

Dieses Dokument beschreibt den Prozess zum Testen und Ausführen des Gebärden-Trainings auf einem lokalen Server.

## 1. Server-Vorbereitung

### Umgebungsvariablen
Der Server benötigt folgende Umgebungsvariablen für das Training:

```bash
export JWT_SECRET=test-secret
export JWT_REFRESH_SECRET=test-refresh-secret
export PORT=5000
export NODE_ENV=development
export MLP_DATA_DIR=data
export MLP_MANIFEST_PATH=data/datasets/training_manifest.json
export MLP_MODELS_DIR=data/models
```

### Manifest-Datei
Die Manifest-Datei muss im Format `{"entries": []}` initialisiert sein:
`server/data/datasets/training_manifest.json`

## 2. Authentifizierung

Für lokale Tests kann ein Token mit `npm run generate-token --prefix server` (oder direkt `server/scripts/generate-token.js`) erstellt werden:

```javascript
import jwt from 'jsonwebtoken';
const JWT_SECRET = 'test-secret';
const user = { userId: 'test-user-123', username: 'testuser', role: 'user' };
const token = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' });
console.log('Bearer', token);
```

## 3. Trainings-Paket (Bundle) Struktur

Die ZIP-Struktur und das vollständige Upload-Flow-Diagramm sind in
[`docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`](./VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
zusammengeführt. Für lokale Tests genügt es, dass `metadata.json` und
`landmarks.json` enthalten sind (ggf. zusätzlich `still.jpg` und `clip.*`).

## 4. API Endpunkte

### Upload eines Bundles
`POST /api/v1/dgs/sample-bundles`
- Header: `Content-Type: application/zip`, `Authorization: Bearer <token>`
- Body: Binäre ZIP-Daten

### Training manuell triggern
`POST /train-model`
- Header: `Content-Type: application/json`, `Authorization: Bearer <token>`
- Body: `{"trigger": "bundles"}`

### Status abfragen
`GET /api/v1/train-status/:jobId`
- Header: `Authorization: Bearer <token>`

## 5. Interner Prozess

Siehe den Abschnitt "Model Training" in
[`docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`](./VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
für den vollständigen Serverablauf vom Bundle bis zum Modell.
