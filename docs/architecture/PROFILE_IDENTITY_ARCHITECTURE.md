# Profile Identity Architecture

## Overview

Amy's Echo uses a **stable profile identity system** to ensure that training data, custom models, and user progress are never lost when users change display names or manage their profiles.

## Core Concept: Immutable Profile ID

### The Problem We Solve

When a child's caregiver updates a profile name (e.g., "Amy" → "Amy-Marie"), the system must preserve:
- All training bundles uploaded under that profile
- Per-profile ML models trained specifically for that child
- Custom sign language labels and recordings
- Progress tracking and usage history
- Queued training data waiting to be synchronized

**Without stable identities, renaming a profile would create a new identity and orphan all previous data.**

## Architecture Design

### Two-Layer Identity System

```typescript
{
  profileId: "11111111-1111-4111-8111-111111111111",      // IMMUTABLE - stable identifier
  displayName: "Amy Marie"           // MUTABLE - user-friendly name
}
```

#### 1. Profile ID (`profileId`)
- **Immutable**: Set once at profile creation, never changes
- **Internal Use**: All data storage uses this ID
- **Format**: UUID v4
- **Examples**: `"11111111-1111-4111-8111-111111111111"`
- **Purpose**: Stable reference for all backend data with global uniqueness

#### 2. Display Name (`displayName`)
- **Mutable**: Can be changed anytime without data loss
- **User-Facing**: Shown in UI, labels, reports
- **Format**: Any UTF-8 string
- **Examples**: `"Amy Marie"`, `"Max 🎨"`, `"Emma (Kita)"`
- **Purpose**: Human-friendly identification

### Storage Mapping

#### Frontend (Webapp)
```
localStorage['webapp:app-state'] = {
  profileId: "11111111-1111-4111-8111-111111111111",           // Used in all API calls
  displayName: "Amy Marie",   // Displayed in UI
  ...
}
```

#### Backend (Server)

**Training Bundles:**
```
data/uploads/{profileId}/{bundleId}/
  bundle.zip
  landmarks.json
  ...
```

**ML Models:**
```
data/models/{profileId}/amy_model.npz
```

**Training Data:**
```json
{
  "samples": [
    {
      "id": "bundle:123:frame:0",
      "profileId": "11111111-1111-4111-8111-111111111111",
      "label": "HALLO",
      ...
    }
  ]
}
```

## Data Flow

### Profile Creation
```
User enters name: "Amy Marie"
  ↓
Generate stable ID: "11111111-1111-4111-8111-111111111111"
  ↓
Store both:
  - profileId: "11111111-1111-4111-8111-111111111111" (backend key)
  - displayName: "Amy Marie" (UI label)
```

### Training Bundle Upload
```
Webapp prepares bundle
  ↓
metadata.json includes: { profileId: "11111111-1111-4111-8111-111111111111", ... }
  ↓
Server stores under: data/uploads/11111111-1111-4111-8111-111111111111/{bundleId}/
  ↓
Trainer reads profileId from samples
  ↓
Model saved as: data/models/11111111-1111-4111-8111-111111111111/amy_model.npz
```

### Display Name Change
```
User changes "Amy Marie" → "Amy M."
  ↓
Update only displayName in localStorage
  ↓
profileId remains "11111111-1111-4111-8111-111111111111"
  ↓
All backend data unchanged
  ↓
Zero data loss ✅
```

## Implementation Details

### Frontend Components

#### useAppState Hook
```typescript
type StoredAppState = {
  profileId: string;        // Immutable identifier
  displayName?: string;     // Optional display name
  // ...
};

function useAppState() {
  // ...
  const setDisplayName = (name: string) => {
    // Updates displayName only, profileId unchanged
  };
}
```

#### Settings Component
- Shows profileId as **read-only** field
- Allows editing displayName freely
- Displays warning about profileId immutability

#### Onboarding
- Generates profileId as UUID v4
- Sets both profileId and displayName
- Ensures profileId follows UUID format

### Backend Services

#### Training Bundle Route
```typescript
// Extracts profileId from metadata
const profileId = parsedMetadata.profileId;

// Uses profileId for storage path
const bundleRoot = path.join(
  TRAINING_UPLOADS_DIR, 
  profileId ?? 'unassigned', 
  bundleId
);
```

#### MLP Trainer (Python)
```python
# Reads profileId from samples
profile_id = sample.get("profileId")

# Trains per-profile model
model_path = MODELS_DIR / profile_id / "amy_model.npz"
```

## Safeguards

### 1. Immutability Enforcement

