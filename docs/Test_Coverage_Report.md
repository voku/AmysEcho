## Test Coverage Report - September 5, 2025

This report identifies potential gaps in the project's test coverage by comparing source files with existing test files.

**Summary:**

*   **Total Source Files (`app/src/`):** 101
*   **Total Test Files (`app/test/`):** 86

While a direct 1:1 mapping isn't always indicative of complete coverage (e.g., a single test file might cover multiple small modules, or a source file might be purely declarative), this analysis highlights areas where dedicated test files are missing.

**Source Files with No Corresponding Test File:**

*   `app/src/screens/TeachScreen.tsx`
*   `app/src/screens/ScheduleScreen.tsx`
*   `app/src/screens/ProgressScreen.tsx`
*   `app/src/screens/ProfileManagerScreen.tsx`
*   `app/src/screens/PrivacySettingsScreen.tsx`
*   `app/src/screens/OnboardingScreen.tsx`
*   `app/src/screens/DailySuccessScreen.tsx`
*   `app/src/screens/CommunicationInsightsScreen.tsx`
*   `app/src/components/VisualSchedule.tsx`
*   `app/src/components/DailySuccessSummary.tsx`
*   `app/src/components/CommunicationInsights.tsx`
*   `app/src/components/PrivacySettings.tsx`
*   `app/src/components/CorrectionPanel.tsx`
*   `app/src/components/PulsingCircle.tsx`
*   `app/src/services/dailyJobs.ts`
*   `app/src/services/dataProtection.ts`
*   `app/src/services/modelUpdate.ts`
*   `app/src/components/BottomNav.tsx`
*   `app/src/navigation/types.ts`
*   `app/src/navigation/RootNavigator.tsx`
*   `app/src/components/MoodSelector.tsx`
*   `app/src/context/MoodContext.tsx`
*   `app/src/services/gestureSuggester.ts`
*   `app/src/services/index.ts`
*   `app/src/screens/DashboardScreen.tsx`
*   `app/src/screens/HelpScreen.tsx`
*   `app/src/webview/installMlp.ts`
*   `app/src/services/trainingSync.ts`
*   `app/src/services/syncService.ts`
*   `app/src/services/offlineClassifier.ts`
*   `app/src/services/landmarkNormalizer.ts`
*   `app/src/services/handUtils.ts`
*   `app/src/services/dgsModelClient.ts`
*   `app/src/services/crashReporting.ts`
*   `app/src/declarations.d.ts`
*   `app/src/constants.ts`
*   `app/src/components/AccessibilityContext.tsx`
*   `app/src/components/Celebration.tsx`
*   `app/src/components/ChildErrorBoundary.tsx`
*   `app/src/components/DgsVideoPlayer.tsx`
*   `app/src/components/ErrorMessage.tsx`
*   `app/src/components/LoadingIndicator.tsx`
*   `app/src/components/OfflineBanner.tsx`
*   `app/src/components/SymbolButton.tsx`
*   `app/src/config/recognition.ts`
*   `app/src/constants/audioPaths.ts`
*   `app/src/constants/gesture.ts`
*   `app/src/constants/hand.ts`
*   `app/src/constants/ui.ts`
*   `app/src/context/MessageContext.tsx`
*   `app/src/context/PerformanceContext.tsx`
*   `app/src/context/ServicesContext.tsx`
*   `app/src/model.ts`
*   `app/src/screens/AdminScreen.tsx`
*   `app/src/screens/CaregiverReportScreen.tsx`
*   `app/src/screens/GestureTutorialScreen.tsx`
*   `app/src/screens/ParentalGateScreen.tsx`
*   `app/src/screens/ParentScreen.tsx`
*   `app/src/screens/PracticeSchedulerScreen.tsx`
*   `app/src/screens/PracticeScreen.tsx`
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
*   `app/src/services/LanguageManager.ts`
*   `app/src/services/localCentroids.ts`
*   `app/src/services/OneEuroFilter.ts`
*   `app/src/services/practiceRecommender.ts`
*   `app/src/services/practiceScheduler.ts`
*   `app/src/services/secureConfig.ts`
*   `app/src/services/sequenceRecognizer.ts`
*   `app/src/services/TrainingDataValidator.ts`
*   `app/src/services/usageTracker.ts`
*   `app/src/storage.ts`
*   `app/src/styles/touchTargets.ts`
*   `app/src/telemetry/recorder.ts`
*   `app/src/types/audio.ts`
*   `app/src/types/frames.ts`
*   `app/src/types/ml.ts`
*   `app/src/utils/landmarkMapping.ts`
*   `app/src/utils/logger.ts`
*   `app/src/utils/recognitionState.ts`

**Recommendation:**

It is highly recommended to write unit tests for these files to improve code quality, prevent regressions, and ensure the reliability of the application. Prioritize critical business logic and complex components/services.