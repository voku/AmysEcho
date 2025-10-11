import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { NavigationProp } from '@react-navigation/native';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import ActionButton from '../components/ActionButton';
import FeedbackBanner from '../components/FeedbackBanner';
import { logger } from '../utils/logger';
import { loadProfile } from '../storage';
import { buildLocalCentroids } from '../services/localCentroids';
import { classifyWithCentroids } from '../services/offlineClassifier';
import type { CentroidMap, Point } from '../services/dgsModelClient';
import type { GestureImageCapture } from '../services/openaiGestureValidationService';
import type { FrameCapturePayload } from '../types/frames';
import { flattenHandsWithHandedness } from '../services/handUtils';
import { OFFLINE_CLASSIFIER_TRIGGER_THRESHOLD } from '../constants/gesture';
import type { RecognitionPath } from '../utils/recognitionState';
import { optimizedGestureService } from '../services/optimizedGestureService';

import { usePreloadComponents } from '../components/LazyComponent';
import Celebration from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { onMlpModelUpdated } from '../services/dgsModelClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import GestureMeaningDisplay from '../components/GestureMeaningDisplay';
import type { RootStackParamList } from '../navigation/types';
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
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import { triggerSpeakAndShow } from '../services/feedbackService';
import { AmyLoopTimeline, type LoopStageKey } from '../components/AmyLoopTimeline';
import { OneEuroFilter } from '../services/OneEuroFilter';

const DEFAULT_FRAME_WIDTH = 640;
const DEFAULT_FRAME_HEIGHT = 480;
const CAPTURE_PULSE_SIZE = spacing['2xl'] * 5;

type RecognitionStatusCategory = 'idle' | 'listening' | 'recognized' | 'updating' | 'error';

const STATUS_CHIP_BACKGROUND: Record<RecognitionStatusCategory, string> = {
  idle: Colors.surfaceMuted,
  listening: Colors.primary,
  recognized: Colors.success,
  updating: Colors.accent,
  error: Colors.error,
};

const STATUS_CHIP_TEXT: Record<RecognitionStatusCategory, string> = {
  idle: Colors.text,
  listening: Colors.inverseText,
  recognized: Colors.inverseText,
  updating: Colors.text,
  error: Colors.inverseText,
};

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

