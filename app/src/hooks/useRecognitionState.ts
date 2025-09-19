import { useState, type Dispatch, type SetStateAction } from 'react';
import type { GestureModelEntry } from '../model';
import type { LLMSuggestionResponse } from '../services/dialogEngine';
import type { RecognitionPath } from '../utils/recognitionState';
import type { DetectedTwoHandGesture } from '../services/twoHandGestureService';
import type { Profile } from '../storage';

export type ScreenFlashPattern =
  | 'single'
  | 'double'
  | 'triple'
  | 'pulse'
  | 'ripple'
  | 'wave'
  | 'heartbeat'
  | 'success'
  | 'warning'
  | 'error';

export interface RecognitionState {
  profile: Profile | null;
  setProfile: Dispatch<SetStateAction<Profile | null>>;
  status: string;
  setStatus: Dispatch<SetStateAction<string>>;
  gestureConfidence: number;
  setGestureConfidence: Dispatch<SetStateAction<number>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  showCorrection: boolean;
  setShowCorrection: Dispatch<SetStateAction<boolean>>;
  setSuggestions: Dispatch<SetStateAction<LLMSuggestionResponse>>;
  gestureSuggestions: Array<{ id: string; label: string }>;
  setGestureSuggestions: Dispatch<
    SetStateAction<Array<{ id: string; label: string }>>
  >;
  dialogContext: string[];
  setDialogContext: Dispatch<SetStateAction<string[]>>;
  pendingGesture: string | null;
  setPendingGesture: Dispatch<SetStateAction<string | null>>;
  lastRecognizedGesture: GestureModelEntry | null;
  setLastRecognizedGesture: Dispatch<SetStateAction<GestureModelEntry | null>>;
  facingMode: 'user' | 'environment';
  setFacingMode: Dispatch<SetStateAction<'user' | 'environment'>>;
  webviewKey: number;
  setWebviewKey: Dispatch<SetStateAction<number>>;
  webviewRetries: number;
  setWebviewRetries: Dispatch<SetStateAction<number>>;
  recognitionPath: RecognitionPath;
  setRecognitionPath: Dispatch<SetStateAction<RecognitionPath>>;
  showDgsVideo: boolean;
  setShowDgsVideo: Dispatch<SetStateAction<boolean>>;
  showCelebration: boolean;
  setShowCelebration: Dispatch<SetStateAction<boolean>>;
  celebrationKey: number;
  setCelebrationKey: Dispatch<SetStateAction<number>>;
  screenReaderEnabled: boolean;
  setScreenReaderEnabled: Dispatch<SetStateAction<boolean>>;
  modelUpdateStatus: 'idle' | 'updating' | 'complete' | 'error';
  setModelUpdateStatus: Dispatch<SetStateAction<'idle' | 'updating' | 'complete' | 'error'>>;
  showMoodSelector: boolean;
  setShowMoodSelector: Dispatch<SetStateAction<boolean>>;
  showLocationSelector: boolean;
  setShowLocationSelector: Dispatch<SetStateAction<boolean>>;
  kindergartenMode: boolean;
  setKindergartenMode: Dispatch<SetStateAction<boolean>>;
  bullyingProtectionActive: boolean;
  setBullyingProtectionActive: Dispatch<SetStateAction<boolean>>;
  gestureSizeTolerance: number;
  setGestureSizeTolerance: Dispatch<SetStateAction<number>>;
  showVisualRipple: boolean;
  setShowVisualRipple: Dispatch<SetStateAction<boolean>>;
  successSound: string;
  setSuccessSound: Dispatch<SetStateAction<string>>;
  showScreenFlash: boolean;
  setShowScreenFlash: Dispatch<SetStateAction<boolean>>;
  screenFlashPattern: ScreenFlashPattern;
  setScreenFlashPattern: Dispatch<SetStateAction<ScreenFlashPattern>>;
  showGestureComparison: boolean;
  setShowGestureComparison: Dispatch<SetStateAction<boolean>>;
  comparisonAttempt: { id: string; label: string; confidence: number; timestamp: number } | null;
  setComparisonAttempt: Dispatch<
    SetStateAction<{ id: string; label: string; confidence: number; timestamp: number } | null>
  >;
  shortcutActivated: string | null;
  setShortcutActivated: Dispatch<SetStateAction<string | null>>;
  showPipGuidance: boolean;
  setShowPipGuidance: Dispatch<SetStateAction<boolean>>;
  pipGuidanceGesture: GestureModelEntry | null;
  setPipGuidanceGesture: Dispatch<SetStateAction<GestureModelEntry | null>>;
  showPracticeSuggestion: boolean;
  setShowPracticeSuggestion: Dispatch<SetStateAction<boolean>>;
  showAdaptiveLearning: boolean;
  setShowAdaptiveLearning: Dispatch<SetStateAction<boolean>>;
  contextInsights: any;
  detectedTwoHandGesture: DetectedTwoHandGesture | null;
  setDetectedTwoHandGesture: Dispatch<SetStateAction<DetectedTwoHandGesture | null>>;
  currentLandmarks: number[][][];
  setCurrentLandmarks: Dispatch<SetStateAction<number[][][]>>;
  currentHandedness: string[];
  setCurrentHandedness: Dispatch<SetStateAction<string[]>>;
}

