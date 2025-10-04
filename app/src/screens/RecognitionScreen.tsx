
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Button,
  AccessibilityInfo,
  ScrollView,
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
import { logHIPEvent } from '../services/hipEvents';
import { OneEuroFilter } from '../services/OneEuroFilter';
import type { RecognitionPath } from '../utils/recognitionState';
import { performanceOptimizationService } from '../services/performanceOptimizationService';
import { optimizedGestureService } from '../services/optimizedGestureService';

import { usePreloadComponents } from '../components/LazyComponent';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import PictureInPictureGuidance from '../components/PictureInPictureGuidance';
import Celebration, { CELEBRATION_DURATION_MS } from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { onMlpModelUpdated } from '../services/dgsModelClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import VisualRipple from '../components/VisualRipple';
import ScreenFlash from '../components/ScreenFlash';
import GestureComparison from '../components/GestureComparison';
import TwoHandGestureDisplay from '../components/TwoHandGestureDisplay';
import { isTwoHandGestureString } from '../constants/twoHandGestures';
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

const DEFAULT_FRAME_WIDTH = 640;
const DEFAULT_FRAME_HEIGHT = 480;

const toGestureImageCapture = (
  frameCapture: FrameCapturePayload,
  timestamp: number,
): GestureImageCapture | null => {
  if (!frameCapture) {
    return null;
  }

  let base64: string | undefined;
  let uri: string | undefined;
  let width: number | undefined;
  let height: number | undefined;

  if (typeof frameCapture === 'string') {
    if (frameCapture.startsWith('data:image/')) {
      uri = frameCapture;
      base64 = frameCapture.split(',')[1] ?? '';
    } else {
      base64 = frameCapture;
    }
  } else {
    const { base64: inputBase64, uri: inputUri, width: inputWidth, height: inputHeight } = frameCapture;
    if (typeof inputBase64 === 'string' && inputBase64.length > 0) {
      base64 = inputBase64;
    }
    if (typeof inputUri === 'string' && inputUri.length > 0) {
      uri = inputUri;
    }
    if (typeof inputWidth === 'number') {
      width = inputWidth;
    }
    if (typeof inputHeight === 'number') {
      height = inputHeight;
    }
  }

  if ((!base64 || base64.length === 0) && typeof uri === 'string' && uri.startsWith('data:image/')) {
    base64 = uri.split(',')[1] ?? '';
  }

  if (!base64 || base64.length === 0) {
    return null;
  }

  if (typeof uri !== 'string' || uri.length === 0 || !uri.startsWith('data:image/')) {
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
  toggleDgsVideo: 'DGS-Video umschalten',
  showPipGuidanceLabel: 'Gestenhilfe anzeigen',
  togglePipGuidance: 'Gestenhilfe umschalten',
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
  const [showTopControls, setShowTopControls] = useState(false);

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
    showCelebration,
    setShowCelebration,
    celebrationKey,
    setCelebrationKey,
    screenReaderEnabled,
    setScreenReaderEnabled,
    modelUpdateStatus,
    bullyingProtectionActive,
    setBullyingProtectionActive,
    gestureSizeTolerance,
    setGestureSizeTolerance,
    showVisualRipple,
    successSound,
    setSuccessSound,
    showScreenFlash,
    screenFlashPattern,
    showGestureComparison,
    setShowGestureComparison,
    comparisonAttempt,
    shortcutActivated,
    showPipGuidance,
    setShowPipGuidance,
    pipGuidanceGesture,
    showPracticeSuggestion,
    showAdaptiveLearning,
    setShowAdaptiveLearning,
    contextInsights,
    detectedTwoHandGesture,
    currentLandmarks,
    setCurrentLandmarks,
    currentHandedness,
    setCurrentHandedness,
  } = state;

  // Simple stub functions for adaptive PiP positioning
  const getAdaptivePipPosition = (): 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' => 'top-right';
  const getAdaptivePipSize = (): 'small' | 'medium' | 'large' => 'medium';
  const getAdaptivePlaybackMode = () => 'once' as const;

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
    handleCloseComparison,
    handleAcceptPractice,
    handleDeclinePractice,
    handleLaterPractice,
    handleStartAdaptiveRecommendation,
    handleTryAgainFromComparison,
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
      emergency = false,
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
        emergency,
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
    handleOpenAIValidation,
    undefined,
    setOpenaiValidationResult,
    setShowOpenaiFeedback,
  );

  const processGesture = useCallback(
    (
      gesture: string | null,
      confidence: number,
      landmarks: number[][][],
      handedness: string[],
      emergency = false,
      frameCapture?: FrameCapturePayload | null,
    ) => {
      const timestamp = Date.now();
      if (frameCapture) {
        const normalizedCapture = toGestureImageCapture(frameCapture, timestamp);
        if (normalizedCapture) {
          latestFrameRef.current = normalizedCapture;
        }
      } else {
        latestFrameRef.current = null;
      }

      void handleParallelProcessing(
        gesture,
        confidence,
        landmarks,
        handedness,
        emergency,
        frameCapture ?? null,
      );
    },
    [handleParallelProcessing],
  );

  const handleApplyOpenAISuggestion = useCallback(
    (suggestion: string) => {
      logger.info('OpenAI suggestion applied', { suggestion });
      setShowOpenaiFeedback(false);
    },
    [setShowOpenaiFeedback],
  );

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

  // Preload components that might be needed during recognition
  usePreloadComponents([
    'CorrectionPanel',
    'GestureComparison',
    'PracticeSuggestion',
    'AdaptiveLearningPanel',
    'PictureInPictureGuidance',
    'TwoHandGestureDisplay'
  ]);

  // Performance and battery monitoring
  useEffect(() => {
    // Update performance metrics when gesture is detected
    const updatePerformanceMetrics = () => {
      performanceOptimizationService.updateMetrics({
        gestureProcessingTime: Date.now() - lastFrameTimeRef.current,
        lastUpdated: Date.now()
      });
    };

    // Monitor performance every 5 seconds
    const performanceInterval = setInterval(updatePerformanceMetrics, 5000);

    return () => {
      clearInterval(performanceInterval);
      // Cleanup services on unmount
      performanceOptimizationService.cleanup();
    };
  }, []);


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
    sectionSpacing: {
      marginBottom: SPACING.lg,
    },
    controlRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    controlButton: {
      flexBasis: '32%',
      marginBottom: SPACING.sm,
    },
    controlColumn: {
      alignItems: 'center',
    },
    controlSpacer: {
      height: SPACING.sm,
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

  const normalizedStatus = status === 'none' ? 'Ich höre zu…' : status;
  const displayStatus = normalizedStatus;

  return (
    <>
      <ScreenBackground style={styles.container}>
        <View style={styles.contentWrapper}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {showTopControls && (
            <View style={styles.sectionSpacing}>
              <View style={[styles.card, styles.controlRow, highContrast && styles.cardHC]}>
                <View style={styles.controlButton}>
                  <Button
                    title={
                      facingMode === 'user'
                        ? 'Hintere Kamera verwenden'
                        : 'Vordere Kamera verwenden'
                    }
                    onPress={() => {
                      const m = facingMode === 'user' ? 'environment' : 'user';
                      setFacingMode(m);
                      setWebviewKey((k) => k + 1);
                    }}
                    accessibilityLabel="Kamera wechseln"
                  />
                </View>
              </View>
            </View>
          )}

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
              />

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

            <PictureInPictureGuidance
              gestureId={pipGuidanceGesture?.id}
              videoUri={pipGuidanceGesture?.dgsVideoUri}
              isVisible={showPipGuidance}
              onClose={() => setShowPipGuidance(false)}
              position={getAdaptivePipPosition()}
              size={getAdaptivePipSize()}
              autoPlay
              showControls={false}
              playbackMode={getAdaptivePlaybackMode()}
              confidence={gestureConfidence}
              onPlaybackComplete={() => {
                if (pipGuidanceGesture?.id) {
                  void logHIPEvent('HIP_1', 'pip_guidance_completed', {
                    gestureId: pipGuidanceGesture.id,
                    confidence: gestureConfidence,
                    context: contextInsights
                      ? {
                          timeOfDay: contextInsights.timeOfDay,
                          patternMatch: contextInsights.patternMatch,
                        }
                      : undefined,
                  });
                }
              }}
            />
          </View>

          {!error && !showCorrection && lastRecognizedGesture && (
            <Animated.View
              style={[
                styles.card,
                styles.gestureCard,
                highContrast && styles.cardHC,
                { opacity: fadeAnim },
              ]}
            >
              {isTwoHandGestureString(lastRecognizedGesture.label) && detectedTwoHandGesture ? (
                <TwoHandGestureDisplay
                  gestureString={detectedTwoHandGesture.gesture.id}
                  confidence={detectedTwoHandGesture.confidence}
                  showDetails
                  size="large"
                />
              ) : isTwoHandGestureString(lastRecognizedGesture.label) ? (
                <TwoHandGestureDisplay
                  gestureString={lastRecognizedGesture.label}
                  confidence={gestureConfidence}
                  showDetails
                  size="large"
                />
              ) : (
                <>
                  <Animated.Text
                    style={[
                      styles.symbolDisplay,
                      highContrast && styles.symbolDisplayHC,
                      largeText && styles.symbolDisplayLarge,
                      { transform: [{ scale: symbolScaleAnim }] },
                    ]}
                    >
                      {lastRecognizedGesture.label}
                    </Animated.Text>
                  <Text
                    style={[
                      styles.gestureText,
                      largeText && styles.gestureTextLarge,
                      highContrast && styles.gestureTextHC,
                    ]}
                  >
                    {(gestureConfidence * 100).toFixed(0)}%
                  </Text>
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
            <View style={styles.actionButton}>
              <Button
                title="Einstellungen"
                accessibilityLabel="Einstellungen anzeigen/verstecken"
                onPress={() => setShowTopControls(!showTopControls)}
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

        {showGestureComparison && comparisonAttempt && (
          <GestureComparison
            userAttempt={comparisonAttempt}
            correctGesture={(() => {
              const referenceGesture = optimizedGestureService.getGestureById(pendingGesture || '');
              return {
                id: pendingGesture || '',
                label: referenceGesture?.label ?? 'Unbekannte Geste',
                ...(referenceGesture?.dgsVideoUri
                  ? { dgsVideoUri: referenceGesture.dgsVideoUri }
                  : {}),
              };
            })()}
            onClose={handleCloseComparison}
            onTryAgain={handleTryAgainFromComparison}
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
        onApplySuggestion={handleApplyOpenAISuggestion}
      />
    )}
  </>
);
}
