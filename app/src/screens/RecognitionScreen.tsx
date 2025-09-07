import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Easing,
  Button,
  Switch,
  AccessibilityInfo,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NavigationProp } from '@react-navigation/native';
import { useAccessibility } from '../components/AccessibilityContext';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import CorrectionPanel from '../components/CorrectionPanel';
import { COLORS, SPACING } from '../constants/ui';
import { logger } from '../utils/logger';
import {
  audioService,
  triggerSpeakAndShow,
  correctionService,
  dialogEngine,
  announceGestureRecognition,
  gestureSuggester,
} from '../services';
import { loadProfile, Profile } from '../storage';
import { gestureModel, GestureModelEntry } from '../model';
import { buildLocalCentroids } from '../services/localCentroids';
import { classifyWithCentroids } from '../services/offlineClassifier';
import type { CentroidMap, Point } from '../services/dgsModelClient';
import { LLMSuggestionResponse } from '../services/dialogEngine';
import { flattenHandsWithHandedness } from '../services/handUtils';
import { OFFLINE_CLASSIFIER_TRIGGER_THRESHOLD } from '../constants/gesture';
import { logInteractionEvent } from '../services/analytics';
import { logHIPEvent } from '../services/hipEvents';
import { OneEuroFilter } from '../services/OneEuroFilter';
import { SequenceRecognizer, SequenceDefinition } from '../services/sequenceRecognizer';
import { RecognitionPath } from '../utils/recognitionState';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import { LanguageManager } from '../services/LanguageManager';
import Celebration, { CELEBRATION_DURATION_MS } from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { onMlpModelUpdated } from '../services/dgsModelClient';
import { emergencyRollback } from '../services/modelUpdate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import MoodSelector from '../components/MoodSelector';
import VisualRipple from '../components/VisualRipple';
import ScreenFlash from '../components/ScreenFlash';
import GestureComparison from '../components/GestureComparison';
import type { RootStackParamList } from '../navigation/types';

const FEEDBACK_THROTTLE_MS = 2000;
const FRAME_INTERVAL_MS = 1000 / 8;
// CELEBRATION_DURATION_MS sourced from Celebration.tsx sequence