export const useRecognitionState = (): RecognitionState => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState('Ich höre zu…');
  const [gestureConfidence, setGestureConfidence] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [, setSuggestions] = useState<LLMSuggestionResponse>({
    nextWords: [],
    caregiverPhrases: [],
  });
  const [gestureSuggestions, setGestureSuggestions] = useState<Array<{ id: string; label: string }>>([]);
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
  const [kindergartenMode, setKindergartenMode] = useState(true);
  const [bullyingProtectionActive, setBullyingProtectionActive] = useState(false);
  const [gestureSizeTolerance, setGestureSizeTolerance] = useState(0.3);
  const [showVisualRipple, setShowVisualRipple] = useState(false);
  const [successSound, setSuccessSound] = useState('success');
  const [showScreenFlash, setShowScreenFlash] = useState(false);
  const [screenFlashPattern, setScreenFlashPattern] = useState<ScreenFlashPattern>('single');
  const [showGestureComparison, setShowGestureComparison] = useState(false);
  const [comparisonAttempt, setComparisonAttempt] = useState<{
    id: string;
    label: string;
    confidence: number;
    timestamp: number;
  } | null>(null);
  const [shortcutActivated, setShortcutActivated] = useState<string | null>(null);
  const [showPipGuidance, setShowPipGuidance] = useState(false);
  const [pipGuidanceGesture, setPipGuidanceGesture] = useState<GestureModelEntry | null>(null);
  const [showPracticeSuggestion, setShowPracticeSuggestion] = useState(false);
  const [showAdaptiveLearning, setShowAdaptiveLearning] = useState(false);
  const [contextInsights] = useState<any>(null);
  const [detectedTwoHandGesture, setDetectedTwoHandGesture] = useState<DetectedTwoHandGesture | null>(null);
  const [currentLandmarks, setCurrentLandmarks] = useState<number[][][]>([]);
  const [currentHandedness, setCurrentHandedness] = useState<string[]>([]);

  return {
    profile,
    setProfile,
    status,
    setStatus,
    gestureConfidence,
    setGestureConfidence,
    error,
    setError,
    showCorrection,
    setShowCorrection,
    setSuggestions,
    gestureSuggestions,
    setGestureSuggestions,
    dialogContext,
    setDialogContext,
    pendingGesture,
    setPendingGesture,
    lastRecognizedGesture,
    setLastRecognizedGesture,
    facingMode,
    setFacingMode,
    webviewKey,
    setWebviewKey,
    webviewRetries,
    setWebviewRetries,
    recognitionPath,
    setRecognitionPath,
    showDgsVideo,
    setShowDgsVideo,
    showCelebration,
    setShowCelebration,
    celebrationKey,
    setCelebrationKey,
    screenReaderEnabled,
    setScreenReaderEnabled,
    modelUpdateStatus,
    setModelUpdateStatus,
    showMoodSelector,
    setShowMoodSelector,
    showLocationSelector,
    setShowLocationSelector,
    kindergartenMode,
    setKindergartenMode,
    bullyingProtectionActive,
    setBullyingProtectionActive,
    gestureSizeTolerance,
    setGestureSizeTolerance,
    showVisualRipple,
    setShowVisualRipple,
    successSound,
    setSuccessSound,
    showScreenFlash,
    setShowScreenFlash,
    screenFlashPattern,
    setScreenFlashPattern,
    showGestureComparison,
    setShowGestureComparison,
    comparisonAttempt,
    setComparisonAttempt,
    shortcutActivated,
    setShortcutActivated,
    showPipGuidance,
    setShowPipGuidance,
    pipGuidanceGesture,
    setPipGuidanceGesture,
    showPracticeSuggestion,
    setShowPracticeSuggestion,
    showAdaptiveLearning,
    setShowAdaptiveLearning,
    contextInsights,
    detectedTwoHandGesture,
    setDetectedTwoHandGesture,
    currentLandmarks,
    setCurrentLandmarks,
    currentHandedness,
    setCurrentHandedness,
  };
};

export type { RecognitionState as RecognitionStateType };