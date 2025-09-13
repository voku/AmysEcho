import { useState } from 'react';
import type { GestureModelEntry } from '../model';
import type { LLMSuggestionResponse } from '../services/dialogEngine';
import type { RecognitionPath } from '../utils/recognitionState';
import type { DetectedTwoHandGesture } from '../services/twoHandGestureService';
import type { Profile } from '../storage';

export const useRecognitionState = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState('Ich höre zu…');
  const [gestureConfidence, setGestureConfidence] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [, setSuggestions] = useState<LLMSuggestionResponse>({
    nextWords: [],
    caregiverPhrases: [],
  });
  const [gestureSuggestions, setGestureSuggestions] = useState<Array<{id: string; label: string}>>([]);
  const [dialogContext, setDialogContext] = useState<string[]>([]);
  const [pendingGesture, setPendingGesture] = useState<string | null>(null);
  const [lastRecognizedGesture, setLastRecognizedGesture] =
    useState<GestureModelEntry | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [webviewKey, setWebviewKey] = useState(0);
  const [webviewRetries, setWebviewRetries] = useState(0);
  const [recognitionPath, setRecognitionPath] = useState<RecognitionPath>('local');
  const [showDgsVideo, setShowDgsVideo] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [modelUpdateStatus, setModelUpdateStatus] = useState<'idle' | 'updating' | 'complete' | 'error'>('idle');
  const [showMoodSelector, setShowMoodSelector] = useState(false);
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [kindergartenMode, setKindergartenMode] = useState(true); // Default to kindergarten mode
  const [bullyingProtectionActive, setBullyingProtectionActive] = useState(false);
  const [gestureSizeTolerance, setGestureSizeTolerance] = useState(0.3);
  const [showVisualRipple, setShowVisualRipple] = useState(false);
  const [successSound, setSuccessSound] = useState('success');
  const [showScreenFlash, setShowScreenFlash] = useState(false);
  const [screenFlashPattern, setScreenFlashPattern] = useState<'single' | 'double' | 'triple' | 'pulse' | 'ripple' | 'wave' | 'heartbeat' | 'success' | 'warning' | 'error'>('single');
  const [showGestureComparison, setShowGestureComparison] = useState(false);
  const [comparisonAttempt, setComparisonAttempt] = useState<{id: string; label: string; confidence: number; timestamp: number} | null>(null);
  const [shortcutActivated, setShortcutActivated] = useState<string | null>(null);
  const [showPipGuidance, setShowPipGuidance] = useState(false);
  const [pipGuidanceGesture, setPipGuidanceGesture] = useState<GestureModelEntry | null>(null);
  const [showPracticeSuggestion, setShowPracticeSuggestion] = useState(false);
  const [showAdaptiveLearning, setShowAdaptiveLearning] = useState(false);
  const [contextInsights] = useState<any>(null);
  const [detectedTwoHandGesture, setDetectedTwoHandGesture] = useState<DetectedTwoHandGesture | null>(null);

  return {
    profile, setProfile,
    status, setStatus,
    gestureConfidence, setGestureConfidence,
    error, setError,
    showCorrection, setShowCorrection,
    setSuggestions,
    gestureSuggestions, setGestureSuggestions,
    dialogContext, setDialogContext,
    pendingGesture, setPendingGesture,
    lastRecognizedGesture, setLastRecognizedGesture,
    facingMode, setFacingMode,
    webviewKey, setWebviewKey,
    webviewRetries, setWebviewRetries,
    recognitionPath, setRecognitionPath,
    showDgsVideo, setShowDgsVideo,
    showCelebration, setShowCelebration,
    celebrationKey, setCelebrationKey,
    screenReaderEnabled, setScreenReaderEnabled,
    modelUpdateStatus, setModelUpdateStatus,
    showMoodSelector, setShowMoodSelector,
    showLocationSelector, setShowLocationSelector,
    kindergartenMode, setKindergartenMode,
    bullyingProtectionActive, setBullyingProtectionActive,
    gestureSizeTolerance, setGestureSizeTolerance,
    showVisualRipple, setShowVisualRipple,
    successSound, setSuccessSound,
    showScreenFlash, setShowScreenFlash,
    screenFlashPattern, setScreenFlashPattern,
    showGestureComparison, setShowGestureComparison,
    comparisonAttempt, setComparisonAttempt,
    shortcutActivated, setShortcutActivated,
    showPipGuidance, setShowPipGuidance,
    pipGuidanceGesture, setPipGuidanceGesture,
    showPracticeSuggestion, setShowPracticeSuggestion,
    showAdaptiveLearning, setShowAdaptiveLearning,
    contextInsights,
    detectedTwoHandGesture, setDetectedTwoHandGesture,
  };
};