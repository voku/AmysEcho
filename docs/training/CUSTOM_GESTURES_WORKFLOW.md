# Custom Sign Language Sign Workflow - Amy's Echo

## Overview

Custom signs in Amy's Echo allow caregivers to teach the app new Deutsche Gebärdensprache (DGS) signs specific to their child. However, it's important to understand that **custom signs are not immediately usable for recognition** after registration. They require training data and model updates.

## Complete Workflow

### Phase 1: Registration
**What happens:** The sign metadata (name, label, emoji) is saved
**Where:** 
- Webapp: `localStorage` (per profile) via `webapp/src/services/customGestureRegistry.ts`
- Server: `custom_signs.json` file (per profile)

**Result:** The sign appears in the app's sign language model but **cannot be recognized yet**.

### Phase 2: Training Data Collection
**What happens:** The caregiver records multiple video samples of the sign language sign
**Where:** 
- Webapp: Training samples queued via IndexedDB/OPFS
- Samples include: hand/pose/face landmarks, handedness, still frame, and video clips

**Result:** Training data is ready but **still cannot be recognized**.

### Phase 3: Upload & Model Training
**What happens:** Training samples are uploaded to the server and the MLP model is retrained for sign language recognition
**Where:**
- Server: Training data ingested into training manifest
- Server: MLP model retrained with new DGS sign
- Server: Updated model weights saved (both global and per-profile)

**Result:** After this phase, the sign **can finally be recognized**.

### Phase 4: Model Download & Activation
**What happens:** App downloads the updated sign language recognition model
**Where:** App's local model cache

**Result:** Custom sign is now fully functional and can be recognized in real-time!

## Per-Profile Isolation

Custom signs are **profile-specific** (per kid):
- Each child has their own set of custom DGS signs
- Signs from one profile don't appear in another profile's vocabulary
- Training data and recognition models respect profile boundaries

## Technical Details

### Webapp Storage
```typescript
// Custom signs stored in localStorage
{
  id: "mein_custom_gebaerde",
  label: "Mein Custom Gebärde",
  profileId: "child-abc-123", // Associates sign with specific kid
  emoji: "🤚"
}
```

### Server Storage
```json
// server/data/datasets/custom_signs.json
{
  "signs": [
    {
      "id": "mein_custom_gebaerde",
      "label": "Mein Custom Gebärde",
      "profileId": "child-abc-123",
      "emoji": "🤚",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### ID Normalization
Sign IDs are automatically normalized to be server-compatible:
- German characters converted to ASCII: `Ärger zeigen` → `aerger_zeigen`
- Spaces become underscores: `Fuß wackeln` → `fuss_wackeln`
- Only lowercase letters, numbers, underscores, and hyphens allowed

## Current Limitations

1. **Not Instant**: Custom signs require the full workflow (registration → training → upload → model training → download) before they work
2. **Requires Network**: Model updates require server connection for training and distribution
3. **Manual Process**: Each step must be completed by the caregiver
4. **Limited Status UI**: Status is tracked in storage, but the UI does not yet surface each phase clearly
5. **Quality Validation**: Training bundles pass through the ingestion quality gate before frames are promoted into `data/dgs_samples.json`. The gate enforces minimum frame counts, hand coverage, and jitter thresholds (see `server/src/constants/trainingQuality.ts`) so only stable samples contribute to the global model.

## Future Improvements
Tracked in [`docs/planning/TODO.md`](../planning/TODO.md) under "Custom Sign Workflow Enhancements".

## API Endpoints

### List Custom Sign Language Signs
```
GET /api/v1/dgs/signs?profileId=child-abc-123
Authorization: Bearer <token>
```

### Register Custom Sign Language Sign
```
POST /api/v1/dgs/signs
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "mein_gebaerde",
  "label": "Mein Gebärde",
  "profileId": "child-abc-123",
  "emoji": "🤚"
}
```

## For Developers

### Testing Custom Sign Language Signs
```bash
# Server tests
npm test --prefix server -- customSignsRoute.test.ts
```

### Adding Support for New Features
1. Update schema in `server/src/routes/customSignsRoute.ts`
2. Update interface in `webapp/src/services/customGestureRegistry.ts`
3. Update storage in `webapp/src/model.ts` and `webapp/src/services/customGestureRegistry.ts`
4. Add tests for both webapp and server

## Amy First Principles

Custom sign language signs must:
- ✅ Be profile-specific (each kid has their own DGS vocabulary)
- ✅ Have clear workflow for caregivers
- ✅ Provide feedback at each stage
- ✅ Never interrupt Amy's existing communication
- ✅ Be accessible and simple to use
- ✅ Support Deutsche Gebärdensprache (DGS) recognition

## Related Documentation

- [Video Recording Workflow](../training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [ML/LLM Integration](../research/ML_LLM_Integration.md)
- [Sign Language Training Loop](../planning/TODO.md)
