# Per-Profile Label Training Guide

> Hinweis: Der Dateiname ist historisch (`PER_USER_*`), der Inhalt und die API sind profilbasiert.

> Amy First: Jedes Kind hat seine eigene personalisierte Gebärdensammlung.

## Overview

Amy's Echo supports personalized training for each child (profile). Each label (DGS sign) can be configured independently with:

1. **Server Pre-training (`server_pretrain`)**: Uses curated internet DGS examples from sources like signdict.org
2. **User Training (`user_train`)**: Uses samples recorded by caregivers in the webapp

This enables a jump-start with a baseline model while allowing caregivers to add personalized training data.

## Data Model

### Profile Label Settings

Each profile has per-label settings stored in the database:

```typescript
interface ProfileLabelSetting {
  id: string;           // Unique setting ID
  profileId: string;    // Profile ID
  labelId: string;      // Label ID (e.g., "rot", "blau")
  mode: "server_pretrain" | "user_train";
  enabled: boolean;     // Whether training for this label is enabled
  updatedAt: string;    // Last update timestamp
  lastTrainedAt?: string; // Last successful training timestamp
}
```

### Folder Structure

Training data is organized per profile, per label, and per mode:

```
server/data/
├── users/
│   └── {userId}/
│       ├── labels/
│       │   └── {labelId}/
│       │       ├── server_pretrain/
│       │       │   ├── videos/
│       │       │   └── landmarks/
│       │       └── user_train/
│       │           ├── videos/
│       │           └── landmarks/
│       └── models/
│           └── amy_model.npz
└── models/
    └── global/
        └── amy_model.npz
```

## API Endpoints

### List Labels with Settings

```
GET /api/v1/profiles/:profileId/labels
```

Returns all labels with their settings and readiness status:

```json
{
  "labels": [
    {
      "labelId": "blau",
      "displayName": "Blau",
      "mode": "server_pretrain",
      "enabled": true,
      "serverVideoCount": 5,
      "userSampleCount": 0,
      "landmarkCount": 5,
      "ready": true,
      "reasons": [],
      "lastTrainedAt": "2026-02-05T12:00:00Z"
    }
  ],
  "stats": {
    "totalLabels": 12,
    "enabledLabels": 8,
    "serverPretrainLabels": 5,
    "userTrainLabels": 3,
    "readyLabels": 7
  }
}
```

### Get Label Details

```
GET /api/v1/profiles/:profileId/labels/:labelId
```

Returns detailed settings and readiness for a specific label.

### Update Label Settings

```
PATCH /api/v1/profiles/:profileId/labels/:labelId

{
  "mode": "server_pretrain" | "user_train",
  "enabled": true | false
}
```

Updates the training mode and/or enabled status.

### Initialize Labels

```
POST /api/v1/profiles/:profileId/labels/initialize
```

Initializes default label settings for a new profile (all labels enabled with `user_train` mode by default).

## Training Readiness

A label is **ready for training** when:

### For `server_pretrain` mode:
- At least 3 server videos are available
- Landmarks have been extracted from videos

### For `user_train` mode:
- At least 5 user samples have been recorded
- Landmarks are available for all samples
- The label is enabled

### Readiness Reasons

When a label is not ready, the API returns reasons in German:

- `"Zu wenige Server-Videos (2/3)"` - Not enough server videos
- `"Zu wenige Benutzeraufnahmen (3/5)"` - Not enough user samples
- `"Landmarks fehlen (2/5)"` - Missing landmarks
- `"Label ist deaktiviert"` - Label is disabled

## Training Flow

1. **Caregiver opens label settings** in the webapp
2. **For each label, caregiver can:**
   - Enable/disable training
   - Choose mode (server_pretrain or user_train)
   - View readiness status
3. **Training is triggered** when the profile workflow or system requests it
4. **Training orchestrator:**
   - Gathers data only from enabled labels
   - Uses the correct data source based on mode
   - Updates `lastTrainedAt` for trained labels
5. **Model is saved** to user-specific directory

## Auto-Download for `server_pretrain`

When a label is switched to **Auto-train (`server_pretrain`)** and enabled, the server now
automatically:

1. **Downloads missing DGS videos** for that label from signdict.org, additional
   configured sources, and finally the DW-DGS lexicon fallback
2. **Extracts landmarks** with MediaPipe (hand + pose + face)
3. **Syncs landmarks into the profile’s `server_pretrain` directory**
4. **Queues a training job** so the profile model learns from the new examples

This keeps the workflow child-focused: Amy’s profile gains new signs as soon as caregivers
enable Auto mode, without manual script runs.

### Requirements for Auto-Download

- `server/data/models/` must contain the MediaPipe task files (hand, pose, face).
- The server must have Python dependencies installed (see `scripts/README_PRETRAINING.md`).
- The label ID should be a safe identifier (`[a-zA-Z0-9_-]+`); the server will still
  normalize and search with display names if available.
- Optional: add extra label-specific video sources in
  `server/data/config/dgsVideoSources.json` (or override with
  `AMY_DGS_SOURCES_PATH`) to cover labels not available in SignDict.

### Auto-Download Responses

The label update endpoint now returns an optional `autoPretrainJob` payload so the UI
can surface progress if desired:

```json
{
  "labelId": "rot",
  "mode": "server_pretrain",
  "enabled": true,
  "autoPretrainJob": {
    "jobId": "auto_pretrain_...",
    "status": "queued"
  }
}
```

## Acceptance Criteria

✅ A new user can:
1. Open label list
2. Set some labels to Auto-train (server_pretrain)
3. Upload their own training for other labels (user_train)
4. See per label: readiness, source type, counts
5. Trigger training
6. The resulting model is trained on:
   - Internet data for auto-train labels
   - User data for manual labels
   - Nothing else

## Implementation Details

### Files

- `server/src/types.ts` - TypeScript types for label settings
- `server/src/sqliteDb.ts` - SQLite table and CRUD operations
- `server/src/services/profileLabelSettingsService.ts` - Service layer
- `server/src/services/trainingOrchestrator.ts` - Training orchestration
- `server/src/routes/profileLabelRoutes.ts` - API endpoints
- `server/src/constants/modelPaths.ts` - Path utilities

### Tests

- `server/test/profileLabelSettings.test.ts` - Unit tests for SQLite operations
- `server/test/profileLabelRoutes.test.ts` - API integration tests


## Verbesserter Workflow für personalisierte Kind-Modelle

Die `/train-model` Pipeline nutzt jetzt einen mehrstufigen Trainingslauf auch für personalisierte Modelle:

- Standard-Trainingsplan: `20,40,80` Epochen (über `AMY_PROFILE_TRAINING_EPOCH_SCHEDULE` anpassbar)
- Nutzbarkeitsschwelle: `0.35` (über `AMY_PROFILE_TRAINING_USABLE_ACCURACY` anpassbar)
- Wenn genau ein Profil trainiert wird, wird die Attempt-Auswahl über **Profil-Accuracy**
  (nicht nur globale Accuracy) gesteuert.
- Das beste Attempt-Ergebnis wird als Job-Metrik (`bestAttempt`, `trainingSchedule`,
  `targetProfileId`) in `/api/v1/train-status/:id` sichtbar.

Damit fließen die Erkenntnisse aus den realen Trainingsläufen direkt in das tägliche Training
für individuelle Kind-Modelle ein, nicht nur in die globale Baseline.
