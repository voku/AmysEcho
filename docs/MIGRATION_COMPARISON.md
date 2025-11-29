# App to Webapp Migration Comparison

This document compares the React Native/Expo `app/` directory with the browser-based `webapp/` to verify feature parity.

## Screen/Component Mapping

| App Screen | Webapp Component | Route | Status |
|------------|-----------------|-------|--------|
| RecognitionScreen.tsx | GestureDemo.tsx | `/` | ✅ Migrated |
| DashboardScreen.tsx | Dashboard.tsx | `/dashboard` | ✅ Migrated |
| LernenScreen.tsx | LearningHub.tsx | `/lernen` | ✅ Migrated |
| HistoryScreen.tsx | GestureHistory.tsx | `/verlauf` | ✅ Migrated |
| CommunicationInsightsScreen.tsx | CommunicationInsights.tsx | `/erkenntnisse` | ✅ Migrated |
| TrainingScreen.tsx | TrainingUpload.tsx | `/training` | ✅ Migrated |
| ProgressScreen.tsx | ProgressTracker.tsx | `/fortschritt` | ✅ Migrated |
| ProgressChartScreen.tsx | ProgressChart.tsx | `/fortschritt-detail` | ✅ Migrated |
| ProfileManagerScreen.tsx | Settings.tsx | `/einstellungen` | ✅ Migrated |
| HelpScreen.tsx | Help.tsx | `/hilfe` | ✅ Migrated |
| GestureTutorialScreen.tsx | GestureTutorial.tsx | `/tutorial` | ✅ Migrated |
| OnboardingScreen.tsx | Onboarding.tsx | `/onboarding` | ✅ Migrated |
| HeroScreen.tsx | Hero.tsx | `/willkommen` | ✅ Migrated |
| ProfileSelectScreen.tsx | ProfileSelect.tsx | `/auswahl` | ✅ Migrated |
| ParentScreen.tsx | ParentArea.tsx | `/eltern` | ✅ Migrated |
| ParentalGateScreen.tsx | ParentalGate.tsx | `/elterntor` | ✅ Migrated |
| AdminScreen.tsx | Admin.tsx | `/admin` | ✅ Migrated |
| CaregiverReportScreen.tsx | CaregiverReport.tsx | `/bericht` | ✅ Migrated |
| TeachScreen.tsx | Teach.tsx | `/beibringen` | ✅ Migrated |
| N/A (new) | AboutAmysEcho.tsx | `/ueber` | ✅ New |

## Component Mapping

| App Component | Webapp Component | Status |
|---------------|------------------|--------|
| CorrectionPanel.tsx | CorrectionPanel.tsx | ✅ Migrated |
| HandLandmarkPreview.tsx | HandLandmarkPreview.tsx | ✅ Migrated |
| BottomNav.tsx | BottomNav.tsx | ✅ Migrated |
| ProgressTracker.tsx | (in ProgressTracker.tsx) | ✅ Migrated |
| GestureHistoryViewer.tsx | (in GestureHistory.tsx) | ✅ Migrated |
| AmyFirstCommitments.tsx | (in AboutAmysEcho.tsx) | ✅ Migrated |
| AmyLoopTimeline.tsx | (in Hero.tsx) | ✅ Migrated |
| PrimaryButton.tsx | (uses CSS .primary-button) | ✅ Adapted |
| ScreenBackground.tsx | (uses CSS .app-shell) | ✅ Adapted |

## Gesture Detection Pipeline

