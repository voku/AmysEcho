/**
 * Services Index
 * Re-exports all services for convenient imports.
 */

export { audioService } from './audioService';
export type { AudioConfig, SpeechOptions, SpeakRequestOptions } from './audioService';

export { feedbackService, gestureHapticFeedback, multiSensoryFeedback, detectionHapticFeedback, partialGestureHapticFeedback, learningProgressHapticFeedback, streakAchievementHapticFeedback, encouragementHapticFeedback, childHaptic, triggerSpeakAndShow } from './feedbackService';
export type { HapticPattern, HapticPreferences } from './feedbackService';

export { gestureHistoryService } from './gestureHistoryService';
export type { GestureHistoryEntry, GestureUsageSummary, GestureHistoryStats } from './gestureHistoryService';

export { correctionService } from './correctionService';
export { gestureDataProtector } from './dataProtection';
export { backupService } from './backupService';

export { gdprService } from './gdprService';
export type { ExportedProfileData } from './gdprService';

export { announceGestureRecognition, announceAccessibilityMessage, createGestureAccessibilityLabel, prefersReducedMotion, prefersHighContrast } from './accessibilityService';

export { logger } from './logger';

export { adaptiveLearningService } from './adaptiveLearningService';
export type { 
  PerformanceMetrics, 
  LearningPath, 
  AdaptiveRecommendation, 
  PracticeSession, 
  LearningProgressSummary 
} from './adaptiveLearningService';

export { gestureMeaningService } from './gestureMeaningService';
export { customGestureRegistry } from './customGestureRegistry';
export { zeroDowntimeModelService } from './zeroDowntimeModelService';
export { apiRetryManager } from './apiRetryManager';

// Active Learning Service
export { activeLearningService, ActiveLearningService } from './activeLearningService';
export type { 
  UncertainSample, 
  Misclassification, 
  LearningPriority, 
  PracticeSuggestion 
} from './activeLearningService';

// Personalized Confidence Service
export { personalizedConfidenceService } from './personalizedConfidenceService';
export type { 
  ConfidenceProfile, 
  PersonalizedThreshold 
} from './personalizedConfidenceService';

// Performance Monitor
export { performanceMonitor } from './performanceMonitor';
export type { 
  PerformanceMetrics as PerformanceMonitorMetrics,
  PerformanceSample 
} from './performanceMonitor';

// Gesture Suggester
export { gestureSuggester } from './gestureSuggester';
export type { 
  GestureSuggestion, 
  GestureContext as GestureSuggesterContext 
} from './gestureSuggester';

// Health Score
export { 
  getGestureHealth, 
  shouldPromptPractice, 
  saveInteractionLog,
  saveHistoricalHealthData, 
  loadHistoricalHealthData, 
  checkForDecliningAccuracy, 
  generateProgressReport,
  resetHealthData
} from './healthScore';
export type { 
  InteractionLog, 
  HealthResult, 
  HistoricalHealthEntry, 
  ProgressReport 
} from './healthScore';

// Engagement Tracker
export { 
  startSession, 
  endSession, 
  loadEngagementStats, 
  isSessionActive, 
  getCurrentSessionDuration,
  resetEngagementData 
} from './engagementTracker';
export type { EngagementStats } from './engagementTracker';