export default function RecognitionScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'Recognition'>;
}) {
  const { showToast } = useMessage();
  const { getSuccessMessage } = useThemeMessages();

  const state = useRecognitionState();
  const {
    setProfile,
    status,
    error,
    gestureConfidence,
    lastRecognizedGesture,
    facingMode,
    setFacingMode,
    showCelebration,
    celebrationKey,
    gestureSizeTolerance,
    setGestureSizeTolerance,
    setSuccessSound,
    detectedGestureMeaning,
    sequenceMeaning,
    sequenceMatch,
    currentLandmarks,
    setCurrentLandmarks,
    currentHandedness,
    setCurrentHandedness,
    modelUpdateStatus,
    recognitionPath,
  } = state;

  const fadeAnim = useRef(new Animated.Value(1)).current;
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
    const unsub = onMlpModelUpdated(() => {
      showToast({ message: 'Neues Modell geladen', tone: 'success', durationMs: 2000 });
    });
    return () => unsub();
  }, [showToast]);

  const capturePulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<ReturnType<typeof Animated.loop> | null>(null);

  const captureImage = useCallback(async () => {
    const latest = latestFrameRef.current;
    return latest ? { ...latest } : null;
  }, []);

  const startFeedbackAnimation = useCallback(() => {
    fadeAnim.setValue(0.6);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const recognitionRefs = useMemo(
    () => ({
      confidenceFilterRef,
      labelHistoryRef,
      lastGestureIdRef,
      lastSuccessAtRef,
      lastFrameTimeRef,
      lastModelUpdateTimeRef,
    }),
    [],
  );

  const recognitionHelpers = useMemo(
    () => ({
      getSuccessMessage: (gestureId: string) => {
        const base = getSuccessMessage();
        const meta = optimizedGestureService.getGestureById(gestureId);
        return meta ? `${base} ${meta.emoji ?? ''}`.trim() : base;
      },
      startFeedbackAnimation,
    }),
    [getSuccessMessage, startFeedbackAnimation],
  );

  const {
    handleGestureDetected: baseHandleGestureDetected,
    handleModelUpdateStatus,
    handleGestureError,
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
            const flattenedPoints: Point[] = flattened.map(coords => {
              if (!Array.isArray(coords)) return [0,0,0];
              const [x = 0, y = 0, z = 0] = coords;
              return [x, y, z];
            });
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
        } catch (err) {
          logger.warn('Failed to classify with local centroids', err);
        }
      }

      return baseHandleGestureDetected(
        processedGesture,
        processedConfidence,
        stabilized.landmarks,
        stabilized.handedness,
        recognitionSource,
      );
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
      if (typeof frameCapture === 'string' && frameCapture.startsWith('data:image')) {
        const normalizedCapture = toGestureImageCapture(frameCapture, timestamp);
        latestFrameRef.current = normalizedCapture;
        void handleParallelProcessing(
          gesture,
          confidence,
          landmarks,
          handedness,
          normalizedCapture ?? frameCapture ?? null,
        );
      } else {
        void handleParallelProcessing(
          gesture,
          confidence,
          landmarks,
          handedness,
          frameCapture ?? null,
        );
      }
    },
    [handleParallelProcessing],
  );

  const handleAcknowledgeOpenAISuggestion = useCallback(
    (suggestion?: string) => {
      logger.info(suggestion ? 'OpenAI suggestion angewendet' : 'OpenAI-Vorschlag bestätigt', { suggestion });
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
    if (typeof Animated.loop !== 'function') {
      return undefined;
    }
    pulseLoopRef.current?.stop();
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(capturePulseAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(capturePulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoopRef.current = animation;
    animation.start();
    return () => {
      animation.stop();
      pulseLoopRef.current = null;
    };
  }, [capturePulseAnim]);

  usePreloadComponents(['GestureMeaningDisplay']);

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

  const normalizedStatus = (status ?? '').toLowerCase();

  const statusCategory = useMemo<RecognitionStatusCategory>(() => {
    if (error) {
      return 'error';
    }
    if (modelUpdateStatus === 'updating') {
      return 'updating';
    }
    if (
      showCelebration ||
      gestureMeaningDisplayProps ||
      status.startsWith('✅') ||
      status.startsWith('✨') ||
      status.toLowerCase().includes('danke') ||
      status.toLowerCase().includes('modell einsatzbereit')
    ) {
      return 'recognized';
    }
    if (
      normalizedStatus.includes('höre') ||
      normalizedStatus.includes('suche') ||
      normalizedStatus.includes('fokussiere') ||
      normalizedStatus.includes('fast') ||
      normalizedStatus.includes('warte') ||
      normalizedStatus.includes('lade ein neues modell')
    ) {
      return 'listening';
    }
    return 'idle';
  }, [
    error,
    gestureMeaningDisplayProps,
    modelUpdateStatus,
    normalizedStatus,
    showCelebration,
    status,
  ]);

  const statusLabel = useMemo(() => {
    switch (statusCategory) {
      case 'recognized':
        return 'Gefunden';
      case 'listening':
      case 'updating':
        return 'Hört zu…';
      case 'error':
        return 'Fehler';
      default:
        return 'Bereit';
    }
  }, [statusCategory]);

  const bannerMessage = useMemo(() => {
    if (error) {
      return error;
    }
    if (statusCategory === 'recognized' || statusCategory === 'updating') {
      return status?.trim().length ? status : statusLabel;
    }
    return null;
  }, [error, status, statusCategory, statusLabel]);

  const bannerTone: 'info' | 'success' | 'warning' | 'error' = useMemo(() => {
    if (error) return 'error';
    if (statusCategory === 'recognized') return 'success';
    if (statusCategory === 'updating') return 'warning';
    return 'info';
  }, [error, statusCategory]);

  const bannerVisible = Boolean(bannerMessage);

  const loopStage = useMemo<LoopStageKey>(() => {
    if (modelUpdateStatus === 'updating' || normalizedStatus.includes('lerne')) {
      return 'learn';
    }
    if (normalizedStatus.includes('modell einsatzbereit')) {
      return 'learn';
    }
    if (showCelebration) {
      return 'speak';
    }
    if (gestureMeaningDisplayProps) {
      return showOpenaiFeedback ? 'think' : 'confirm';
    }
    if (
      showOpenaiFeedback ||
      normalizedStatus.includes('fokussiere') ||
      normalizedStatus.includes('suche') ||
      normalizedStatus.includes('warte') ||
      normalizedStatus.includes('prüfe')
    ) {
      return 'think';
    }
    return 'see';
  }, [
    gestureMeaningDisplayProps,
    modelUpdateStatus,
    normalizedStatus,
    showCelebration,
    showOpenaiFeedback,
  ]);

  const handleConfirmGesture = useCallback(() => {
    if (!gestureMeaningDisplayProps) {
      logger.info('Confirm pressed without active gesture');
      return;
    }
    const { gestureId, confidence } = gestureMeaningDisplayProps;
    logger.info('Gesture confirmed', {
      label: gestureId,
      path: recognitionPath,
      confidence,
    });
    startFeedbackAnimation();
    void triggerSpeakAndShow(gestureId, confidence ?? 0, startFeedbackAnimation);
  }, [gestureMeaningDisplayProps, recognitionPath, startFeedbackAnimation]);

  const handleLearnPress = useCallback(() => {
    const gestureId = gestureMeaningDisplayProps?.gestureId;
    logger.info('Open learn flow', { gestureId });
    navigation.navigate('Lernen', gestureId ? { gestureId } : undefined);
  }, [gestureMeaningDisplayProps, navigation]);

  const handleAlternativesPress = useCallback(() => {
    logger.info('Alternativen geöffnet');
    navigation.navigate('Lernen', undefined);
  }, [navigation]);

  return (
    <>
      <LinearGradient colors={['#EFF6FF', '#F3F4F6']} style={styles.container}>
        <MediaPipeGestureDetector
          onGestureDetected={processGesture}
          onLandmarks={(landmarks, handedness) => handleGestureDetected(null, 0, landmarks, handedness)}
          onError={handleGestureError}
          onWebViewEvent={(telemetry) => logger.info('WebView telemetry:', telemetry)}
          onModelUpdateStatus={handleModelUpdateStatus}
          facingMode={facingMode}
          gestureSizeTolerance={gestureSizeTolerance}
        />

        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <HandLandmarkPreview
            landmarks={currentLandmarks}
            handedness={currentHandedness}
            mirror={facingMode === 'user'}
            confidence={gestureConfidence}
          />

          <View style={styles.overlay}>
            <View style={styles.topSection}>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: STATUS_CHIP_BACKGROUND[statusCategory] },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: STATUS_CHIP_TEXT[statusCategory] },
                  ]}
                >
                  {status?.trim().length ? status : statusLabel}
                </Text>
              </View>
              <View style={styles.loopWrapper}>
                <AmyLoopTimeline
                  activeStage={loopStage}
                  mode="overlay"
                  compact
                  hideDescriptions
                />
              </View>
              {bannerVisible ? (
                <View style={styles.bannerWrapper}>
                  <FeedbackBanner visible={bannerVisible} message={bannerMessage!} tone={bannerTone} />
                </View>
              ) : null}
            </View>

            <View style={styles.cameraZone}>
              <View style={styles.cameraFrame}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.capturePulse,
                    {
                      transform: [{ scale: capturePulseAnim }],
                    },
                  ]}
                />
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.cameraHint}>Hand im Rahmen halten.</Text>
            </View>

            <View style={styles.bottomSection}>
              {gestureMeaningDisplayProps ? (
                <Animated.View style={[styles.predictionCard, { opacity: fadeAnim }]}>
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
                </Animated.View>
              ) : null}

              <View style={styles.actionsRow}>
                <View style={styles.actionWrapper}>
                  <ActionButton
                    label="Stimmt"
                    accessibilityLabel="Gestenerkennung bestätigen"
                    onPress={handleConfirmGesture}
                    variant="primary"
                    style={styles.actionButton}
                  />
                </View>
                <View style={styles.actionWrapper}>
                  <ActionButton
                    label="Lernen"
                    accessibilityLabel="Lernmodus öffnen"
                    onPress={handleLearnPress}
                    variant="secondary"
                    style={styles.actionButton}
                  />
                </View>
                <View style={styles.actionWrapper}>
                  <ActionButton
                    label="Alternativen"
                    accessibilityLabel="Alternativen anzeigen"
                    onPress={handleAlternativesPress}
                    variant="accent"
                    style={styles.actionButton}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {showCelebration && <Celebration key={celebrationKey} />}
      </LinearGradient>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  topSection: {
    width: '100%',
    alignItems: 'center',
  },
  loopWrapper: {
    width: '100%',
    marginBottom: spacing.md,
  },
  statusChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  statusText: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
  },
  bannerWrapper: {
    width: '100%',
  },
  cameraZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFrame: {
    width: '88%',
    aspectRatio: 3 / 4,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  capturePulse: {
    position: 'absolute',
    width: CAPTURE_PULSE_SIZE,
    height: CAPTURE_PULSE_SIZE,
    borderRadius: CAPTURE_PULSE_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.primary,
    opacity: 0.35,
  },
  corner: {
    position: 'absolute',
    width: spacing['2xl'],
    height: spacing['2xl'],
    borderColor: Colors.cameraFrame,
    borderWidth: spacing.xs,
  },
  cornerTopLeft: {
    top: spacing.lg,
    left: spacing.lg,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTopRight: {
    top: spacing.lg,
    right: spacing.lg,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBottomLeft: {
    bottom: spacing.lg,
    left: spacing.lg,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBottomRight: {
    bottom: spacing.lg,
    right: spacing.lg,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  cameraHint: {
    marginTop: spacing.lg,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium as any,
    color: Colors.textSecondary,
  },
  bottomSection: {
    paddingBottom: spacing['2xl'],
  },
  predictionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  actionWrapper: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  actionButton: {
    width: '100%',
  },
});