| App File | Webapp File | Status |
|----------|-------------|--------|
| webview/gestureDetector.ts | gesture/gestureDetector.ts | ✅ Migrated |
| webview/gestureProcessing.ts | gesture/gestureProcessing.ts | ✅ Migrated |
| webview/core/GestureRecognitionOrchestrator.ts | gesture/core/GestureRecognitionOrchestrator.ts | ✅ Migrated |
| webview/core/GestureDetector.ts | gesture/core/GestureDetector.ts | ✅ Migrated |
| webview/core/MediaPipeLoader.ts | gesture/core/MediaPipeLoader.ts | ✅ Migrated |
| webview/core/CameraManager.ts | gesture/core/CameraManager.ts | ✅ Migrated |
| webview/core/BatteryMonitor.ts | gesture/core/BatteryMonitor.ts | ✅ Migrated |
| webview/utils/DetectionAccuracyEnhancer.ts | gesture/utils/DetectionAccuracyEnhancer.ts | ✅ Migrated |
| webview/utils/OptimizedTremorCompensator.ts | gesture/utils/OptimizedTremorCompensator.ts | ✅ Migrated |
| webview/utils/OptimizedGestureCombinationManager.ts | gesture/utils/OptimizedGestureCombinationManager.ts | ✅ Migrated |

## Services

| App Service | Webapp Equivalent | Status |
|-------------|-------------------|--------|
| dgsModelClient.ts | gesture/modelClient.ts | ✅ Migrated |
| trainingBundleService.ts | training/trainingQueue.ts | ✅ Migrated |
| trainingSync.ts | hooks/useTrainingUploader.ts | ✅ Migrated |
| feedbackService.ts | (browser-based feedback) | ✅ Adapted |
| audioService.ts | (browser Web Audio API) | ✅ Adapted |
| Storage (SecureStore) | localStorage | ✅ Adapted |

## Hooks

| App Hook | Webapp Hook | Status |
|----------|-------------|--------|
| useRecognitionState.ts | hooks/useAppState.tsx | ✅ Migrated |
| useModelInjection.ts | hooks/useMlpModelInjection.ts | ✅ Migrated |
| N/A | hooks/useGestureDetector.ts | ✅ New |
| N/A | hooks/useApiConfig.tsx | ✅ New |
| N/A | hooks/useTrainingRecorder.ts | ✅ New |
| N/A | hooks/useTrainingUploader.ts | ✅ New |

## Features Comparison

### Core Features

| Feature | App | Webapp | Notes |
|---------|-----|--------|-------|
| Gesture Recognition | ✅ | ✅ | MediaPipe + MLP classification |
| MLP Model Loading | ✅ | ✅ | Server-based model download |
| Training Recording | ✅ | ✅ | Landmark capture and bundling |
| Training Upload | ✅ | ✅ | Server sync with queue |
| History Tracking | ✅ | ✅ | Local storage persistence |
| Corrections | ✅ | ✅ | Correct misrecognitions |
| Progress Tracking | ✅ | ✅ | Mastery levels and stats |

### User Experience

| Feature | App | Webapp | Notes |
|---------|-----|--------|-------|
| Onboarding | ✅ | ✅ | Profile setup wizard |
| Tutorial | ✅ | ✅ | Step-by-step guide |
| Help/FAQ | ✅ | ✅ | Documentation and tips |
| Settings | ✅ | ✅ | Profile and display settings |
| Parent Area | ✅ | ✅ | Caregiver tools |
| Admin Area | ✅ | ✅ | Technical management |

### Platform-Specific Adaptations

| App Feature | Webapp Adaptation |
|-------------|-------------------|
| SecureStore | localStorage with encryption |
| Native Haptics | Browser vibration API (where available) |
| Expo Camera | Browser MediaDevices API |
| Expo FileSystem | Browser downloads |
| React Navigation | React Router |
| Native Alerts | Window.alert / custom modals |

## Test Coverage

- **App Tests**: 150+ test files in app/test/
- **Webapp Tests**: 37 test files, 392 tests passing
- **Integration Tests**: 6 tests passing

## Conclusion

The webapp now has **complete feature parity** with the Expo app for all core functionality:

1. ✅ All 19 app screens have been migrated to webapp components
2. ✅ The gesture detection pipeline is fully migrated
3. ✅ Training, upload, and sync functionality works
4. ✅ User experience features (onboarding, tutorial, help) are complete
5. ✅ Parent/admin areas are accessible
6. ✅ All 392 webapp tests pass

The `app/` directory is kept as reference for any edge cases during validation.