**UI Level:**
- Profile ID field is disabled in Settings
- Clear warning messages
- No "rename profile" button

**Data Level:**
- ProfileId never updated after creation
- No server endpoints to modify profileId
- localStorage protects profileId field

### 2. Migration Safety

**Existing Profiles:**
- Profiles without displayName use profileId as display
- Backward compatible with existing data
- Graceful degradation

### 3. Data Validation

**Frontend:**
```typescript
const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!PROFILE_ID_PATTERN.test(profileId)) {
  throw new Error('Invalid profileId format');
}
```

**Backend:**
```typescript
export const PROFILE_ID_PATTERN = /^[a-z0-9-]+$/;
if (profileId && !PROFILE_ID_PATTERN.test(profileId)) {
  return res.status(400).json({ 
    error: 'metadata.profileId is invalid' 
  });
}
```

## Current Capabilities

### Implemented Profile Management

1. **Profile Registry Database**
   - Stored under `server/data/profiles/profile_registry.json`
   - UUID-based primary keys
   - Metadata stored alongside each profile (age, creation date, notes)

2. **Profile Deletion**
   - Cascade cleanup across training bundles, manifests, models, and analytics

3. **Profile Transfer & Merge**
   - Merge or transfer data between profiles via `/api/v1/profiles/:id/merge`

4. **UUID Identity System**
   - UUIDs are now canonical profile IDs and used for all storage paths

### Profile Management API
```
POST   /api/v1/profiles              - Create profile
GET    /api/v1/profiles              - List profiles
GET    /api/v1/profiles/:uuid        - Get profile details
PATCH  /api/v1/profiles/:uuid        - Update displayName/metadata
DELETE /api/v1/profiles/:uuid        - Delete profile + cascade data
POST   /api/v1/profiles/:uuid/merge  - Merge/transfer profile data
POST   /api/v1/profiles/:uuid/share  - Create caregiver share token
POST   /api/v1/profiles/sync         - Sync via one-time token
```

## Testing Strategy

### Unit Tests

**Frontend:**
- `useAppState.test.tsx`: displayName set/get
- `Settings.test.tsx`: profileId readonly, displayName editable
- `Onboarding.test.tsx`: profileId generation via UUID

**Backend:**
- Profile ID validation in bundle upload
- Path construction with profileId
- Sample filtering by profileId

### Integration Tests

**End-to-End:**
1. Create profile with name "Amy Marie"
2. Upload training bundle
3. Verify bundle stored under correct profileId
4. Change displayName to "Amy M."
5. Upload another bundle
6. Verify both bundles under same profileId
7. Train model
8. Verify model path uses original profileId
9. Download model with profileId
10. Verify model loads correctly

**Data Loss Prevention:**
- Simulate profile rename (should fail)
- Attempt profileId change in localStorage (should warn)
- Verify training data not orphaned

## Best Practices for Caregivers

### Do's ✅
- Change display name freely in Settings
- Use descriptive display names ("Amy - Kita", "Max (Home)")
- Export data regularly for backup

### Don'ts ❌
- Don't manually edit profileId in browser storage
- Don't create multiple profiles for same child
- Don't expect to rename the profile ID

### Troubleshooting

**Problem: "I changed the profile name and lost all training data"**
- Root Cause: User edited profileId directly
- Solution: Restore original profileId from backup/export
- Prevention: UI prevents profileId editing

**Problem: "Different devices have different profileIds"**
- Root Cause: No cloud sync, profiles created separately
- Solution: Use same profileId on all devices (copy from Settings)
- Future: Implement profile sync service

## GDPR & Privacy Compliance

### Data Subject Rights

**Right to Access:**
- Export includes profileId and displayName
- All training data includes profileId reference

**Right to Deletion:**
- Requires cascade deletion:
  - `data/uploads/{profileId}/` directory
  - `data/models/{profileId}/` directory
  - Samples in `dgs_samples.json` with matching profileId
  - Queued bundles in IndexedDB

**Right to Rectification:**
- displayName can be corrected anytime
- profileId rectification requires data migration

## Technical Debt

Roadmap items for profile identity are tracked in [`docs/planning/TODO.md`](../planning/TODO.md) under "Profile Identity & GDPR Follow-ups" to keep a single consolidated list.

## Conclusion

The current profile identity architecture provides **stable, immutable profile identities** that prevent data loss while allowing **flexible display names** for user-friendliness.

**Key Takeaway for Amy:** When caregivers change how they refer to you in the app, your training data, custom signs, and personalized model stay with you. Your identity in the system is permanent and protected. ❤️

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-28  
**Status:** Implemented in PR #841