export default function RecognitionScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'Recognition'>;
}) {
  const { largeText } = useAccessibility();
  const { setMessage } = useMessage();
  const { getSuccessMessage } = useThemeMessages();
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
  const [bullyingProtectionActive, setBullyingProtectionActive] = useState(false);
  const [gestureSizeTolerance, setGestureSizeTolerance] = useState(0.3);
  const [showVisualRipple, setShowVisualRipple] = useState(false);
  const [successSound, setSuccessSound] = useState('success');
  const [showScreenFlash, setShowScreenFlash] = useState(false);
  const [screenFlashPattern, setScreenFlashPattern] = useState<'single' | 'double' | 'triple' | 'pulse'>('single');
  const [showGestureComparison, setShowGestureComparison] = useState(false);
  const [comparisonAttempt, setComparisonAttempt] = useState<{id: string; label: string; confidence: number; timestamp: number} | null>(null);
  const [shortcutActivated, setShortcutActivated] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;
  const confidenceFilterRef = useRef(new OneEuroFilter(1.2, 0.007, 1.0));
  const labelHistoryRef = useRef<string[]>([]);
  const seqDefsRef = useRef<SequenceDefinition[]>([
    { id: 'more_please', pattern: ['more', 'please'], windowMs: 3000 },
  ]);
  const seqRef = useRef(new SequenceRecognizer(seqDefsRef.current));
  const uncertainCountRef = useRef(0);
  const lastUncertainAtRef = useRef<number>(0);
  const lastSuccessAtRef = useRef<number>(0);
  const lastGestureIdRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _lastErrorFeedbackAtRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const centroidsRef = useRef<CentroidMap>({});
  const consecutiveFailuresRef = useRef<number>(0);
  const lastModelUpdateTimeRef = useRef<number>(0);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  useEffect(() => {
    // Load Amy's selected success sound
    const loadSuccessSound = async () => {
      try {
        const sound = await AsyncStorage.getItem('selectedSuccessSound');
        if (sound) {
          setSuccessSound(sound);
        }
      } catch (error) {
        logger.debug('No custom success sound set, using default');
      }
    };
    loadSuccessSound();
  }, []);

  useEffect(() => {
    buildLocalCentroids()
      .then((c) => {
        logger.info(`Built ${Object.keys(c).length} local centroids`);
        centroidsRef.current = c;
      })
      .catch((error) => { logger.warn('Failed to build local centroids:', error); });
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unsub = onMlpModelUpdated(() => {
      setMessage('Neues Modell geladen');
      timeoutId = setTimeout(() => setMessage(null), 2000);
    });
    return () => {
      unsub();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [setMessage]);

  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startFeedbackAnimation = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    symbolScaleAnim.setValue(0);
    Animated.spring(symbolScaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();

    setCelebrationKey((k) => k + 1);
    setShowCelebration(true);
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
    }
    celebrationTimeoutRef.current = setTimeout(() => setShowCelebration(false), CELEBRATION_DURATION_MS);
  }, [fadeAnim, symbolScaleAnim]);

  // Enhanced gesture shortcut system for quick navigation - Amy First
  const getGestureShortcut = useCallback((gestureId: string): string | null => {
    const shortcuts: Record<string, string> = {
      // Core navigation shortcuts
      'help': 'help_screen',
      'training': 'training_screen',
      'practice': 'practice_screen',
      'parent': 'parent_screen',
      'correction': 'correction_screen',
      'profile': 'profile_screen',
      'dashboard': 'dashboard_screen',
      'progress': 'progress_screen',

      // Schedule and planning shortcuts
      'schedule': 'schedule_screen',
      'plan': 'schedule_screen',
      'tagesplan': 'schedule_screen',

      // Success and celebration shortcuts
      'success': 'celebration_mode',
      'good': 'celebration_mode',
      'gut': 'celebration_mode',

      // Enhanced shortcuts for Amy's needs
      'finished': 'home_screen', // Return to main recognition
      'fertig': 'home_screen',   // German version
      'done': 'home_screen',     // English version
      'home': 'home_screen',     // Direct home
      'yes': 'confirm_action',   // Confirm current action
      'no': 'cancel_action',     // Cancel current action
      'ja': 'confirm_action',    // German yes
      'nein': 'cancel_action',   // German no
      'more': 'repeat_last',     // Repeat last successful gesture
      'nochmal': 'repeat_last',  // German version
      'again': 'repeat_last',    // English version
      'play': 'play_mode',       // Switch to play/learning mode
      'spielen': 'play_mode',    // German version
      'game': 'play_mode',       // English version

      // Quick action shortcuts
      'stop': 'stop_current',
      'pause': 'pause_current',
      'start': 'start_current',
      'next': 'next_item',
      'back': 'previous_item',
    };
    return shortcuts[gestureId] || null;
  }, []);



  const getShortcutMessage = useCallback((action: string): string => {
    const messages: Record<string, string> = {
      // Core navigation shortcuts
      'help_screen': '🆘 Öffne Hilfeseite',
      'training_screen': '🎯 Starte Training',
      'practice_screen': '✨ Starte Übung',
      'parent_screen': '👨‍👩‍👧 Öffne Elternbereich',
      'correction_screen': '🔧 Öffne Korrektur',
      'profile_screen': '👤 Öffne Profile',
      'dashboard_screen': '📊 Öffne Auswertung',
      'progress_screen': '📈 Öffne Fortschritt',
      'schedule_screen': '📅 Öffne Tagesplan',

      // Celebration and success shortcuts
      'celebration_mode': '🎉 Super gemacht! Du bist toll!',

      // Enhanced shortcuts for Amy's needs
      'home_screen': '🏠 Du bist bereits zu Hause!',
      'confirm_action': '✅ Aktion bestätigt!',
      'cancel_action': '❌ Aktion abgebrochen',
      'repeat_last': '🔄 Letzte Geste wiederholt',
      'play_mode': '🎮 Spielmodus aktiviert!',

      // Quick action shortcuts
      'stop_current': '⏹️ Aktivität gestoppt',
      'pause_current': '⏸️ Aktivität pausiert',
      'start_current': '▶️ Aktivität gestartet',
      'next_item': '⏭️ Nächstes Element',
      'previous_item': '⏮️ Vorheriges Element',
    };
    return messages[action] || '⚡ Schnellaktion ausgeführt';
  }, []);

  const provideInstantFeedback = useCallback(async (
    gesture: string,
    confidence: number,
    isSuccessful: boolean,
  ) => {
    // Amy First: Always provide immediate, positive feedback for every gesture attempt
    if (isSuccessful) {
      // Successful gesture - full celebration
      const entry = (gestureModel.gestures.find((g) => g.id === gesture) || { id: gesture, label: gesture }) as GestureModelEntry;
      const localizedLabel = LanguageManager.getGestureLabel(entry.id);
      const labelForUser = localizedLabel !== `gestures.${entry.id}` ? localizedLabel : entry.label;

      if (!screenReaderEnabled) {
        void triggerSpeakAndShow(labelForUser, confidence, startFeedbackAnimation);

        // Use Amy's selected success sound (from profile or global setting)
        const selectedSound = profile?.successSound || successSound || 'success';
        void audioService.playSound(selectedSound, { volume: 0.8 });
      }
      announceGestureRecognition(labelForUser, confidence);
    } else {
      // Amy First: Every attempt deserves positive reinforcement
      if (!screenReaderEnabled) {
        // Provide gentle but noticeable haptic feedback for all attempts
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // Play encouraging sound for every attempt
        void audioService.playSound('confirmation', { volume: 0.5 });
      }

      // Always show encouraging messages - never discourage Amy
      const encouragingMessage = getSuccessMessage();
      setStatus(encouragingMessage);

      // Visual feedback - positive animation for every attempt
      fadeAnim.setValue(0.7);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [screenReaderEnabled, startFeedbackAnimation, fadeAnim, profile?.successSound, successSound]);

  // Helper function to map gestures to shortcut actions
  const getShortcutAction = useCallback((gesture: string): string | null => {
    const shortcutMap: Record<string, string> = {
      // Navigation shortcuts
      'help': 'help_screen',
      'hilfe': 'help_screen',
      'learn': 'training_screen',
      'lernen': 'training_screen',
      'practice': 'practice_screen',
      'üben': 'practice_screen',
      'übung': 'practice_screen',
      'parent': 'parent_screen',
      'eltern': 'parent_screen',
      'mama': 'parent_screen',
      'papa': 'parent_screen',
      'correct': 'correction_screen',
      'korrigieren': 'correction_screen',
      'richtig': 'correction_screen',
      'profile': 'profile_screen',
      'profil': 'profile_screen',
      'settings': 'profile_screen',
      'einstellungen': 'profile_screen',
      'dashboard': 'dashboard_screen',
      'stats': 'dashboard_screen',
      'statistik': 'dashboard_screen',
      'progress': 'progress_screen',
      'fortschritt': 'progress_screen',
      'schedule': 'schedule_screen',
      'plan': 'schedule_screen',
      'tagesplan': 'schedule_screen',

      // Action shortcuts
      'celebration': 'celebration_mode',
      'feiern': 'celebration_mode',
      'home': 'home_screen',
      'haus': 'home_screen',
      'confirm': 'confirm_action',
      'bestätigen': 'confirm_action',
      'ja': 'confirm_action',
      'cancel': 'cancel_action',
      'abbrechen': 'cancel_action',
      'nein': 'cancel_action',
      'repeat': 'repeat_last',
      'wiederholen': 'repeat_last',
      'nochmal': 'repeat_last',
      'play': 'play_mode',
      'spielen': 'play_mode',
      'spiel': 'play_mode',
      'stop': 'stop_current',
      'anhalten': 'stop_current',
      'pause': 'pause_current',
      'pausieren': 'pause_current',
      'start': 'start_current',
      'beginnen': 'start_current',
      'next': 'next_item',
      'nächste': 'next_item',
      'weiter': 'next_item',
      'previous': 'previous_item',
      'vorherige': 'previous_item',
      'zurück': 'previous_item',
    };

    return shortcutMap[gesture] || null;
  }, []);

  // Helper function to get user-friendly display name for shortcuts
  const getShortcutDisplayName = useCallback((action: string): string => {
    const displayNames: Record<string, string> = {
      'help_screen': 'Hilfe',
      'training_screen': 'Lernen',
      'practice_screen': 'Üben',
      'parent_screen': 'Elternbereich',
      'correction_screen': 'Korrektur',
      'profile_screen': 'Profile',
      'dashboard_screen': 'Auswertung',
      'progress_screen': 'Fortschritt',
      'schedule_screen': 'Tagesplan',
      'celebration_mode': 'Feiermodus',
      'home_screen': 'Startseite',
      'confirm_action': 'Bestätigung',
      'cancel_action': 'Abbruch',
      'repeat_last': 'Wiederholung',
      'play_mode': 'Spielmodus',
      'stop_current': 'Stopp',
      'pause_current': 'Pause',
      'start_current': 'Start',
      'next_item': 'Nächstes',
      'previous_item': 'Vorheriges',
    };

    return displayNames[action] || action;
  }, []);

  const executeGestureShortcut = useCallback(async (
    action: string,
    navigation: any,
    profileId: string
  ) => {
    switch (action) {
      // Core navigation shortcuts
      case 'help_screen':
        navigation.navigate('Help', { profileId });
        break;
      case 'training_screen':
        navigation.navigate('Training', { gestureLabel: undefined, profileId });
        break;
      case 'practice_screen':
        navigation.navigate('Practice', { profileId });
        break;
      case 'parent_screen':
        navigation.navigate('Parent');
        break;
      case 'correction_screen':
        navigation.navigate('Correction', { profileId });
        break;
      case 'profile_screen':
        navigation.navigate('ProfileSelect');
        break;
      case 'dashboard_screen':
        navigation.navigate('Dashboard', { profileId });
        break;
      case 'progress_screen':
        navigation.navigate('Progress', { profileId });
        break;
      case 'schedule_screen':
        navigation.navigate('Schedule', { profileId });
        break;
      case 'celebration_mode':
        // Trigger celebration for positive reinforcement
        setShowCelebration(true);
        setCelebrationKey(prev => prev + 1);
        setStatus('🎉 Super gemacht! Du bist toll!');
        break;

      // Enhanced shortcuts for Amy's needs
      case 'home_screen':
        // Already on recognition screen, just provide feedback
        setStatus('🏠 Du bist bereits auf der Hauptseite!');
        break;
      case 'confirm_action':
        // Confirm current pending action
        if (pendingGesture) {
          setStatus('✅ Aktion bestätigt!');
          setPendingGesture(null);
        } else {
          setStatus('ℹ️ Keine Aktion zum Bestätigen');
        }
        break;
      case 'cancel_action':
        // Cancel current pending action
        if (pendingGesture) {
          setStatus('❌ Aktion abgebrochen');
          setPendingGesture(null);
        } else {
          setStatus('ℹ️ Keine Aktion zum Abbrechen');
        }
        break;
      case 'repeat_last':
        // Repeat last successful gesture
        if (lastRecognizedGesture) {
          setStatus(`🔄 Wiederhole: ${lastRecognizedGesture.label}`);
          // Trigger feedback for the repeated gesture
          void provideInstantFeedback(lastRecognizedGesture.id, 1.0, true);
        } else {
          setStatus('ℹ️ Keine vorherige Geste zum Wiederholen');
        }
        break;
      case 'play_mode':
        // Switch to playful learning mode
        navigation.navigate('Practice', { profileId });
        setStatus('🎮 Spielmodus aktiviert!');
        break;
      case 'stop_current':
        // Stop current activity
        setStatus('⏹️ Aktivität gestoppt');
        break;
      case 'pause_current':
        // Pause current activity
        setStatus('⏸️ Aktivität pausiert');
        break;
      case 'start_current':
        // Start/resume activity
        setStatus('▶️ Aktivität gestartet');
        break;
      case 'next_item':
        // Go to next item
        setStatus('⏭️ Nächstes Element');
        break;
      case 'previous_item':
        // Go to previous item
        setStatus('⏮️ Vorheriges Element');
        break;
    }
  }, [pendingGesture, lastRecognizedGesture, provideInstantFeedback]);

  useEffect(() => {
    // Track screen reader to avoid overlapping TTS and accessibility announcements
    AccessibilityInfo.isScreenReaderEnabled
      ?.()
      .then(setScreenReaderEnabled)
      .catch((error) =>
        logger.warn('Failed to check if screen reader is enabled:', error),
      );
    const sub = AccessibilityInfo.addEventListener?.(
      'screenReaderChanged',
      setScreenReaderEnabled,
    );
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    // Check bullying protection status
    const checkBullyingProtection = async () => {
      try {
        const protectionEnabled = await AsyncStorage.getItem('bullyingProtectionEnabled');
        const isTrustedDevice = await AsyncStorage.getItem('trustedDeviceId');

        if (protectionEnabled === 'true' && !isTrustedDevice) {
          setBullyingProtectionActive(true);
          setStatus('🔒 Gerät ist nicht vertrauenswürdig. Bitte wende dich an einen Betreuer.');
        } else {
          setBullyingProtectionActive(false);
        }

        // Load gesture size tolerance
        const toleranceStr = await AsyncStorage.getItem('gestureSizeTolerance');
        if (toleranceStr) {
          setGestureSizeTolerance(parseFloat(toleranceStr));
        }
      } catch (error) {
        logger.warn('Failed to check bullying protection:', error);
      }
    };

    checkBullyingProtection();
  }, []);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, []);

  const handleGestureDetected = useCallback(async (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    emergency = false,
  ) => {
    // Initialize variables from parameters
    let g = gesture;
    let c = confidence;
    let path: RecognitionPath = 'local';

    // Amy First: Provide haptic feedback for EVERY detected hand movement
    // This gives Amy immediate sensory confirmation that her gesture was detected
    if (!screenReaderEnabled) {
      try {
        // Use light haptic for regular gestures, medium for successful recognition
        const hapticStyle = g && c > 0.5
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
        void Haptics.impactAsync(hapticStyle);
      } catch (error) {
        // Silently fail haptic feedback - don't interrupt gesture processing
        logger.debug('Haptic feedback failed:', error);
      }
    }

    // Amy First: Show visual ripple effect for EVERY detected hand movement
    // This provides clear visual feedback that gesture processing is happening
    setShowVisualRipple(true);
    setTimeout(() => setShowVisualRipple(false), 800); // Match ripple duration

    // Amy First: Check for navigation shortcut gestures
    // These allow Amy to navigate quickly without using menus
    if (g && c > 0.7) { // Only trigger shortcuts for confident detections
      const shortcutAction = getShortcutAction(g);
      if (shortcutAction) {
        logger.info(`Gesture shortcut triggered: ${g} -> ${shortcutAction}`);
        setShortcutActivated(shortcutAction);

        // Execute the shortcut action
        void executeGestureShortcut(shortcutAction, navigation, profile?.id || 'default');

        // Provide immediate feedback
        setStatus(`🔄 Gehe zu ${getShortcutDisplayName(shortcutAction)}`);
        return; // Don't process as regular gesture
      }
    }

    // Amy First: Trigger screen flash for successful gestures in quiet environments
    // This provides LED-like visual feedback without audio
    if (g && c > 0.7) {
      setShowScreenFlash(true);
      setScreenFlashPattern('double'); // Double flash for successful gestures
      setTimeout(() => setShowScreenFlash(false), 600);
    }
    // Bullying protection: block gesture processing on untrusted devices
    if (bullyingProtectionActive && !emergency) {
      return;
    }

    // Emergency gestures bypass all throttling and processing delays
    const ts = Date.now();
    if (!emergency && ts - lastFrameTimeRef.current < FRAME_INTERVAL_MS) {
      return;
    }
    lastFrameTimeRef.current = ts;

    if (
      centroidsRef.current &&
      Object.keys(centroidsRef.current).length > 0 &&
      (!g || c < OFFLINE_CLASSIFIER_TRIGGER_THRESHOLD)
    ) {
      const flat = flattenHandsWithHandedness(landmarks, handedness);
      const pts: Point[] = flat.map(([x, y, z]) => [x, y, z ?? 0] as Point);
      const res = classifyWithCentroids(pts, centroidsRef.current);
      if (res && res.confidence > c) {
        g = res.label;
        c = res.confidence;
        path = 'centroid';
      }
    }
    setRecognitionPath((prev) => (prev === path ? prev : path));

    // Helper to apply a classification to UI + logs
    const handleOutcome = async (
      finalGesture: string,
      finalConfidence: number,
      processedBy: RecognitionPath,
      landmarks: number[][][],
      handedness: string[],
    ) => {
      // Smooth confidence and label
      const smoothed = confidenceFilterRef.current.filter(
        Math.max(0, Math.min(1, finalConfidence)),
        Date.now() / 1000,
      );
      const hist = labelHistoryRef.current;
      hist.push(finalGesture);
      if (hist.length > 5) hist.shift();
      const freq = hist.reduce<Record<string, number>>((acc, g) => {
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      }, {});
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      const stableGesture = top && top[1] >= 3 ? top[0] : finalGesture;

        setGestureConfidence(smoothed);
        setError(null);
        uncertainCountRef.current = 0;
        consecutiveFailuresRef.current = 0; // Reset failure counter on successful recognition

      // Amy First: Lower threshold for imperfect gestures (22q11 syndrome)
      if (smoothed > 0.5 && stableGesture !== 'unknown') {
        const entry = (gestureModel.gestures.find((g) => g.id === stableGesture) || { id: stableGesture, label: stableGesture }) as GestureModelEntry;
        const now = Date.now();
        const shouldProvideFeedback =
          lastGestureIdRef.current !== entry.id ||
          now - lastSuccessAtRef.current > FEEDBACK_THROTTLE_MS;

        lastGestureIdRef.current = entry.id;
        setLastRecognizedGesture(entry);
        setStatus(entry.label);



        if (shouldProvideFeedback) {
          lastSuccessAtRef.current = now;
          const localizedLabel = LanguageManager.getGestureLabel(entry.id);
          const labelForUser =
            localizedLabel !== `gestures.${entry.id}` ? localizedLabel : entry.label;
          if (!screenReaderEnabled) {
            void triggerSpeakAndShow(labelForUser, smoothed, startFeedbackAnimation);
          }
          announceGestureRecognition(labelForUser, smoothed);
        }

        // Provide instant feedback for successful gesture
        void provideInstantFeedback(stableGesture, smoothed, true);

        // Log success
        logInteractionEvent({
          gestureDefinitionId: entry.id,
          gestureName: entry.label,
          wasSuccessful: true,
          confidenceScore: smoothed,
          timestamp: Date.now(),
          processedBy,
        }).catch(() => {});

        try {
          const adv = await dialogEngine.getSuggestions({
            input: entry.label,
            context: dialogContext,
            language: 'de',
            age: 4,
          });
          setSuggestions(adv);
          setDialogContext((ctx) => {
            const next = [...ctx, entry.label];
            return next.slice(-5);
          });
        } catch (error) {
          logger.warn('Failed to get LLM suggestions:', error);
        }

        // Sequence recognition (non-blocking): if a sequence matches, provide gentle feedback
        try {
          const seqId = seqRef.current.push(entry.id);
          if (seqId) {
            void logHIPEvent('HIP_2', 'sequence_detected', { sequence: seqId });
            // Optional extra cue without altering primary status
            void audioService.playSound('celebration', { volume: 0.4 });
          }
        } catch {}
      } else {
        setStatus('Ich bin mir nicht sicher. Bitte versuche es erneut.');
        setPendingGesture(stableGesture);
        // Only open correction after several consecutive uncertain frames
        const now = Date.now();
        if (now - lastUncertainAtRef.current > 1500) {
          uncertainCountRef.current = 0;
        }
        lastUncertainAtRef.current = now;
        uncertainCountRef.current += 1;

        // Track consecutive recognition failures for emergency rollback
        consecutiveFailuresRef.current += 1;

        // Trigger emergency rollback if too many consecutive failures after recent model update
        if (consecutiveFailuresRef.current >= 10 &&
            now - lastModelUpdateTimeRef.current < 5 * 60 * 1000) { // Within 5 minutes of update
          logger.warn('Triggering emergency rollback due to consecutive recognition failures');
          emergencyRollback().then(success => {
            if (success) {
              setStatus('Modell zurückgesetzt. Erkennung läuft weiter.');
              consecutiveFailuresRef.current = 0;
              setTimeout(() => setStatus('Ich höre zu…'), 3000);
            }
          }).catch(err => {
            logger.error('Emergency rollback failed', err);
          });
        }
        if (!showCorrection && uncertainCountRef.current >= 3) {
          // Generate auto-suggestions before showing correction panel
          const gestureContext = {
            recentGestures: labelHistoryRef.current,
            timeOfDay: new Date().getHours() * 60 + new Date().getMinutes(),
            confidence: smoothed,
            landmarks: landmarks,
            handedness: handedness,
          };

          const autoSuggestions = gestureSuggester.getSuggestions(
            stableGesture,
            gestureContext,
            3
          );

          // Convert suggestions to the format expected by CorrectionPanel
          const formattedSuggestions = autoSuggestions.map((s: any) => ({
            id: s.id,
            label: s.label,
          }));

          setGestureSuggestions(formattedSuggestions);
          setShowCorrection(true);
          uncertainCountRef.current = 0;

          // Log auto-suggestions
          void logHIPEvent('HIP_3', 'auto_suggestions_generated', {
            suggestionCount: autoSuggestions.length,
            failedGesture: stableGesture,
            suggestions: autoSuggestions.map(s => s.id),
          });
        }

        // Provide instant feedback for unsuccessful gesture attempt
        void provideInstantFeedback(stableGesture, smoothed, false);

        // HIP 3: opened correction/uncertainty path
        void logHIPEvent('HIP_3', 'help_me_opened', { suggestionFor: finalGesture });
        // Log failure for the incoming gesture id (could be 'unknown')
        const id = (gestureModel.gestures.find((g) => g.id === stableGesture)?.id) || stableGesture || 'unknown';
        logInteractionEvent({
          gestureDefinitionId: id,
          gestureName: stableGesture,
          wasSuccessful: false,
          confidenceScore: smoothed,
          timestamp: Date.now(),
          processedBy,
        }).catch(() => {});
      }
    };

    // Emergency gestures get immediate priority processing
    if (emergency && g) {
      const entry = (gestureModel.gestures.find((ges) => ges.id === g) || { id: g, label: g }) as GestureModelEntry;
      const localizedLabel = LanguageManager.getGestureLabel(entry.id);
      const labelForUser = localizedLabel !== `gestures.${entry.id}` ? localizedLabel : entry.label;

      // Immediate audio feedback for emergency gestures
      void audioService.speak(labelForUser);
      void audioService.playSound('success', { volume: 0.8 });

      // Log emergency gesture detection
      logInteractionEvent({
        gestureDefinitionId: entry.id,
        gestureName: entry.label,
        wasSuccessful: true,
        confidenceScore: c,
        timestamp: Date.now(),
        processedBy: 'local',
      }).catch(() => {});

      // Update UI immediately
      setLastRecognizedGesture(entry);
      setStatus(`🚨 ${labelForUser} - Notfall erkannt!`);
      setGestureConfidence(c);
      setError(null);

      // Provide instant feedback for emergency gesture
      void provideInstantFeedback(entry.id, c, true);

      // Trigger emergency response
      void logHIPEvent('HIP_1', 'emergency_gesture_detected', {
        gesture: entry.id,
        confidence: c,
        timestamp: ts
      });

      return; // Skip normal processing for emergency gestures
    }

    // On-device classification only: use provided or locally-classified gesture
    await handleOutcome(g || 'unknown', c, path, landmarks, handedness);
  }, [
    dialogContext,
    startFeedbackAnimation,
    screenReaderEnabled,
    bullyingProtectionActive,
    executeGestureShortcut,
    getGestureShortcut,
    getShortcutMessage,
    navigation,
    profile?.id,
    provideInstantFeedback,
    showCorrection,
  ]);

  const handleModelUpdateStatus = useCallback((status: 'idle' | 'updating' | 'complete' | 'error') => {
    setModelUpdateStatus(status);
    if (status === 'updating') {
      setStatus('Modell wird im Hintergrund aktualisiert...');
    } else if (status === 'complete') {
      lastModelUpdateTimeRef.current = Date.now(); // Track when model was updated
      setStatus('Neues Modell geladen! Erkennung läuft weiter.');
      // Clear status after a short delay
      setTimeout(() => {
        if (modelUpdateStatus === 'complete') {
          setStatus('Ich höre zu…');
        }
      }, 3000);
    } else if (status === 'error') {
      setStatus('Modell-Update hatte Probleme, aber Erkennung läuft weiter.');
      setTimeout(() => {
        if (modelUpdateStatus === 'error') {
          setStatus('Ich höre zu…');
        }
      }, 3000);
    }
  }, [modelUpdateStatus]);

  const handlePartialFeedback = useCallback((gesture: string, completion: number, feedback: string) => {
    // Show encouraging feedback for partial gestures
    const completionPercent = Math.round(completion * 100);
    setStatus(`${feedback} (${completionPercent}% fertig)`);

    // Clear feedback after a short delay
    setTimeout(() => {
      setStatus('Ich höre zu…');
    }, 2500);
  }, []);

  const handleStabilityFeedback = useCallback((isStable: boolean, stabilityScore: number, feedback: string) => {
    // Only show stability feedback if hand is detected and not stable
    if (!isStable && feedback) {
      setStatus(feedback);
      // Clear stability feedback after a short delay
      setTimeout(() => {
        setStatus('Ich höre zu…');
      }, 2000);
    }
  }, []);

  const handleGestureError = useCallback((errorMessage: string) => {
    // Amy First: Log technical errors for caregivers but NEVER show them to Amy
    logger.warn('Gesture detection warning (hidden from user):', errorMessage);

    // Always show encouraging, child-friendly messages regardless of error type
    // Use different messages to keep it engaging and avoid repetition
    const encouragingMessages = [
      'Das hat nicht geklappt. Probier\'s einfach nochmal!',
      'Versuch\'s nochmal! Du schaffst das!',
      'Das war knapp! Lass es uns nochmal versuchen!',
      'Ich bin gleich bereit. Probier\'s einfach nochmal!',
      'Das hat nicht funktioniert. Aber beim nächsten Mal klappt\'s!',
      'Lass uns das nochmal zusammen machen!',
    ];

    const randomMessage = encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];
    setStatus(randomMessage);

    // Clear any lingering error state
    setError(null);

    // Provide haptic feedback for errors (gentle, not alarming)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Amy First: Auto-recover from common errors by resetting WebView
    if (/Recognizer init failed|Camera error|gesture_processing_error/i.test(errorMessage)) {
      const newRetries = webviewRetries + 1;
      setWebviewRetries(newRetries);

      if (newRetries <= 3) { // Limit retries to prevent infinite loops
        setTimeout(() => {
          setWebviewKey(prev => prev + 1); // Force WebView reload
          setStatus('Ich starte neu…'); // Show recovery message
          setTimeout(() => setStatus('Ich höre zu…'), 1000); // Reset to listening state
        }, 2000); // Give user time to see encouraging message
      } else {
        // After 3 retries, show a different message and don't auto-retry
        setStatus('Lass uns eine Pause machen und später weitermachen!');
        setWebviewRetries(0); // Reset retry counter for next session
      }
    }

    // Log error for caregiver analytics (but don't show to Amy)
    void logHIPEvent('HIP_3', 'gesture_error_hidden', {
      errorType: errorMessage.substring(0, 100), // Truncate for privacy
      timestamp: Date.now(),
      userImpact: 'none', // Amy never sees technical errors
      recoveryMessage: randomMessage,
      autoRecovery: /Recognizer init failed|Camera error|gesture_processing_error/i.test(errorMessage)
    });
  }, []);

  const handleSelectCorrection = async (choiceId: string) => {
    if (pendingGesture) {
      await correctionService.logCorrection(choiceId);
      // HIP 3: correction submitted
      void logHIPEvent('HIP_3', 'correction_submitted', { actual: choiceId, predicted: pendingGesture });

      // Amy First: Show encouraging gesture comparison instead of just correction
      const correctGesture = gestureModel.gestures.find(g => g.id === choiceId);
      if (correctGesture) {
        setComparisonAttempt({
          id: pendingGesture,
          label: gestureModel.gestures.find(g => g.id === pendingGesture)?.label || pendingGesture,
          confidence: gestureConfidence,
          timestamp: Date.now()
        });
        setShowGestureComparison(true);
      }
    }
    setShowCorrection(false);
    setPendingGesture(null);
    setStatus('Danke, dass du es mir beigebracht hast!');
  };

  const handleCancelCorrection = () => {
    setShowCorrection(false);
    setPendingGesture(null);
    setStatus('Ich höre zu…');
  };

  const handleCloseComparison = () => {
    setShowGestureComparison(false);
    setComparisonAttempt(null);
    setStatus('Ich höre zu…');
  };

  const handleTryAgainFromComparison = () => {
    setShowGestureComparison(false);
    setComparisonAttempt(null);
    setStatus('Versuch\'s nochmal! Du schaffst das!');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.backgroundStart,
    },
    cameraContainer: {
      flex: 1,
      borderRadius: 0,
      overflow: 'hidden',
      margin: 0,
      position: 'relative',
    },
    gestureInfo: {
      position: 'absolute',
      bottom: SPACING.lg,
      left: SPACING.md,
      right: SPACING.md,
      padding: SPACING.md,
      backgroundColor: '#000A',
      borderRadius: SPACING.md,
      alignItems: 'center',
    },
    gestureText: {
      fontSize: largeText ? 22 : 18,
      fontWeight: 'bold',
      color: COLORS.text,
    },
    confidenceText: {
      fontSize: largeText ? 16 : 14,
      color: COLORS.textMuted,
      marginTop: SPACING.sm,
    },
    statusText: {
      position: 'absolute',
      top: SPACING.md,
      left: SPACING.md,
      right: SPACING.md,
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: '#fff',
      textAlign: 'center',
      backgroundColor: '#0008',
      paddingVertical: 4,
      borderRadius: 6,
      overflow: 'hidden',
    },
    errorContainer: {
      position: 'absolute',
      bottom: SPACING.md,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: '#000C',
      padding: SPACING.md,
      borderRadius: 8,
    },
    errorText: {
      color: '#fff',
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
    },
    symbolDisplay: {
      fontSize: largeText ? 48 : 36,
      marginBottom: SPACING.sm,
      color: '#fff',
    },
    videoOverlay: {
      position: 'absolute',
      top: SPACING.md,
      right: SPACING.md,
      width: SPACING.md * 10,
      height: SPACING.md * 10,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.md,
    },
    toggleLabel: {
      marginRight: SPACING.sm,
      color: COLORS.text,
      fontSize: largeText ? 18 : 16,
    },
    shortcutIndicator: {
      position: 'absolute',
      top: SPACING.xl,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: 'rgba(59, 130, 246, 0.9)',
      borderRadius: 12,
      padding: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    shortcutText: {
      color: '#FFFFFF',
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md }}>
        <Button
          title={facingMode === 'user' ? 'Hintere Kamera verwenden' : 'Vordere Kamera verwenden'}
          onPress={() => {
            const m = facingMode === 'user' ? 'environment' : 'user';
            setFacingMode(m);
            setWebviewKey((k) => k + 1);
          }}
          accessibilityLabel="Kamera wechseln"
        />
        <Button
          title="Stimmung"
          onPress={() => setShowMoodSelector(!showMoodSelector)}
          accessibilityLabel="Stimmungsmodus ändern"
        />
      </View>

      {showMoodSelector && <MoodSelector />}
       <View style={styles.cameraContainer}>
         {
           <MediaPipeGestureDetector
             key={webviewKey}
             onGestureDetected={handleGestureDetected}
             onError={handleGestureError}
             onModelUpdateStatus={handleModelUpdateStatus}
             onPartialFeedback={handlePartialFeedback}
             onStabilityFeedback={handleStabilityFeedback}
             facingMode={facingMode}
             gestureSizeTolerance={gestureSizeTolerance}
           />
         }

         {/* Visual ripple effect for gesture processing feedback */}
         <VisualRipple
           isActive={showVisualRipple}
           duration={800}
           color={COLORS.primaryAccent}
           size={300}
         />

         {/* Screen flash for LED-like visual feedback in quiet environments */}
         <ScreenFlash
           isActive={showScreenFlash}
           pattern={screenFlashPattern}
           color={COLORS.success}
           duration={300}
         />
        <Text style={styles.statusText}>
          {status}
          {modelUpdateStatus === 'updating' && ' 🔄'}
        </Text>

        {/* Shortcut activation indicator */}
        {shortcutActivated && (
          <View style={styles.shortcutIndicator}>
            <Text style={styles.shortcutText}>
              ⚡ {getShortcutMessage(shortcutActivated)}
            </Text>
          </View>
        )}

        {/* Amy First: Never show technical errors to Amy - all errors are handled via status messages */}

      {!error && !showCorrection && lastRecognizedGesture && (
        <Animated.View style={[styles.gestureInfo, { opacity: fadeAnim }]}> 
          <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}> 
            {lastRecognizedGesture.label}
          </Animated.Text>
          <Text style={styles.gestureText}>{(gestureConfidence * 100).toFixed(0)}%</Text>
          <Text style={styles.confidenceText} testID="recognition-path">
            via {recognitionPath}
          </Text>
        </Animated.View>
      )}

      {showDgsVideo && lastRecognizedGesture?.dgsVideoUri && (
        <View style={styles.videoOverlay}>
          <DgsVideoPlayer
            videoSource={{ uri: lastRecognizedGesture.dgsVideoUri }}
            shouldPlay={true}
          />
        </View>
      )}
    </View>

    {showCelebration && <Celebration key={celebrationKey} />}

    {showCorrection && (
      <CorrectionPanel
        onSelect={handleSelectCorrection}
        onAddNew={() => {
          setShowCorrection(false);
          navigation.navigate('Teaching');
        }}
        onCancel={handleCancelCorrection}
        suggestions={gestureSuggestions}
      />
    )}

    {/* Optional controls could be reintroduced as overlays if needed */}

    <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: SPACING.md }}>
      <Button
        testID="btn-correction"
        title="Korrektur"
        accessibilityLabel="Korrekturseite öffnen"
        onPress={() => navigation.navigate('Correction')}
      />
      <Button
        testID="btn-help-me-choose"
        title="Hilf mir wählen"
        accessibilityLabel="Hilf mir wählen öffnen"
        onPress={() => setShowCorrection(true)}
      />
      <Button
        testID="btn-teach"
        title="Neue Geste beibringen"
        accessibilityLabel="Neue Geste beibringen"
        onPress={() => navigation.navigate('Teaching')}
      />
    </View>

    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{LanguageManager.t('recognition.showDgsVideo')}</Text>
      <Switch
        value={showDgsVideo}
        onValueChange={setShowDgsVideo}
        accessibilityLabel={LanguageManager.t('recognition.toggleDgsVideo')}
      />
    </View>

    <BottomNav active="recognition" profileId={profile?.id || 'default'} />

    {/* Gesture Comparison Overlay - Amy First: Encouraging, non-judgmental learning */}
    {showGestureComparison && comparisonAttempt && (
      <GestureComparison
        userAttempt={comparisonAttempt}
        correctGesture={{
          id: pendingGesture || '',
          label: gestureModel.gestures.find(g => g.id === pendingGesture)?.label || 'Unbekannte Geste',
          dgsVideoUri: gestureModel.gestures.find(g => g.id === pendingGesture)?.dgsVideoUri
        }}
        onClose={handleCloseComparison}
        onTryAgain={handleTryAgainFromComparison}
      />
    )}
  </SafeAreaView>
);
}
