# Blind Spot Analysis: app/* to webapp/* Migration

This document provides a comprehensive analysis of gaps between the React Native/Expo `app/` and the browser-based `webapp/`.

---

## Executive Summary

| Category | App | Webapp | Gap |
|----------|-----|--------|-----|
| Services | 41 files (9,644 lines) | 8 files (1,430 lines) | 33 services missing |
| Components | 42 files | 41 files | 31 components different |
| Context Providers | 7 files | 5 files | 2 contexts missing |
| Database Models | 10 tables | IndexedDB | Different architecture |
| Gesture Pipeline | 62 files | 62 files | ✅ Parity |
| Training Pipeline | 6 files | 9 files | ✅ Parity |

---

## 1. Services Layer Analysis

### ✅ Migrated Services (8 files)

| App Service | Webapp Service | Status |
|-------------|----------------|--------|
| `accessibilityService.ts` | `accessibilityService.ts` | ✅ |
| `audioService.ts` | `audioService.ts` | ✅ |
| `feedbackService.ts` | `feedbackService.ts` | ✅ |
| `gestureHistoryService.ts` | `gestureHistoryService.ts` | ✅ |
| `correctionService.ts` | `correctionService.ts` | ✅ |
| `gdprService.ts` | `gdprService.ts` | ✅ |
| N/A | `logger.ts` | ✅ New |
| `dgsModelClient.ts` | `gesture/modelClient.ts` | ✅ Different location |

### 🔴 Missing Services (33 files)

#### Critical for Core Functionality
| Service | Lines | Description | Priority |
|---------|-------|-------------|----------|
| `trainingBundleService.ts` | 389 | Bundle creation/compression | ⚠️ High - but covered by `training/trainingBundle.ts` |
| `trainingSync.ts` | 425 | Sync training data to server | ⚠️ High - but covered by `hooks/useTrainingUploader.ts` |
| `zeroDowntimeModelService.ts` | 594 | Hot-swap ML models | 🟡 Medium |
| `gestureMeaningService.ts` | 453 | Gesture-symbol mapping | 🟡 Medium |
| `customGestureRegistry.ts` | 116 | Custom gesture definitions | 🟡 Medium |

#### Learning & Analytics
| Service | Lines | Description | Priority |
|---------|-------|-------------|----------|
| `adaptiveLearningService.ts` | 368 | Adaptive difficulty | 🟡 Medium |
| `activeLearningService.ts` | 338 | Active learning suggestions | 🟡 Medium |
| `personalizedConfidenceService.ts` | 321 | Per-user thresholds | 🟡 Medium |
| `contextAwareRecognitionService.ts` | 284 | Context-based recognition | 🟡 Medium |
| `engagementTracker.ts` | 164 | Usage engagement | 🟢 Low |
| `usageTracker.ts` | 25 | Basic usage stats | 🟢 Low |

#### Performance & Optimization
| Service | Lines | Description | Priority |
|---------|-------|-------------|----------|
| `performanceMonitor.ts` | 327 | Performance metrics | 🟢 Low |
| `optimizedGestureService.ts` | 210 | Gesture optimization | 🟢 Low |
| `lazyLoadingService.ts` | 214 | Lazy loading | 🟢 Low |
| `databaseOptimizationService.ts` | 109 | DB optimization | 🟢 Low |

#### Gesture Processing
| Service | Lines | Description | Priority |
|---------|-------|-------------|----------|
| `gestureCombinationService.ts` | 154 | Multi-gesture combinations | 🟡 Medium |
| `gestureSuggester.ts` | 305 | Gesture suggestions | 🟡 Medium |
| `gestureRecorder.ts` | 22 | Recording gestures | 🟡 Medium |
| `landmarkNormalizer.ts` | 50 | Landmark normalization | 🟡 Medium |
| `handUtils.ts` | 118 | Hand utilities | ⚠️ Exists in `training/handUtils.ts` |

#### Data & Backup
| Service | Lines | Description | Priority |
|---------|-------|-------------|----------|
| `backupService.ts` | 196 | Data backup | 🟡 Medium |
| `dataProtection.ts` | 127 | Data protection | ⚠️ Covered by `gdprService.ts` |
| `automaticRecoveryService.ts` | 131 | Auto-recovery | 🟢 Low |

#### Utilities
| Service | Lines | Description | Priority |
|---------|-------|-------------|----------|
| `APIRetryManager.ts` | 105 | API retry logic | 🟡 Medium |
| `OneEuroFilter.ts` | 91 | Smoothing filter | 🟡 Medium |
| `TrainingDataValidator.ts` | 206 | Validate training data | ⚠️ Exists in `training/trainingValidator.ts` |
| `healthScore.ts` | 167 | Gesture health score | 🟡 Medium |
| `hipEvents.ts` | 41 | HIP event tracking | 🟢 Low |
| `modelUpdate.ts` | 109 | Model update logic | 🟡 Medium |
| `analytics.ts` | 122 | Analytics | 🟢 Low |
| `crashReporting.ts` | 60 | Crash reporting | 🟢 Low |
| `trainingSyncScheduler.ts` | 69 | Sync scheduler | 🟢 Low |
| `trainingBundleQueue.ts` | 89 | Queue management | ⚠️ Exists in `training/trainingQueue.ts` |

