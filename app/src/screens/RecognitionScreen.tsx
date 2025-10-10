
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Button,
  ScrollView,
  Pressable,
} from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { useAccessibility } from '../components/AccessibilityContext';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import CorrectionPanel from '../components/CorrectionPanel';
import PracticeSuggestion from '../components/PracticeSuggestion';
import AdaptiveLearningPanel from '../components/AdaptiveLearningPanel';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { logger } from '../utils/logger';
import { loadProfile, Profile } from '../storage';
import { buildLocalCentroids } from '../services/localCentroids';
import { classifyWithCentroids } from '../services/offlineClassifier';
import type { CentroidMap, Point } from '../services/dgsModelClient';
import type { GestureImageCapture } from '../services/openaiGestureValidationService';
import type { FrameCapturePayload } from '../types/frames';
import { flattenHandsWithHandedness } from '../services/handUtils';
import { OFFLINE_CLASSIFIER_TRIGGER_THRESHOLD } from '../constants/gesture';
import { OneEuroFilter } from '../services/OneEuroFilter';
import type { RecognitionPath } from '../utils/recognitionState';
import { optimizedGestureService } from '../services/optimizedGestureService';

import { usePreloadComponents } from '../components/LazyComponent';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import Celebration, { CELEBRATION_DURATION_MS } from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { onMlpModelUpdated } from '../services/dgsModelClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import VisualRipple from '../components/VisualRipple';
import ScreenFlash from '../components/ScreenFlash';
import GestureMeaningDisplay from '../components/GestureMeaningDisplay';
import ScreenBackground from '../components/ScreenBackground';
import type { RootStackParamList } from '../navigation/types';
import { getShortcutMessage } from '../utils/shortcutUtils';
import { useRecognitionState } from '../hooks/useRecognitionState';
import { useRecognitionCallbacks } from '../hooks/useRecognitionCallbacks';
import { useOpenAIValidation } from '../hooks/useOpenAIValidation';
import { useParallelProcessing } from '../hooks/useParallelProcessing';
import HandLandmarkPreview from '../components/HandLandmarkPreview';
import {
  cloneLandmarks,
  adjustHandednessForMirror,
  createHandLandmarkStabilizer,
} from '../utils/landmarkUtils';
import OpenAIGestureFeedback from '../components/OpenAIGestureFeedback';
import { childFriendlyStyles } from '../styles/touchTargets';

const DEFAULT_FRAME_WIDTH = 640;
const DEFAULT_FRAME_HEIGHT = 480;

const toGestureImageCapture = (
  frameCapture: FrameCapturePayload,
  timestamp: number,
): GestureImageCapture | null => {
  if (!frameCapture) {
    return null;
  }

  const partial =
    typeof frameCapture === 'string'
      ? { [frameCapture.startsWith('data:image/') ? 'uri' : 'base64']: frameCapture }
      : frameCapture;

  const { width, height } = partial as { width?: number; height?: number };
  let { base64, uri } = partial as { base64?: string; uri?: string };

  if (!base64 && typeof uri === 'string' && uri.startsWith('data:image/')) {
    base64 = uri.split(',')[1] ?? '';
  }

  if (!base64) {
    return null;
  }

  if (!uri || !uri.startsWith('data:image/')) {
    uri = `data:image/jpeg;base64,${base64}`;
  }

  return {
    uri,
    base64,
    width: typeof width === 'number' && width > 0 ? width : DEFAULT_FRAME_WIDTH,
    height: typeof height === 'number' && height > 0 ? height : DEFAULT_FRAME_HEIGHT,
    timestamp,
  };
};

const RECOGNITION_TEXT = {
  showDgsVideoLabel: 'DGS-Video anzeigen',
  hideDgsVideoLabel: 'DGS-Video ausblenden',
  toggleDgsVideo: 'DGS-Video umschalten',
};

