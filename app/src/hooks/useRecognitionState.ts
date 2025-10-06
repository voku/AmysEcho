import { useState, type Dispatch, type SetStateAction } from 'react';
import type { GestureModelEntry } from '../model';
import type { LLMSuggestionResponse } from '../services/dialogEngine';
import type { RecognitionPath } from '../utils/recognitionState';
import type { DetectedGestureMeaning } from '../services/gestureMeaningService';
import type { SequenceGestureMeaningDefinition } from '../constants/gestureMeanings';
import type { SequenceMatch } from '../services/gestureCombinationService';
import type { Profile } from '../storage';

export enum ScreenFlashPattern {
  Single = 'single',
  Double = 'double',
  Triple = 'triple',
  Pulse = 'pulse',
  Ripple = 'ripple',
  Wave = 'wave',
  Heartbeat = 'heartbeat',
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export interface RecognitionProfileState {
  profile: Profile | null;
  setProfile: Dispatch<SetStateAction<Profile | null>>;
  status: string;
  setStatus: Dispatch<SetStateAction<string>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  facingMode: 'user' | 'environment';
  setFacingMode: Dispatch<SetStateAction<'user' | 'environment'>>;
  screenReaderEnabled: boolean;
  setScreenReaderEnabled: Dispatch<SetStateAction<boolean>>;
  modelUpdateStatus: 'idle' | 'updating' | 'complete' | 'error';
  setModelUpdateStatus: Dispatch<SetStateAction<'idle' | 'updating' | 'complete' | 'error'>>;
}

export interface RecognitionGestureState {
  gestureConfidence: number;
  setGestureConfidence: Dispatch<SetStateAction<number>>;
  pendingGesture: string | null;
  setPendingGesture: Dispatch<SetStateAction<string | null>>;
  lastRecognizedGesture: GestureModelEntry | null;
  setLastRecognizedGesture: Dispatch<SetStateAction<GestureModelEntry | null>>;
  recognitionPath: RecognitionPath;
  setRecognitionPath: Dispatch<SetStateAction<RecognitionPath>>;
  setSuggestions: Dispatch<SetStateAction<LLMSuggestionResponse>>;
  gestureSuggestions: Array<{ id: string; label: string }>;
  setGestureSuggestions: Dispatch<
    SetStateAction<Array<{ id: string; label: string }>>
  >;
  dialogContext: string[];
  setDialogContext: Dispatch<SetStateAction<string[]>>;
  gestureSizeTolerance: number;
  setGestureSizeTolerance: Dispatch<SetStateAction<number>>;
  contextInsights: any;
  setContextInsights: Dispatch<SetStateAction<any>>;
  detectedGestureMeaning: DetectedGestureMeaning | null;
  setDetectedGestureMeaning: Dispatch<SetStateAction<DetectedGestureMeaning | null>>;
  sequenceMeaning: SequenceGestureMeaningDefinition | null;
  setSequenceMeaning: Dispatch<SetStateAction<SequenceGestureMeaningDefinition | null>>;
  sequenceMatch: SequenceMatch | null;
  setSequenceMatch: Dispatch<SetStateAction<SequenceMatch | null>>;
  currentLandmarks: number[][][];
  setCurrentLandmarks: Dispatch<SetStateAction<number[][][]>>;
  currentHandedness: string[];
  setCurrentHandedness: Dispatch<SetStateAction<string[]>>;
}

export interface RecognitionFeedbackState {
  showCorrection: boolean;
  setShowCorrection: Dispatch<SetStateAction<boolean>>;
  showVisualRipple: boolean;
  setShowVisualRipple: Dispatch<SetStateAction<boolean>>;
  successSound: string;
  setSuccessSound: Dispatch<SetStateAction<string>>;
  showScreenFlash: boolean;
  setShowScreenFlash: Dispatch<SetStateAction<boolean>>;
  screenFlashPattern: ScreenFlashPattern;
  setScreenFlashPattern: Dispatch<SetStateAction<ScreenFlashPattern>>;
  shortcutActivated: string | null;
  setShortcutActivated: Dispatch<SetStateAction<string | null>>;
  showPracticeSuggestion: boolean;
  setShowPracticeSuggestion: Dispatch<SetStateAction<boolean>>;
  showAdaptiveLearning: boolean;
  setShowAdaptiveLearning: Dispatch<SetStateAction<boolean>>;
}

export interface RecognitionSessionState {
  webviewKey: number;
  setWebviewKey: Dispatch<SetStateAction<number>>;
  webviewRetries: number;
  setWebviewRetries: Dispatch<SetStateAction<number>>;
  showDgsVideo: boolean;
  setShowDgsVideo: Dispatch<SetStateAction<boolean>>;
  showCelebration: boolean;
  setShowCelebration: Dispatch<SetStateAction<boolean>>;
  celebrationKey: number;
  setCelebrationKey: Dispatch<SetStateAction<number>>;
  bullyingProtectionActive: boolean;
  setBullyingProtectionActive: Dispatch<SetStateAction<boolean>>;
}

export interface RecognitionState
  extends RecognitionProfileState,
    RecognitionGestureState,
    RecognitionFeedbackState,
    RecognitionSessionState {}

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
  const [bullyingProtectionActive, setBullyingProtectionActive] = useState(false);
  const [gestureSizeTolerance, setGestureSizeTolerance] = useState(0.3);
  const [showVisualRipple, setShowVisualRipple] = useState(false);
  const [successSound, setSuccessSound] = useState('success');
  const [showScreenFlash, setShowScreenFlash] = useState(false);
  const [screenFlashPattern, setScreenFlashPattern] = useState<ScreenFlashPattern>(
    ScreenFlashPattern.Single,
  );
  const [shortcutActivated, setShortcutActivated] = useState<string | null>(null);
  const [showPracticeSuggestion, setShowPracticeSuggestion] = useState(false);
  const [showAdaptiveLearning, setShowAdaptiveLearning] = useState(false);
  const [contextInsights, setContextInsights] = useState<any>(null);
  const [detectedGestureMeaning, setDetectedGestureMeaning] = useState<DetectedGestureMeaning | null>(null);
  const [sequenceMeaning, setSequenceMeaning] = useState<SequenceGestureMeaningDefinition | null>(null);
  const [sequenceMatch, setSequenceMatch] = useState<SequenceMatch | null>(null);
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
    shortcutActivated,
    setShortcutActivated,
    showPracticeSuggestion,
    setShowPracticeSuggestion,
    showAdaptiveLearning,
    setShowAdaptiveLearning,
    contextInsights,
    setContextInsights,
    detectedGestureMeaning,
    setDetectedGestureMeaning,
    sequenceMeaning,
    setSequenceMeaning,
    sequenceMatch,
    setSequenceMatch,
    currentLandmarks,
    setCurrentLandmarks,
    currentHandedness,
    setCurrentHandedness,
  };
};

export type { RecognitionState as RecognitionStateType };