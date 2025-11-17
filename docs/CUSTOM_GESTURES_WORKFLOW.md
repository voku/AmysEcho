# Custom Gesture Workflow - Amy's Echo

## Overview

Custom gestures in Amy's Echo allow caregivers to teach the app new signs specific to their child. However, it's important to understand that **custom gestures are not immediately usable for recognition** after registration. They require training data and model updates.

## Complete Workflow

### Phase 1: Registration
**What happens:** The gesture metadata (name, label, emoji) is saved
**Where:** 
- App: Local AsyncStorage (per profile)
- Server: `custom_gestures.json` file (per profile)

**Result:** The gesture appears in the app's gesture model but **cannot be recognized yet**.

### Phase 2: Training
**What happens:** The caregiver records 5+ video samples of the gesture
**Where:** 
- App: Training samples saved to local storage
- Samples include: landmarks, handedness, video clips

**Result:** Training data is ready but **still cannot be recognized**.

### Phase 3: Upload & Model Update
**What happens:** Training samples are uploaded to the server and the MLP model is retrained
**Where:**
- Server: Training data ingested into training manifest
- Server: MLP model retrained with new gesture
- Server: Updated model weights saved

**Result:** After this phase, the gesture **can finally be recognized**.

### Phase 4: Model Download
**What happens:** App downloads the updated model
**Where:** App's local model cache

**Result:** Custom gesture is now fully functional and can be recognized in real-time!

## Per-Profile Isolation

Custom gestures are **profile-specific** (per kid):
- Each child has their own set of custom gestures
- Gestures from one profile don't appear in another profile's vocabulary
- Training data and recognition models respect profile boundaries

## Technical Details

### App Storage
```typescript
// Custom gestures stored in AsyncStorage
{
  id: "mein_custom_gesture",
  label: "Mein Custom Gesture",
  profileId: "child-abc-123", // Associates gesture with specific kid
  emoji: "🤚"
}
```

### Server Storage
```json
// server/data/datasets/custom_gestures.json
{
  "gestures": [
    {
      "id": "mein_custom_gesture",
      "label": "Mein Custom Gesture",
      "profileId": "child-abc-123",
      "emoji": "🤚",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### ID Normalization
Gesture IDs are automatically normalized to be server-compatible:
- German characters converted to ASCII: `Ärger zeigen` → `aerger_zeigen`
- Spaces become underscores: `Fuß wackeln` → `fuss_wackeln`
- Only lowercase letters, numbers, underscores, and hyphens allowed

## Current Limitations

1. **Not Instant**: Custom gestures require the full workflow (registration → training → upload → model update → download) before they work
2. **Requires Network**: Model updates require server connection
3. **Manual Process**: Each step must be completed by the caregiver
4. **No Status Indicators**: The UI doesn't currently show which phase a custom gesture is in

## Future Improvements

- [ ] Add visual status indicators (registered, training, ready)
- [ ] Auto-trigger model training after custom gesture registration
- [ ] Show pending gestures that need more training samples
- [ ] Add gesture "readiness" percentage
- [ ] Background model updates
- [ ] Offline queueing for uploads

## API Endpoints

### List Custom Gestures
```
GET /api/v1/dgs/gestures?profileId=child-abc-123
Authorization: Bearer <token>
```

### Register Custom Gesture
```
POST /api/v1/dgs/gestures
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "mein_gesture",
  "label": "Mein Gesture",
  "profileId": "child-abc-123",
  "emoji": "🤚"
}
```

## For Developers

### Testing Custom Gestures
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

Custom gestures must:
- ✅ Be profile-specific (each kid has their own)
- ✅ Have clear workflow for caregivers
- ✅ Provide feedback at each stage
- ✅ Never interrupt Amy's existing communication
- ✅ Be accessible and simple to use

## Related Documentation

- [Training Bundle Workflow](./training-bundle-flow.md)
- [Video Recording Workflow](./VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [ML/LLM Integration](./ML_LLM_Integration.md)
