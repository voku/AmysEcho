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
  profileId: "amy-2024-12-22",      // IMMUTABLE - stable identifier
  displayName: "Amy Marie"           // MUTABLE - user-friendly name
}
```

#### 1. Profile ID (`profileId`)
- **Immutable**: Set once at profile creation, never changes
- **Internal Use**: All data storage uses this ID
- **Format**: `[a-z0-9-]+` (lowercase alphanumeric + hyphens)
- **Examples**: `"amy"`, `"max-1"`, `"emma-2024"`
- **Purpose**: Stable reference for all backend data

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
  profileId: "amy",           // Used in all API calls
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
      "profileId": "amy",
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
Generate stable ID: "amy-marie"
  ↓
Store both:
  - profileId: "amy-marie" (backend key)
  - displayName: "Amy Marie" (UI label)
```

### Training Bundle Upload
```
Webapp prepares bundle
  ↓
metadata.json includes: { profileId: "amy-marie", ... }
  ↓
Server stores under: data/uploads/amy-marie/{bundleId}/
  ↓
Trainer reads profileId from samples
  ↓
Model saved as: data/models/amy-marie/amy_model.npz
```

### Display Name Change
```
User changes "Amy Marie" → "Amy M."
  ↓
Update only displayName in localStorage
  ↓
profileId remains "amy-marie"
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
- Generates profileId from sanitized input
- Sets both profileId and displayName
- Ensures profileId follows naming rules

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
const PROFILE_ID_PATTERN = /^[a-z0-9-]+$/;
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

## Known Limitations & Future Work

### Current Limitations

1. **No Profile Registry Database**
   - Profiles are implicit (created on first use)
   - No centralized profile list
   - No metadata (creation date, child age, etc.)

2. **No Profile Deletion**
   - Cannot delete profile and all associated data
   - Manual cleanup required for server data

3. **No Profile Transfer**
   - Cannot merge two profiles
   - Cannot migrate data between profileIds

4. **No UUID System**
   - ProfileId is user-influenced (based on input)
   - Potential collisions if multiple caregivers create similar names
   - Not globally unique

### Future Enhancements

#### Phase 1: Profile Registry (Recommended)
```typescript
interface ProfileRecord {
  uuid: string;              // UUID v4
  profileId: string;         // Current identifier
  displayName: string;       // User-friendly name
  createdAt: string;         // ISO timestamp
  metadata?: {
    childAge?: number;
    primaryLanguage?: string;
    notes?: string;
  };
}
```

Benefits:
- True stable UUIDs
- Profile metadata storage
- Centralized profile management
- Future-proof for multi-device sync

#### Phase 2: Profile Management API
```
POST   /api/v1/profiles              - Create profile
GET    /api/v1/profiles              - List profiles
GET    /api/v1/profiles/:uuid        - Get profile details
PATCH  /api/v1/profiles/:uuid        - Update displayName/metadata
DELETE /api/v1/profiles/:uuid        - Delete profile + cascade data
```

#### Phase 3: Data Migration Tools
```
POST /api/v1/profiles/:uuid/migrate
  - Merge two profiles
  - Transfer training data
  - Combine models
```

## Testing Strategy

### Unit Tests

**Frontend:**
- `useAppState.test.tsx`: displayName set/get
- `Settings.test.tsx`: profileId readonly, displayName editable
- `Onboarding.test.tsx`: profileId generation from input

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

Roadmap items for profile identity are tracked in [`docs/TODO.md`](./TODO.md) under "Profile Identity & GDPR Follow-ups" to keep a single consolidated list.

## Conclusion

The current profile identity architecture provides **stable, immutable profile identities** that prevent data loss while allowing **flexible display names** for user-friendliness.

**Key Takeaway for Amy:** When caregivers change how they refer to you in the app, your training data, custom signs, and personalized model stay with you. Your identity in the system is permanent and protected. ❤️

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-28  
**Status:** Implemented in PR #841
