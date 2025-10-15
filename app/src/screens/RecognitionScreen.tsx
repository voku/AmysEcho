import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import ActionButton from '../components/ActionButton';
import CameraFrame from '../components/CameraFrame';
import { logger } from '../utils/logger';
import { loadProfile } from '../storage';
import type { GestureImageCapture } from '../services/openaiGestureValidationService';
import type { FrameCapturePayload } from '../types/frames';
import { flattenHandsWithHandedness } from '../services/handUtils';
import type { RecognitionPath } from '../utils/recognitionState';
import { optimizedGestureService } from '../services/optimizedGestureService';

import { usePreloadComponents } from '../components/LazyComponent';
import Celebration from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { getCachedMlpMeta, onMlpModelUpdated } from '../services/dgsModelClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import GestureMeaningDisplay from '../components/GestureMeaningDisplay';
import type { TabNavigationProp } from '../navigation/types';
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
import { OneEuroFilter } from '../services/OneEuroFilter';

const DEFAULT_FRAME_WIDTH = 640;
const DEFAULT_FRAME_HEIGHT = 480;
type RecognitionStatusCategory = 'idle' | 'listening' | 'recognized' | 'updating' | 'error';

const CAMERA_THEME = {
  gradient: [Colors.backgroundStart, Colors.backgroundEnd] as const,
  overlayScrim: 'rgba(13, 58, 61, 0.58)',
  statusBackground: {
    idle: Colors.statusListeningBackground,
    listening: Colors.statusListeningBackground,
    recognized: Colors.statusRecognisingBackground,
    updating: Colors.statusLearningBackground,
    error: Colors.statusErrorBackground,
  } satisfies Record<RecognitionStatusCategory, string>,
  statusText: {
    idle: Colors.statusListeningText,
    listening: Colors.statusListeningText,
    recognized: Colors.statusRecognisingText,
    updating: Colors.statusLearningText,
    error: Colors.statusErrorText,
  } satisfies Record<RecognitionStatusCategory, string>,
  capturePulseOpacity: 0.55,
  cameraHint: Colors.cameraGuideText,
  cameraHintMuted: Colors.cameraGuideTextMuted,
  predictionCardBackground: 'rgba(255, 255, 255, 0.92)',
  predictionCardBorder: Colors.overlayBadgeBorder,
  predictionCardText: Colors.neutral,
  actionButtons: {
    confirm: {
      background: Colors.cameraActionConfirmBackground,
      pressed: Colors.cameraActionConfirmPressed,
      text: Colors.cameraActionConfirmText,
    },
    learn: {
      background: Colors.cameraActionLearnBackground,
      pressed: Colors.cameraActionLearnPressed,
      text: Colors.cameraActionLearnText,
    },
    alternatives: {
      background: Colors.cameraActionAlternativesBackground,
      pressed: Colors.cameraActionAlternativesPressed,
      text: Colors.cameraActionAlternativesText,
    },
  },
} as const;

const STATUS_COPY: Record<
  RecognitionStatusCategory,
  { label: string; description: string; encouragement?: string }
