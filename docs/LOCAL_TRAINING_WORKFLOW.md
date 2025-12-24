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

Für lokale Tests kann ein Token mit dem `generate-token.js` Skript erstellt werden:

```javascript
import jwt from 'jsonwebtoken';
const JWT_SECRET = 'test-secret';
const user = { userId: 'test-user-123', username: 'testuser', role: 'user' };
const token = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' });
console.log('Bearer', token);
```

## 3. Trainings-Paket (Bundle) Struktur

Ein Trainings-Upload ist ein ZIP-Archiv mit folgender Struktur:

- `metadata.json`: Enthält Label und Profil-Informationen.
- `landmarks.json`: Enthält die extrahierten MediaPipe-Landmarken für alle Modalitäten (Hands, Pose, Face).

### Beispiel metadata.json
```json
{
  "label": "HALLO",
  "profileId": "mein-profil-1",
  "capturedAt": "2025-12-23T17:00:00.000Z"
}
```

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
1. Der Server empfängt das ZIP und validiert die `metadata.json`.
2. Das ZIP wird unter `server/data/uploads/<profile>/<bundleId>/bundle.zip` gespeichert.
3. Ein Eintrag wird in der `training_manifest.json` erstellt.
4. Der Python-Prozess `train_mlp.py` wird gestartet und verarbeitet die Daten aus dem Manifest.
5. Nach Abschluss wird das Modell unter `server/data/models/<profile>/amy_model.npz` bereitgestellt.
