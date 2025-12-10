# Custom Sign Language Sign Workflow - Amy's Echo

## Overview

Custom signs in Amy's Echo allow caregivers to teach the app new Deutsche Gebärdensprache (DGS) signs specific to their child. However, it's important to understand that **custom signs are not immediately usable for recognition** after registration. They require training data and model updates.

## Complete Workflow

### Phase 1: Registration
**What happens:** The sign metadata (name, label, emoji) is saved
**Where:** 
- App: Local AsyncStorage (per profile)
- Server: `custom_gestures.json` file (per profile)

**Result:** The sign appears in the app's sign language model but **cannot be recognized yet**.

### Phase 2: Training Data Collection
**What happens:** The caregiver records 5+ video samples of the sign language sign
**Where:** 
- App: Training samples saved to local storage
- Samples include: hand landmarks (via MediaPipe), handedness, video clips

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

### App Storage
```typescript
// Custom signs stored in AsyncStorage
{
  id: "mein_custom_gebaerde",
  label: "Mein Custom Gebärde",
  profileId: "child-abc-123", // Associates sign with specific kid
  emoji: "🤚"
}
```

### Server Storage
```json
// server/data/datasets/custom_gestures.json
{
  "gestures": [
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
4. **No Status Indicators**: The UI doesn't currently show which phase a custom sign is in
5. **Quality Validation**: No automated quality checks yet for determining if training data is good enough for the global model

## Future Improvements

- [ ] Add visual status indicators (registered, training, ready)
- [ ] Auto-trigger model training after custom sign registration
- [ ] Show pending signs that need more training samples
- [ ] Add sign "readiness" percentage based on sample count and quality
- [ ] Background model updates
- [ ] Offline queueing for uploads
- [ ] **Training data quality metrics**: Implement validation to determine when user-contributed training data is good enough to be incorporated into the global baseline model for all users

## API Endpoints

### List Custom Sign Language Signs
```
GET /api/v1/dgs/gestures?profileId=child-abc-123
Authorization: Bearer <token>
```

### Register Custom Sign Language Sign
```
POST /api/v1/dgs/gestures
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
# App tests
npm test --prefix app -- customGestureRegistry.test.ts

# Server tests
npm test --prefix server -- customGesturesRoute.test.ts
```

### Adding Support for New Features
1. Update schema in `server/src/routes/customGesturesRoute.ts`
2. Update interface in `app/src/services/customGestureRegistry.ts`
3. Update storage in `app/src/storage.ts`
4. Add tests for both app and server

## Amy First Principles

Custom sign language signs must:
- ✅ Be profile-specific (each kid has their own DGS vocabulary)
- ✅ Have clear workflow for caregivers
- ✅ Provide feedback at each stage
- ✅ Never interrupt Amy's existing communication
- ✅ Be accessible and simple to use
- ✅ Support Deutsche Gebärdensprache (DGS) recognition

## Related Documentation

- [Training Bundle Workflow](./training-bundle-flow.md)
- [Video Recording Workflow](./VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [ML/LLM Integration](./ML_LLM_Integration.md)
- [Sign Language Training Loop](./TODO.md)
