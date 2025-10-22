## Test Coverage Report - September 5, 2025

This report identifies potential gaps in the project's test coverage by comparing source files with existing test files. It was captured before the analytics, dialog, and caregiver portal features were retired; references to those modules remain for historical context only.

**Summary:**

*   **Total Source Files (`app/src/`):** 101
*   **Total Test Files (`app/test/`):** 86

While a direct 1:1 mapping isn't always indicative of complete coverage (e.g., a single test file might cover multiple small modules, or a source file might be purely declarative), this analysis highlights areas where dedicated test files are missing.

**Source Files with No Corresponding Test File:**

*   `app/src/screens/TeachScreen.tsx`
*   `app/src/screens/ProfileManagerScreen.tsx`
*   `app/src/screens/OnboardingScreen.tsx`
*   `app/src/screens/CommunicationInsightsScreen.tsx`
*   `app/src/components/CommunicationInsights.tsx`
*   `app/src/components/CorrectionPanel.tsx`
*   `app/src/components/PulsingCircle.tsx`
*   `app/src/navigation/types.ts`
*   `app/src/navigation/RootNavigator.tsx`
*   `app/src/services/gestureSuggester.ts`
*   `app/src/services/index.ts`
*   `app/src/screens/DashboardScreen.tsx`
*   `app/src/screens/HelpScreen.tsx`
*   `app/src/declarations.d.ts`
*   `app/src/constants.ts`
*   `app/src/components/AccessibilityContext.tsx`
*   `app/src/components/ErrorMessage.tsx`
*   `app/src/config/recognition.ts`
*   `app/src/constants/audioPaths.ts`
*   `app/src/constants/gesture.ts`
*   `app/src/constants/hand.ts`
*   `app/src/constants/ui.ts`
*   `app/src/context/MessageContext.tsx`
*   `app/src/context/PerformanceContext.tsx`
*   `app/src/screens/AdminScreen.tsx`
*   `app/src/screens/CaregiverReportScreen.tsx`
*   `app/src/screens/GestureTutorialScreen.tsx`
*   `app/src/screens/ParentalGateScreen.tsx`
*   `app/src/screens/ParentScreen.tsx`
*   `app/src/screens/ProfileSelectScreen.tsx`
*   `app/src/screens/ProgressChartScreen.tsx`
*   `app/src/screens/TeachingScreen.tsx`
*   `app/src/services/accessibilityService.ts`
*   `app/src/services/adaptiveLearningService.ts`
*   `app/src/services/analytics.ts`
*   `app/src/services/APIRetryManager.ts`
*   `app/src/services/audioService.ts`
*   `app/src/services/backupService.ts`
*   `app/src/services/correctionService.ts`
*   `app/src/services/dgsTrainingService.ts`
*   `app/src/services/dialogEngine.ts`
*   `app/src/services/engagementTracker.ts`
*   `app/src/services/feedbackService.ts`
*   `app/src/services/gdprService.ts`
*   `app/src/services/gestureRecorder.ts`
*   `app/src/services/healthScore.ts`
*   `app/src/services/hipEvents.ts`
*   `app/src/services/OneEuroFilter.ts`
*   `app/src/services/secureConfig.ts`
*   `app/src/services/TrainingDataValidator.ts`
*   `app/src/services/usageTracker.ts`
*   `app/src/styles/touchTargets.ts`
*   `app/src/types/audio.ts`
*   `app/src/types/frames.ts`
*   `app/src/types/ml.ts`
*   `app/src/utils/landmarkMapping.ts`

**Recommendation:**

It is highly recommended to write unit tests for these files to improve code quality, prevent regressions, and ensure the reliability of the application. Prioritize critical business logic and complex components/services.

> Hinweis: Die veralteten Services `sequenceRecognizer`, `symbolService`, `trainingDataService`, `TrainingSessionManager`, `adaptivePracticeTimingService`, `emergencyPriorityService`, `dailyJobs` und `practiceRecommender` wurden im Rahmen der Alpha-Bereinigung entfernt, da sie nicht mehr von der App genutzt werden.