---

## 2. Components Analysis

### ✅ Screen Components (19/19 migrated)

All app screens have webapp equivalents. See `docs/MIGRATION_COMPARISON.md`.

### 🔴 Missing UI Components (31 files)

#### Core UI Elements
| Component | Description | Priority |
|-----------|-------------|----------|
| `ActionButton.tsx` | Primary action button | 🟢 Low - using CSS |
| `PrimaryButton.tsx` | Primary styled button | 🟢 Low - using CSS |
| `PulsingCircle.tsx` | Pulsing indicator | 🟢 Low |
| `ScreenBackground.tsx` | Gradient background | 🟢 Low |
| `ScreenFlash.tsx` | Camera flash effect | 🟢 Low |
| `VisualFeedback.tsx` | Visual feedback overlay | 🟡 Medium |
| `VisualRipple.tsx` | Ripple effect | 🟢 Low |
| `StatusCapsule.tsx` | Status indicator | 🟡 Medium |
| `LazyComponent.tsx` | Lazy loading wrapper | 🟢 Low |
| `ErrorMessage.tsx` | Error display | ⚠️ Covered by `ErrorBoundary.tsx` |
| `FeedbackBanner.tsx` | Feedback notification | 🟡 Medium |
| `ChildErrorBoundary.tsx` | Child error handling | ⚠️ Covered by `ErrorBoundary.tsx` |

#### Gesture-Specific Components
| Component | Description | Priority |
|-----------|-------------|----------|
| `GestureWebView.tsx` | WebView for gesture detection | ⚠️ Not needed in webapp |
| `MediaPipeGestureDetector.tsx` | MediaPipe integration | ⚠️ Different architecture in webapp |
| `CameraFrame.tsx` | Camera preview frame | 🟡 Medium |
| `GestureHistoryViewer.tsx` | History visualization | ⚠️ Covered by `GestureHistory.tsx` |
| `GestureMeaningDisplay.tsx` | Show gesture meaning | 🟡 Medium |
| `GestureMeaningSelector.tsx` | Select gesture meaning | 🟡 Medium |
| `GestureValidationFeedback.tsx` | Validation feedback | 🟡 Medium |

#### Learning & Practice
| Component | Description | Priority |
|-----------|-------------|----------|
| `AdaptiveLearningPanel.tsx` | Learning recommendations | 🟡 Medium |
| `PracticeSuggestion.tsx` | Practice suggestions | 🟡 Medium |
| `ProfileAnalytics.tsx` | Profile statistics | 🟡 Medium |

#### Settings Components
| Component | Description | Priority |
|-----------|-------------|----------|
| `SoundSelector.tsx` | Sound selection | 🟡 Medium |
| `ThemeSelector.tsx` | Theme selection | ⚠️ Covered by `ThemeContext` |
| `CollapsibleSettingsSection.tsx` | Collapsible settings | 🟢 Low |
| `SettingsOptionCard.tsx` | Settings option card | 🟢 Low |

#### Amy First Components
| Component | Description | Priority |
|-----------|-------------|----------|
| `AmyFirstCommitments.tsx` | Amy commitments display | ⚠️ Covered by `AboutAmysEcho.tsx` |
| `AmyLoopTimeline.tsx` | Amy Loop visualization | ⚠️ Covered by `Hero.tsx` |
| `WorkflowStageHeader.tsx` | Workflow header | 🟢 Low |
| `WorkflowSupportLinks.tsx` | Support links | 🟢 Low |

#### Media Components
| Component | Description | Priority |
|-----------|-------------|----------|
| `DgsVideoPlayer.tsx` | DGS video player | 🟡 Medium - HTML5 video |

#### Navigation
| Component | Description | Priority |
|-----------|-------------|----------|
| `NewBottomNav.tsx` | Updated navigation | ⚠️ Covered by `BottomNav.tsx` |

---

## 3. Context Providers

### ✅ Migrated Contexts (5 files)

| App Context | Webapp Context | Status |
|-------------|----------------|--------|
| `ThemeContext.tsx` | `ThemeContext.tsx` | ✅ |
| `MessageContext.tsx` | `MessageContext.tsx` | ✅ |
| `ServicesContext.tsx` | `ServicesContext.tsx` | ✅ |
| `AccessibilityContext.tsx` | (in components) → `AccessibilityContext.tsx` | ✅ |
| `AppServicesProvider.tsx` | `ServicesContext.tsx` | ✅ Combined |

### 🔴 Missing Contexts (2 files)

