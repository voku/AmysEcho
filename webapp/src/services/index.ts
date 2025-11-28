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

export { gdprService } from './gdprService';
export type { ExportedProfileData } from './gdprService';

export { announceGestureRecognition, announceAccessibilityMessage, createGestureAccessibilityLabel, prefersReducedMotion, prefersHighContrast } from './accessibilityService';

export { logger } from './logger';