> = {
  idle: {
    label: 'Bereit',
    description: 'Halte deine Hand ruhig im Rahmen.',
  },
  listening: {
    label: 'Hört zu…',
    description: '',
  },
  recognized: {
    label: 'Selbstentdeckung',
    description: 'Amy bereitet deine Antwort vor.',
    encouragement: 'Tolle Geste – gleich klingt deine Stimme.',
  },
  updating: {
    label: 'Lernt gerade',
    description: 'Dein Beitrag stärkt Amys Wörterbuch.',
  },
  error: {
    label: 'Bitte nochmal',
    description: 'Etwas ist schiefgelaufen. Probier es erneut.',
  },
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
  navigation: TabNavigationProp<'Recognition'>;
}) {
  const { showToast } = useMessage();
  const { getSuccessMessage } = useThemeMessages();

  const state = useRecognitionState();
  const {
    profile,
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
  const actionsFadeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const hasActiveGestureRef = useRef(false);
  const [renderActions, setRenderActions] = useState(false);
  const confidenceFilterRef = useRef(new OneEuroFilter(1.2, 0.007, 1.0));
  const labelHistoryRef = useRef<string[]>([]);
  const lastSuccessAtRef = useRef<number>(0);
  const lastGestureIdRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastModelUpdateTimeRef = useRef<number>(0);
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
    handStabilizerRef.current.reset();
    setCurrentLandmarks([]);
    setCurrentHandedness([]);
  }, [facingMode]);

  useEffect(() => {
    let isCancelled = false;
    const unsub = onMlpModelUpdated(() => {
      const activeProfileId = profile?.id;
      void (async () => {
        try {
          const meta = await getCachedMlpMeta(activeProfileId);
          if (isCancelled) {
            return;
          }
          let message = 'Neues Modell geladen';
          if (meta?.source === 'profile') {
            message = 'Danke! Dein persönliches Modell wurde gerade aktualisiert.';
            if (meta.profileId && activeProfileId && meta.profileId !== activeProfileId) {
              message = 'Personalisierte Modellversion wurde geladen.';
            }
          } else if (meta?.source === 'global') {
            message = 'Gemeinsames Modell aktualisiert – danke fürs Mitmachen!';
          }
          showToast({ message, tone: 'success', durationMs: 2000 });
        } catch (error) {
          if (!isCancelled) {
            logger.warn('Konnte Modell-Metadaten nach Update nicht laden', error);
            showToast({ message: 'Neues Modell geladen', tone: 'success', durationMs: 2000 });
          }
        }
      })();
    });
    return () => {
      isCancelled = true;
      unsub();
    };
  }, [profile?.id, showToast]);

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
      return baseHandleGestureDetected(
        processedGesture,
        processedConfidence,
        stabilized.landmarks,
        stabilized.handedness,
        'local',
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
  const hasActiveGesture = Boolean(gestureMeaningDisplayProps);

  useEffect(() => {
    hasActiveGestureRef.current = hasActiveGesture;
  }, [hasActiveGesture]);

  useEffect(() => {
    if (fadeAnimationRef.current) {
      fadeAnimationRef.current.stop();
      fadeAnimationRef.current = null;
    }

    if (hasActiveGesture) {
      setRenderActions(true);
      const fadeInAnimation = Animated.timing(actionsFadeAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.ease,
        useNativeDriver: true,
      });
      fadeAnimationRef.current = fadeInAnimation;
      fadeInAnimation.start(({ finished }) => {
        if (!finished) {
          return;
        }
        fadeAnimationRef.current = null;
      });
    } else {
      const fadeOutAnimation = Animated.timing(actionsFadeAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.ease,
        useNativeDriver: true,
      });
      fadeAnimationRef.current = fadeOutAnimation;
      fadeOutAnimation.start(({ finished }) => {
        if (finished && !hasActiveGestureRef.current) {
          setRenderActions(false);
        }
        fadeAnimationRef.current = null;
      });
    }

    return () => {
      if (fadeAnimationRef.current) {
        fadeAnimationRef.current.stop();
        fadeAnimationRef.current = null;
      }
    };
  }, [actionsFadeAnim, hasActiveGesture]);

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

  const statusCopy = useMemo(() => STATUS_COPY[statusCategory], [statusCategory]);
  const statusLabel = statusCopy.label;
  const statusDetail = useMemo(() => {
    const trimmedError = error?.trim();
    if (trimmedError) {
      return trimmedError;
    }

    const trimmedStatus = status?.trim();
    if (trimmedStatus && trimmedStatus.length > 0) {
      return trimmedStatus;
    }

    return statusCopy.description;
  }, [error, status, statusCopy]);

  const encouragement =
    statusCategory === 'recognized' ? statusCopy.encouragement ?? null : null;

  const statusCardBackground = CAMERA_THEME.statusBackground[statusCategory];
  const statusCardText = CAMERA_THEME.statusText[statusCategory];

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
      <LinearGradient colors={CAMERA_THEME.gradient} style={styles.container}>
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
                  styles.statusCard,
                  {
                    backgroundColor: statusCardBackground,
                    borderColor: statusCardBackground,
                  },
                ]}
                accessibilityRole="text"
              >
                <Text style={[styles.statusLabel, { color: statusCardText }]}>{statusLabel}</Text>
                {statusDetail ? (
                  <Text style={[styles.statusDetail, { color: statusCardText }]}>{statusDetail}</Text>
                ) : null}
                {encouragement ? (
                  <Text style={[styles.statusEncouragement, { color: statusCardText }]}>{encouragement}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.cameraZone}>
              <CameraFrame capturePulseAnim={capturePulseAnim} pulseOpacity={CAMERA_THEME.capturePulseOpacity} />
              <Text style={styles.cameraHint}>Hand ruhig im Rahmen halten.</Text>
            </View>

            <View style={styles.bottomSection}>
              {gestureMeaningDisplayProps ? (
                <Animated.View style={[styles.predictionCard, { opacity: fadeAnim }]}>
                  <GestureMeaningDisplay
                    gestureId={gestureMeaningDisplayProps.gestureId}
                    confidence={gestureMeaningDisplayProps.confidence}
                    showDetails
                    detailsStartCollapsed
                    size="large"
                    gestureDefinition={gestureMeaningDisplayProps.gestureDefinition}
                    gestureMeta={lastRecognizedGesture}
                    openaiValidationResult={openaiValidationResult}
                    sequenceGestures={gestureMeaningDisplayProps.sequenceGestures}
                    tone="camera"
                  />
                </Animated.View>
              ) : (
                <View style={styles.predictionPlaceholder}>
                  <Text style={styles.predictionPlaceholderTitle}>Zeig Amy deine Geste</Text>
                  <Text style={styles.predictionPlaceholderSubtitle}>
                    Sobald Amy dich entdeckt, erscheint hier deine Stimme.
                  </Text>
                </View>
              )}

              {renderActions ? (
                <Animated.View style={[styles.actionsContainer, { opacity: actionsFadeAnim }]}> 
                  <View style={styles.primaryActionWrapper}>
                    <ActionButton
                      label="Stimmt"
                      accessibilityLabel="Gestenerkennung bestätigen"
                      onPress={handleConfirmGesture}
                      backgroundColor={CAMERA_THEME.actionButtons.confirm.background}
                      pressedBackgroundColor={CAMERA_THEME.actionButtons.confirm.pressed}
                      textColor={CAMERA_THEME.actionButtons.confirm.text}
                      style={styles.primaryActionButton}
                    />
                  </View>
                  <View style={styles.secondaryActionsRow}>
                    <ActionButton
                      label="Lernen"
                      accessibilityLabel="Lernmodus öffnen"
                      onPress={handleLearnPress}
                      backgroundColor={CAMERA_THEME.actionButtons.learn.background}
                      pressedBackgroundColor={CAMERA_THEME.actionButtons.learn.pressed}
                      textColor={CAMERA_THEME.actionButtons.learn.text}
                      style={styles.secondaryActionButton}
                    />
                    <ActionButton
                      label="Alternativen"
                      accessibilityLabel="Alternativen anzeigen"
                      onPress={handleAlternativesPress}
                      backgroundColor={CAMERA_THEME.actionButtons.alternatives.background}
                      pressedBackgroundColor={CAMERA_THEME.actionButtons.alternatives.pressed}
                      textColor={CAMERA_THEME.actionButtons.alternatives.text}
                      style={styles.secondaryActionButton}
                    />
                  </View>
                </Animated.View>
              ) : null}
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
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    backgroundColor: CAMERA_THEME.overlayScrim,
  },
  topSection: {
    width: '100%',
    alignItems: 'stretch',
  },
  statusCard: {
    width: '100%',
    borderRadius: 28,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing['2xl'],
    gap: spacing.sm,
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 1,
  },
  statusLabel: {
    fontSize: typography.sizes.titleSm,
    fontWeight: typography.weights.semibold as any,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statusDetail: {
    fontSize: typography.sizes.body,
    lineHeight: typography.lineHeights.relaxed,
    textAlign: 'center',
    opacity: 0.88,
  },
  statusEncouragement: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.medium as any,
    letterSpacing: 0.4,
    textAlign: 'center',
    opacity: 0.75,
  },
  cameraZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cameraHint: {
    marginTop: spacing.lg,
    fontSize: typography.sizes.bodyLg,
    fontWeight: typography.weights.semibold as any,
    color: CAMERA_THEME.cameraHint,
    textAlign: 'center',
  },
  bottomSection: {
    paddingBottom: spacing['2xl'],
    width: '100%',
    gap: spacing.lg,
  },
  predictionCard: {
    backgroundColor: CAMERA_THEME.predictionCardBackground,
    borderRadius: 24,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing['2xl'],
    borderWidth: 1,
    borderColor: CAMERA_THEME.predictionCardBorder,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  predictionPlaceholder: {
    backgroundColor: Colors.overlayPlaceholderBackground,
    borderRadius: 24,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    borderWidth: 1,
    borderColor: Colors.overlayPlaceholderBorder,
    alignItems: 'center',
    gap: spacing.sm,
  },
  predictionPlaceholderTitle: {
    fontSize: typography.sizes.titleSm,
    fontWeight: typography.weights.semibold as any,
    color: CAMERA_THEME.cameraHint,
    textAlign: 'center',
  },
  predictionPlaceholderSubtitle: {
    fontSize: typography.sizes.body,
    color: CAMERA_THEME.cameraHintMuted,
    textAlign: 'center',
  },
  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  primaryActionWrapper: {
    width: '100%',
  },
  primaryActionButton: {
    width: '100%',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  secondaryActionButton: {
    flex: 1,
  },
});