| Context | Description | Priority |
|---------|-------------|----------|
| `LocationContext.tsx` | Location tracking | 🟢 Low - not needed for web |
| `MoodContext.tsx` | User mood tracking | 🟡 Medium |
| `PerformanceContext.tsx` | Performance metrics | 🟢 Low |

---

## 4. Database Layer

### App: WatermelonDB (10 tables)

```
profiles, symbols, vocabulary_sets, vocabulary_set_symbols,
usage_stats, gesture_definitions, gesture_training_data,
interaction_logs, corrections, learning_analytics
```

### Webapp: IndexedDB + localStorage

The webapp uses:
- `training/trainingQueue.ts` - IndexedDB + OPFS for training bundles
- `services/gestureHistoryService.ts` - localStorage for history
- Various localStorage for settings

**Gap Analysis**: The webapp has simpler storage but covers core needs:
- ✅ Training data persistence (IndexedDB + OPFS)
- ✅ Settings persistence (localStorage)
- ✅ History persistence (localStorage)
- 🟡 Missing: vocabulary sets, learning analytics

---

## 5. Gesture Detection Pipeline ✅

The gesture pipeline has **full parity**:

| Category | App (webview/) | Webapp (gesture/) |
|----------|----------------|-------------------|
| Core | 9 files | 9 files |
| Utils | 29 files | 29 files |
| Config | 1 file | 1 file |
| Types | 2 files | 2 files |
| Tests | 8 files | 12 files |

**Total**: 62 files in app, 62 files in webapp ✅

---

## 6. Utils Analysis

### App Utils (16 files)

| File | Webapp Equivalent | Status |
|------|-------------------|--------|
| `apiUtils.ts` | hooks/useApiConfig | ✅ |
| `base64.ts` | inline | ✅ |
| `clipPersistence.ts` | training/trainingQueue | ✅ |
| `errorUtils.ts` | ErrorBoundary | ✅ |
| `hapticUtils.ts` | services/feedbackService | ✅ |
| `imageUtils.ts` | N/A | 🟢 Low |
| `landmarkMapping.ts` | gesture/utils | ✅ |
| `landmarkUtils.ts` | utils/landmarkUtils | ✅ |
| `logger.ts` | services/logger | ✅ |
| `pathUtils.ts` | N/A | 🟢 Low - not needed for web |
| `recognitionState.ts` | hooks/useGestureDetector | ✅ |
| `shortcutUtils.ts` | N/A | 🟢 Low |
| `storageUtils.ts` | localStorage | ✅ |
| `stringUtils.ts` | utils/stringUtils | ✅ |
| `themeMessages.ts` | context/ThemeContext | ✅ |
| `validationUtils.ts` | training/trainingValidator | ✅ |

---

## 7. Recommendations

### High Priority (Core Functionality)

1. **Gesture Meaning Service** - Map gestures to symbols
2. **Zero Downtime Model Service** - Hot-swap models without interruption
3. **API Retry Manager** - Robust API error handling

### Medium Priority (Enhanced UX)

4. **Adaptive Learning** - Personalized difficulty
5. **Gesture Combinations** - Multi-gesture sequences
6. **Visual Feedback Components** - Enhanced feedback overlays
7. **DGS Video Player** - HTML5 video component for tutorials

### Low Priority (Nice to Have)

8. **Analytics/Performance** - Browser DevTools available
9. **Additional UI polish** - Buttons, animations, effects
10. **Mood/Performance contexts** - Enhanced tracking

---

## 8. What's Already Covered

Many "missing" services are actually covered by different implementations:

| App Service | Webapp Equivalent |
|-------------|-------------------|
| `trainingBundleService.ts` | `training/trainingBundle.ts` |
| `trainingBundleQueue.ts` | `training/trainingQueue.ts` |
| `trainingSync.ts` | `hooks/useTrainingUploader.ts` |
| `TrainingDataValidator.ts` | `training/trainingValidator.ts` |
| `handUtils.ts` | `training/handUtils.ts` |
| `dgsModelClient.ts` | `gesture/modelClient.ts` |
| `dataProtection.ts` | `services/gdprService.ts` |

---

## 9. Conclusion

### Core Functionality: ✅ Complete

- All 19 screens migrated
- Gesture detection pipeline at parity
- Training pipeline functional
- Core services implemented

### Gaps to Address

1. **33 services** - Many are optional or have equivalents
2. **31 components** - Many are styling-only or have equivalents
3. **2 contexts** - Optional enhancements

### True Critical Gaps

Only 3-5 services need implementation for full feature parity:
1. `gestureMeaningService.ts` - Gesture-symbol mapping
2. `zeroDowntimeModelService.ts` - Hot model updates
3. `customGestureRegistry.ts` - Custom gesture definitions
4. `adaptiveLearningService.ts` - Learning adaptation (optional)
5. `APIRetryManager.ts` - Retry logic (optional)

The webapp is **functionally complete** for core use cases. The remaining gaps are enhancement features.
