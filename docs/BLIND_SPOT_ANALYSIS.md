# Blind Spot Analysis: app/* to webapp/* Migration

This document identifies potential gaps and areas that may need attention after the migration from the React Native/Expo `app/` to the browser-based `webapp/`.

## Summary

After thorough analysis, I've identified the following categories:
1. **Critical Gaps** - Should be addressed before production
2. **Non-Critical Gaps** - Can be addressed later or adapted for browser
3. **Intentionally Different** - Platform-specific, correct as-is

---

## 1. Critical Gaps 🔴

### 1.1 Missing Services (40+ services in app, few in webapp)

The app has a comprehensive service layer that the webapp largely lacks:

| Service | App | Webapp | Priority |
|---------|-----|--------|----------|
| `accessibilityService.ts` | ✅ | ❌ | High |
| `audioService.ts` | ✅ | ❌ | High |
| `feedbackService.ts` | ✅ | ❌ | High |
| `correctionService.ts` | ✅ | ❌ | High |
| `gestureHistoryService.ts` | ✅ | ❌ | High |
| `gestureMeaningService.ts` | ✅ | ❌ | Medium |
| `backupService.ts` | ✅ | ❌ | Medium |
| `gdprService.ts` | ✅ | ❌ | High (legal) |
| `dataProtection.ts` | ✅ | ❌ | High (legal) |
| `crashReporting.ts` | ✅ | ❌ | Medium |
| `analytics.ts` | ✅ | ❌ | Medium |
| `performanceMonitor.ts` | ✅ | ❌ | Low |

**Recommendation**: Create a `webapp/src/services/` directory and port essential services.

### 1.2 Missing Context Providers

The app uses React Context extensively for state management:

| Context | App | Webapp | Impact |
|---------|-----|--------|--------|
| `ThemeContext.tsx` | ✅ | ❌ | Dark/light mode |
| `MessageContext.tsx` | ✅ | ❌ | User messaging |
| `MoodContext.tsx` | ✅ | ❌ | Mood tracking |
| `PerformanceContext.tsx` | ✅ | ❌ | Performance metrics |
| `LocationContext.tsx` | ✅ | ❌ | Location-based features |
| `ServicesContext.tsx` | ✅ | ❌ | Dependency injection |
| `AppServicesProvider.tsx` | ✅ | ❌ | Service initialization |
| `AccessibilityContext.tsx` | ✅ | ❌ | Accessibility state |

**Recommendation**: Create core context providers for theme, messaging, and services.

### 1.3 Missing UI Components (35 components in app, not in webapp)

| Component | Purpose | Priority |
|-----------|---------|----------|
| `SymbolButton.tsx` | AAC symbol selection | High |
| `ActionButton.tsx` | Consistent button styling | Medium |
| `LoadingIndicator.tsx` | Loading states | High |
| `ErrorMessage.tsx` | Error display | High |
| `OfflineBanner.tsx` | Offline detection | High |
| `Celebration.tsx` | Success feedback | High |
| `VisualFeedback.tsx` | Visual recognition feedback | High |
| `DgsVideoPlayer.tsx` | DGS video playback | Medium |
| `GestureMeaningDisplay.tsx` | Gesture meaning UI | Medium |
| `SoundSelector.tsx` | Sound preferences | Medium |
| `ThemeSelector.tsx` | Theme preferences | Medium |
| `FeedbackBanner.tsx` | In-app messaging | Medium |

### 1.4 Missing Database Layer

The app uses WatermelonDB with structured models:

| Model | Purpose | Webapp Alternative |
|-------|---------|-------------------|
| `Profile` | User profiles | localStorage (limited) |
| `Symbol` | AAC symbols | Not migrated |
| `VocabularySet` | Word sets | Not migrated |
| `UsageStat` | Usage statistics | Not migrated |
| `GestureDefinition` | Gesture definitions | Not migrated |
| `GestureTrainingData` | Training samples | localStorage |
| `InteractionLog` | Interaction history | Not migrated |
| `LearningAnalytic` | Learning data | Not migrated |
| `Correction` | Correction history | Not migrated |

**Recommendation**: Consider IndexedDB for structured data or a lightweight client-side DB.

---

## 2. Non-Critical Gaps 🟡

### 2.1 Video Assets

The app has gesture tutorial videos:
- `alle.mp4`, `blau.mp4`, `essen.mp4`, `fertig.mp4`, etc.

**Status**: Videos can be served from a CDN or the server.

### 2.2 Sound Assets

The app has customizable success sounds.

**Status**: Can be added as needed; Web Audio API is available.

### 2.3 Type Definitions

The app has additional type files:
- `audio.ts` - Audio type definitions
- `frames.ts` - Frame type definitions  
- `ml.ts` - ML type definitions

**Status**: Can be added to `webapp/src/types/` as needed.

### 2.4 Telemetry

The app has a telemetry recorder (`telemetry/recorder.ts`).

**Status**: Can be implemented using browser analytics.

---

## 3. Intentionally Different 🟢

These items are correctly adapted for the browser platform:

| App Feature | Webapp Adaptation | Reason |
|-------------|-------------------|--------|
| `SecureStore` | `localStorage` | Browser security model |
| `Expo Camera` | `MediaDevices API` | Browser camera access |
| `React Navigation` | `React Router` | Web routing |
| `Native Haptics` | `Vibration API` | Browser haptics |
| `SQLite/WatermelonDB` | `localStorage/IndexedDB` | Client-side storage |
| `Expo FileSystem` | `Blob/Download API` | File handling |

---

## 4. Action Items

### Immediate Priority (Before Production)

1. **Create services directory** with:
   - [ ] `accessibilityService.ts` - Accessibility support
   - [ ] `audioService.ts` - Sound playback
   - [ ] `feedbackService.ts` - User feedback
   - [ ] `historyService.ts` - Gesture history
   - [ ] `storageService.ts` - Unified storage layer

2. **Add essential components**:
   - [ ] `LoadingIndicator.tsx` - Consistent loading states
   - [ ] `ErrorBoundary.tsx` - Error handling
   - [ ] `OfflineBanner.tsx` - Offline detection
   - [ ] `SymbolButton.tsx` - AAC symbol display

3. **Add context providers**:
   - [ ] `ThemeProvider.tsx` - Dark/light mode
   - [ ] `NotificationProvider.tsx` - User messaging

### Secondary Priority

4. **Add remaining services**:
   - [ ] GDPR/data protection compliance
   - [ ] Analytics/telemetry
   - [ ] Backup/export

5. **Add UI polish components**:
   - [ ] `Celebration.tsx`
   - [ ] `VisualFeedback.tsx`
   - [ ] `SoundSelector.tsx`

### Future Consideration

6. **Consider IndexedDB** for structured data if localStorage becomes limiting
7. **Add video assets** for tutorials
8. **Implement sound customization**

---

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missing accessibility | High | Port accessibilityService |
| No offline support | Medium | Add service worker + offline detection |
| Limited storage | Medium | Consider IndexedDB upgrade |
| No error tracking | Medium | Add browser error tracking |
| Missing feedback | Low | Port feedbackService |

---

## Conclusion

The core gesture recognition and training pipeline is fully migrated. The main gaps are:

1. **Service layer** - The app has 40+ services; webapp has few
2. **Context providers** - State management infrastructure
3. **UI components** - 35+ app components not yet in webapp
4. **Database** - Structured data storage

The webapp is functional for core use cases but needs the service layer and context providers for production readiness. The `app/` directory should be kept as reference until these gaps are addressed.