export default function RecognitionScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'Recognition'>;
}) {
  const { largeText, highContrast } = useAccessibility();
  const { setMessage } = useMessage();
  const { getSuccessMessage } = useThemeMessages();

  const [cameraType, setCameraType] = useState<'front' | 'back'>('front');

  const state = useRecognitionState();
  const {
    profile,
    setProfile,
    status,
    setStatus,
    gestureConfidence,
    error,
    showCorrection,
    setShowCorrection,
    gestureSuggestions,
    pendingGesture,
    lastRecognizedGesture,
    facingMode,
    setFacingMode,
    webviewKey,
    setWebviewKey,
    recognitionPath,
    showDgsVideo,
    setShowDgsVideo,
    showCelebration,
    setShowCelebration,
    celebrationKey,
    setCelebrationKey,
    modelUpdateStatus,
    gestureSizeTolerance,
    setGestureSizeTolerance,
    showVisualRipple,
    successSound,
    setSuccessSound,
    showScreenFlash,
    screenFlashPattern,
    shortcutActivated,
    showPracticeSuggestion,
    showAdaptiveLearning,
    setShowAdaptiveLearning,
    contextInsights,
    detectedGestureMeaning,
    sequenceMeaning,
    sequenceMatch,
    currentLandmarks,
    setCurrentLandmarks,
    currentHandedness,
    setCurrentHandedness,
  } = state;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;
  const confidenceFilterRef = useRef(new OneEuroFilter(1.2, 0.007, 1.0));
  const labelHistoryRef = useRef<string[]>([]);
  const lastSuccessAtRef = useRef<number>(0);
  const lastGestureIdRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const centroidsRef = useRef<CentroidMap>({});
  const lastModelUpdateTimeRef = useRef<number>(0);
  const lastOfflineClassifyAtRef = useRef<number>(0);
  const handStabilizerRef = useRef(createHandLandmarkStabilizer({ ttlMs: 300, maxHands: 2 }));
  const latestFrameRef = useRef<GestureImageCapture | null>(null);

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
      } catch {
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
    handStabilizerRef.current.reset();
    setCurrentLandmarks([]);
    setCurrentHandedness([]);
  }, [facingMode]);

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

  const captureImage = useCallback(async () => {
    const latest = latestFrameRef.current;
    if (!latest) {
      return null;
    }
    return { ...latest };
  }, []);

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

  const recognitionRefs = useMemo(
    () => ({
      confidenceFilterRef,
      labelHistoryRef,
      lastGestureIdRef,
      lastSuccessAtRef,
      lastFrameTimeRef,
      lastModelUpdateTimeRef,
    }),
    [
      confidenceFilterRef,
      labelHistoryRef,
      lastGestureIdRef,
      lastSuccessAtRef,
      lastFrameTimeRef,
      lastModelUpdateTimeRef,
    ],
  );

  const recognitionHelpers = useMemo(
    () => ({
      startFeedbackAnimation,
      getSuccessMessage: (gestureId: string) => {
        const base = getSuccessMessage();
        const meta = optimizedGestureService.getGestureById(gestureId);
        return meta ? `${base} ${meta.emoji ?? ''}`.trim() : base;
      },
    }),
    [getSuccessMessage, startFeedbackAnimation],
  );

  const {
    handleGestureDetected: baseHandleGestureDetected,
    handleModelUpdateStatus,
    handleGestureError,
    handleSelectCorrection,
    handleAcceptPractice,
    handleDeclinePractice,
    handleLaterPractice,
    handleStartAdaptiveRecommendation,
  } = useRecognitionCallbacks({
    navigation,
    state,
    refs: recognitionRefs,
    helpers: recognitionHelpers,
  });

  const handleGestureDetected = useCallback(
    (
      gesture: string | null,
      confidence: number,
      landmarks: number[][][],
      handedness: string[],
    ) => {
      const mirrored = facingMode === 'user';
      const safeLandmarks = cloneLandmarks(landmarks);
      const adjustedHandedness = adjustHandednessForMirror(handedness ?? [], mirrored);
      const stabilized = handStabilizerRef.current.update(safeLandmarks, adjustedHandedness);

      let processedGesture = gesture;
      let processedConfidence = confidence;
      let recognitionSource: RecognitionPath = 'local';

      if (
        (!processedGesture || processedConfidence < OFFLINE_CLASSIFIER_TRIGGER_THRESHOLD) &&
        centroidsRef.current &&
        stabilized.landmarks.length > 0
      ) {
        try {
          const now = Date.now();
          if (now - lastOfflineClassifyAtRef.current > 150) {
            lastOfflineClassifyAtRef.current = now;
            const flattened = flattenHandsWithHandedness(
              stabilized.landmarks,
              stabilized.handedness,
            );
            const flattenedPoints: Point[] = [];
            for (const coords of flattened) {
              if (!Array.isArray(coords)) {
                flattenedPoints.push([0, 0, 0]);
                continue;
              }
              const [x = 0, y = 0, z = 0] = coords;
              const point: Point = [x, y, z];
              flattenedPoints.push(point);
            }
            const centroidResult = classifyWithCentroids(flattenedPoints, centroidsRef.current);
            if (
              centroidResult &&
              centroidResult.confidence >= Math.max(
                OFFLINE_CLASSIFIER_TRIGGER_THRESHOLD,
                processedConfidence,
              )
            ) {
              processedGesture = centroidResult.label;
              processedConfidence = centroidResult.confidence;
              recognitionSource = 'centroid';
            }
          }
        } catch (error) {
          logger.warn('Failed to classify with local centroids', error);
        }
      }

      const resultPromise = baseHandleGestureDetected(
        processedGesture,
        processedConfidence,
        stabilized.landmarks,
        stabilized.handedness,
        recognitionSource,
      );

      return resultPromise;
    },
    [baseHandleGestureDetected, facingMode],
  );

  const {
    openaiValidationResult,
    setOpenaiValidationResult,
    showOpenaiFeedback,
    setShowOpenaiFeedback,
    handleOpenAIValidation,
  } = useOpenAIValidation(handleGestureDetected, captureImage);

  const { handleParallelProcessing } = useParallelProcessing(
    handleGestureDetected,
    undefined,
    setOpenaiValidationResult,
    setShowOpenaiFeedback,
    handleOpenAIValidation,
  );

  const processGesture = useCallback(
    (
      gesture: string | null,
      confidence: number,
      landmarks: number[][][],
      handedness: string[],
      frameCapture?: FrameCapturePayload | null,
    ) => {
      const timestamp = Date.now();
      let normalizedCapture: GestureImageCapture | null = null;
      if (frameCapture) {
        normalizedCapture = toGestureImageCapture(frameCapture, timestamp);
        latestFrameRef.current = normalizedCapture;
      } else {
        latestFrameRef.current = null;
      }

      const capturedFrameForProcessing = normalizedCapture ?? frameCapture ?? null;

      void handleParallelProcessing(
        gesture,
        confidence,
        landmarks,
        handedness,
        capturedFrameForProcessing,
      );
    },
    [handleParallelProcessing],
  );

  const handleAcknowledgeOpenAISuggestion = useCallback(
    (suggestion?: string) => {
      if (suggestion) {
        logger.info('OpenAI suggestion angewendet', { suggestion });
      } else {
        logger.info('OpenAI-Vorschlag bestätigt');
      }
      setShowOpenaiFeedback(false);
    },
    [setShowOpenaiFeedback],
  );

  useEffect(() => {
    const loadGestureSizeTolerance = async () => {
      try {
        const toleranceStr = await AsyncStorage.getItem('gestureSizeTolerance');
        if (toleranceStr) {
          setGestureSizeTolerance(parseFloat(toleranceStr));
        }
      } catch (error) {
        logger.warn('Failed to load gesture size tolerance:', error);
      }
    };

    loadGestureSizeTolerance();
  }, []);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, []);

  // Preload components that might be needed during recognition
  usePreloadComponents([
    'CorrectionPanel',
    'PracticeSuggestion',
    'AdaptiveLearningPanel',
    'GestureMeaningDisplay'
  ]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
    container: {
      flex: 1,
    },
    contentWrapper: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: SPACING.xl * 2,
    },
    card: {
      backgroundColor: COLORS.surface,
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    cardHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderWidth: 2,
      borderColor: COLORS.highContrastText,
      shadowOpacity: 0,
      elevation: 0,
    },
    statusLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text,
      textAlign: 'center',
    },
    statusLabelLarge: {
      fontSize: 18,
    },
    statusLabelHC: {
      color: COLORS.highContrastText,
    },
    statusSubtle: {
      marginTop: SPACING.xs,
      fontSize: 14,
      color: COLORS.textMuted,
      textAlign: 'center',
    },
    statusSubtleLarge: {
      fontSize: 16,
    },
    statusSubtleHC: {
      color: COLORS.highContrastText,
    },
    shortcutCard: {
      alignItems: 'center',
      backgroundColor: '#E0ECFF',
    },
    shortcutText: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.primaryAccent,
    },
    shortcutTextLarge: {
      fontSize: 18,
    },
    shortcutTextHC: {
      color: COLORS.highContrastText,
    },
    cameraCard: {
      padding: 0,
      overflow: 'hidden',
    },
    cameraSurface: {
      width: '100%',
      aspectRatio: 3 / 4,
      backgroundColor: '#000',
      position: 'relative',
    },
    cameraToolbarContainer: {
      position: 'absolute',
      top: SPACING.sm,
      left: SPACING.sm,
      zIndex: 5,
    },
    cameraToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      flexWrap: 'wrap',
    },
    toolbarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      borderRadius: DEFAULT_RADIUS,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      marginRight: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    toolbarButtonHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderWidth: 2,
      borderColor: COLORS.highContrastText,
    },
    toolbarButtonPressed: {
      opacity: 0.8,
    },
    toolbarButtonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    toolbarButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
      marginLeft: SPACING.xs,
    },
    toolbarButtonTextLarge: {
      fontSize: 16,
    },
    toolbarButtonTextHC: {
      color: COLORS.highContrastText,
    },
    toolbarIcon: {
      fontSize: 18,
      color: '#fff',
    },
    toolbarIconLarge: {
      fontSize: 20,
    },
    toolbarIconHC: {
      color: COLORS.highContrastText,
    },
    videoOverlay: {
      position: 'absolute',
      top: SPACING.md,
      right: SPACING.md,
      width: SPACING.xl * 4,
      height: SPACING.xl * 4,
      borderRadius: DEFAULT_RADIUS,
      overflow: 'hidden',
    },
    gestureCard: {
      alignItems: 'center',
    },
    symbolDisplay: {
      fontSize: 36,
      fontWeight: '700',
      color: COLORS.text,
      marginBottom: SPACING.sm,
    },
    symbolDisplayHC: {
      color: COLORS.highContrastText,
    },
    symbolDisplayLarge: {
      fontSize: 44,
    },
    gestureText: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text,
    },
    gestureTextHC: {
      color: COLORS.highContrastText,
    },
    gestureTextLarge: {
      fontSize: 20,
    },
    confidenceText: {
      fontSize: 14,
      color: COLORS.textMuted,
      marginTop: SPACING.xs,
    },
    confidenceTextHC: {
      color: COLORS.highContrastText,
    },
    confidenceTextLarge: {
      fontSize: 16,
    },
    encouragementText: {
      fontSize: 18,
      fontWeight: '700',
      color: COLORS.success,
      marginTop: SPACING.sm,
    },
    encouragementTextLarge: {
      fontSize: 20,
    },
    errorCard: {
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
    },
    errorCardHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderWidth: 2,
      borderColor: COLORS.error,
    },
    errorText: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.error,
      textAlign: 'center',
    },
    errorTextLarge: {
      fontSize: 18,
    },
    errorTextHC: {
      color: COLORS.highContrastText,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    actionButton: {
      flexBasis: '48%',
      marginBottom: SPACING.sm,
    },
      }),
    [highContrast, largeText],
  );

  const gestureMeaningDisplayProps = useMemo(() => {
    if (!lastRecognizedGesture && !detectedGestureMeaning && !sequenceMeaning) {
      return null;
    }

    const fallbackCombinationId = detectedGestureMeaning
      ? `${detectedGestureMeaning.leftHandGesture}+${detectedGestureMeaning.rightHandGesture}`
      : null;

    const gestureDefinitionForDisplay = sequenceMeaning || detectedGestureMeaning?.gesture || null;

    const gestureIdForDisplay =
      sequenceMeaning?.id ||
      detectedGestureMeaning?.gesture.id ||
      lastRecognizedGesture?.id ||
      fallbackCombinationId ||
      lastRecognizedGesture?.label ||
      '';

    if (!gestureIdForDisplay) {
      return null;
    }

    const confidence = sequenceMeaning
      ? sequenceMatch?.matchConfidence ?? gestureConfidence
      : detectedGestureMeaning?.confidence ?? gestureConfidence;

    const sequenceGestures =
      sequenceMatch?.sequence?.gestures ??
      (sequenceMeaning?.composition === 'sequence' ? sequenceMeaning.gestures : null);

    return {
      gestureId: gestureIdForDisplay,
      confidence,
      gestureDefinition: gestureDefinitionForDisplay,
      sequenceGestures,
    };
  }, [
    detectedGestureMeaning,
    gestureConfidence,
    lastRecognizedGesture,
    sequenceMatch,
    sequenceMeaning,
  ]);

  const normalizedStatus = status === 'none' ? 'Ich höre zu…' : status;
  const displayStatus = normalizedStatus;

  useEffect(() => {
    if (!lastRecognizedGesture?.dgsVideoUri && showDgsVideo) {
      setShowDgsVideo(false);
    }
  }, [lastRecognizedGesture, showDgsVideo]);

  return (
    <>
      <ScreenBackground style={styles.container}>
        <View style={styles.contentWrapper}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, highContrast && styles.cardHC]}>
            <Text
              style={[
                styles.statusLabel,
                largeText && styles.statusLabelLarge,
                highContrast && styles.statusLabelHC,
              ]}
              accessibilityRole="text"
            >
              {displayStatus}
            </Text>
            {modelUpdateStatus === 'updating' && (
              <Text
                style={[
                  styles.statusSubtle,
                  largeText && styles.statusSubtleLarge,
                  highContrast && styles.statusSubtleHC,
                ]}
              >
                🔄 Modell wird aktualisiert …
              </Text>
            )}
          </View>

          {shortcutActivated && (
            <View style={[styles.card, styles.shortcutCard, highContrast && styles.cardHC]}>
              <Text
                style={[
                  styles.shortcutText,
                  largeText && styles.shortcutTextLarge,
                  highContrast && styles.shortcutTextHC,
                ]}
              >
                ⚡ {getShortcutMessage(shortcutActivated)}
              </Text>
            </View>
          )}

          <View style={[styles.card, styles.cameraCard, highContrast && styles.cardHC]}>
            <View style={styles.cameraSurface}>
              <MediaPipeGestureDetector
                onGestureDetected={processGesture}
                onLandmarks={(landmarks, handedness) => {
                  handleGestureDetected(null, 0, landmarks, handedness);
                }}
                onError={handleGestureError}
                onWebViewEvent={(telemetry) => {
                  logger.info('WebView telemetry:', telemetry);
                }}
                onModelUpdateStatus={handleModelUpdateStatus}
                facingMode={facingMode}
                gestureSizeTolerance={gestureSizeTolerance}
              />

              <View style={styles.cameraToolbarContainer} pointerEvents="box-none">
                <View style={styles.cameraToolbar}>
                  <Pressable
                    onPress={() => {
                      const nextMode = facingMode === 'user' ? 'environment' : 'user';
                      setFacingMode(nextMode);
                      setWebviewKey((k) => k + 1);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Kamera wechseln"
                    accessibilityHint="Zwischen Vorder- und Rückkamera umschalten"
                    style={({ pressed }) => [
                      childFriendlyStyles.minTouchTarget,
                      styles.toolbarButton,
                      highContrast && styles.toolbarButtonHC,
                      pressed &&
                        (highContrast ? styles.toolbarButtonPressedHC : styles.toolbarButtonPressed),
                    ]}
                  >
                    <Text
                      style={[
                        styles.toolbarIcon,
                        largeText && styles.toolbarIconLarge,
                        highContrast && styles.toolbarIconHC,
                      ]}
                    >
                      {facingMode === 'user' ? '📷' : '🤳'}
                    </Text>
                    <Text
                      style={[
                        styles.toolbarButtonText,
                        largeText && styles.toolbarButtonTextLarge,
                        highContrast && styles.toolbarButtonTextHC,
                      ]}
                    >
                      {facingMode === 'user' ? 'Zur Rückkamera' : 'Zur Frontkamera'}
                    </Text>
                  </Pressable>

                  {lastRecognizedGesture?.dgsVideoUri ? (
                    <Pressable
                      onPress={() => setShowDgsVideo((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={RECOGNITION_TEXT.toggleDgsVideo}
                      accessibilityHint="DGS-Video ein- oder ausblenden"
                      style={({ pressed }) => [
                        childFriendlyStyles.minTouchTarget,
                        styles.toolbarButton,
                        highContrast && styles.toolbarButtonHC,
                        pressed &&
                          (highContrast
                            ? styles.toolbarButtonPressedHC
                            : styles.toolbarButtonPressed),
                      ]}
                    >
                      <Text
                        style={[
                          styles.toolbarIcon,
                          largeText && styles.toolbarIconLarge,
                          highContrast && styles.toolbarIconHC,
                        ]}
                      >
                        {showDgsVideo ? '🙈' : '🎬'}
                      </Text>
                      <Text
                        style={[
                          styles.toolbarButtonText,
                          largeText && styles.toolbarButtonTextLarge,
                          highContrast && styles.toolbarButtonTextHC,
                        ]}
                      >
                        {showDgsVideo
                          ? RECOGNITION_TEXT.hideDgsVideoLabel
                          : RECOGNITION_TEXT.showDgsVideoLabel}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <HandLandmarkPreview
                  landmarks={currentLandmarks}
                  handedness={currentHandedness}
                  mirror={facingMode === 'user'}
                  confidence={gestureConfidence}
                />
              </View>

              <VisualRipple
                isActive={showVisualRipple}
                duration={800}
                color={COLORS.primaryAccent}
                size={300}
              />

              <ScreenFlash
                isActive={showScreenFlash}
                pattern={screenFlashPattern}
                color={COLORS.success}
                duration={300}
              />

              {showDgsVideo && lastRecognizedGesture?.dgsVideoUri && (
                <View style={styles.videoOverlay}>
                  <DgsVideoPlayer
                    videoSource={{ uri: lastRecognizedGesture.dgsVideoUri }}
                    shouldPlay
                  />
                </View>
              )}
            </View>

          </View>

          {!error &&
            !showCorrection &&
            (lastRecognizedGesture || detectedGestureMeaning || sequenceMeaning) && (
            <Animated.View
              style={[
                styles.card,
                styles.gestureCard,
                highContrast && styles.cardHC,
                { opacity: fadeAnim },
              ]}
            >
              {/* Zeige immer die zusammengefasste Bedeutung, egal ob eine oder beide Hände beteiligt waren. */}
              {gestureMeaningDisplayProps && (
                <>
                  <GestureMeaningDisplay
                    gestureId={gestureMeaningDisplayProps.gestureId}
                    confidence={gestureMeaningDisplayProps.confidence}
                    showDetails
                    size="large"
                    gestureDefinition={gestureMeaningDisplayProps.gestureDefinition}
                    gestureMeta={lastRecognizedGesture}
                    openaiValidationResult={openaiValidationResult}
                    sequenceGestures={gestureMeaningDisplayProps.sequenceGestures}
                  />
                  <Text
                    style={[
                      styles.confidenceText,
                      largeText && styles.confidenceTextLarge,
                      highContrast && styles.confidenceTextHC,
                    ]}
                    testID="recognition-path"
                  >
                    über {recognitionPath}
                  </Text>
                </>
              )}
            </Animated.View>
          )}

          {error && (
            <View style={[styles.card, styles.errorCard, highContrast && styles.errorCardHC]}>
              <Text
                style={[
                  styles.errorText,
                  largeText && styles.errorTextLarge,
                  highContrast && styles.errorTextHC,
                ]}
              >
                {error}
              </Text>
            </View>
          )}

          <View style={[styles.card, styles.actionRow, highContrast && styles.cardHC]}>
            <View style={styles.actionButton}>
              <Button
                testID="btn-adaptive-learning"
                title="Lernfortschritt"
                accessibilityLabel="Persönliches Lernen öffnen"
                onPress={() => setShowAdaptiveLearning(true)}
              />
            </View>
            <View style={styles.actionButton}>
              <Button
                testID="btn-teach"
                title="Neue Geste beibringen"
                accessibilityLabel="Neue Geste beibringen"
                onPress={() => navigation.navigate('Teaching')}
              />
            </View>
          </View>
        </ScrollView>

        {showCelebration && <Celebration key={celebrationKey} />}

        {showCorrection && (
          <CorrectionPanel
            onSelect={handleSelectCorrection}
            onAddNew={() => {
              setShowCorrection(false);
              navigation.navigate('Teaching');
            }}
            onCancel={() => setShowCorrection(false)}
            suggestions={gestureSuggestions}
            gestureModel={optimizedGestureService}
            showPictures
          />
        )}

      </View>

      <PracticeSuggestion
        visible={showPracticeSuggestion}
        onAccept={handleAcceptPractice}
        onDecline={handleDeclinePractice}
        onLater={handleLaterPractice}
      />

      <AdaptiveLearningPanel
        visible={showAdaptiveLearning}
        onClose={() => setShowAdaptiveLearning(false)}
        onStartRecommendation={handleStartAdaptiveRecommendation}
        availableTime={10}
      />
    </ScreenBackground>
    <BottomNav active="recognition" profileId={profile?.id || 'default'} />
    {openaiValidationResult && (
      <OpenAIGestureFeedback
        isVisible={showOpenaiFeedback}
        validationResult={openaiValidationResult}
        onDismiss={() => setShowOpenaiFeedback(false)}
        onApplySuggestion={handleAcknowledgeOpenAISuggestion}
      />
    )}
  </>
);
}
