import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import ActionButton from '../components/ActionButton';
import CameraFrame from '../components/CameraFrame';
import { logger } from '../utils/logger';
import { loadProfile } from '../storage';
import type { GestureImageCapture } from '../services/openaiGestureValidationService';
import type { FrameCapturePayload } from '../types/frames';
import { optimizedGestureService } from '../services/optimizedGestureService';

import { usePreloadComponents } from '../components/LazyComponent';
import Celebration from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { getCachedMlpMeta, onMlpModelUpdated } from '../services/dgsModelClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import GestureMeaningDisplay from '../components/GestureMeaningDisplay';
import type { TabNavigationProp } from '../navigation/types';
import { APP_TAB_ROUTES, LERNEN_STACK_ROUTES } from '../navigation/types';
import { useRecognitionState } from '../hooks/useRecognitionState';
import { useRecognitionCallbacks } from '../hooks/useRecognitionCallbacks';
import { useOpenAIValidation } from '../hooks/useOpenAIValidation';
import { useParallelProcessing } from '../hooks/useParallelProcessing';
import {
  cloneLandmarks,
  adjustHandednessForMirror,
  createHandLandmarkStabilizer,
  type StabilizedHands,
} from '../utils/landmarkUtils';
import OpenAIGestureFeedback from '../components/OpenAIGestureFeedback';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import {
  CAMERA_TOGGLE_COPY,
  getCameraFacingText,
  getCameraStatusText,
  getCameraToggleActionText,
  getNextCameraFacingMode,
} from '../constants/cameraToggle';
import { triggerSpeakAndShow } from '../services/feedbackService';
import { OneEuroFilter } from '../services/OneEuroFilter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { childFriendlyStyles } from '../styles/touchTargets';

const DEFAULT_FRAME_WIDTH = 640;
const DEFAULT_FRAME_HEIGHT = 480;
const HAND_PREVIEW_STABILIZER_TTL_MS = 1800;
type RecognitionStatusCategory = 'idle' | 'listening' | 'recognized' | 'updating' | 'error';

const CAMERA_THEME = {
  gradient: [Colors.backgroundStart, Colors.backgroundEnd] as const,
  panelBackground: 'rgba(7, 33, 36, 0.28)',
  cameraHintBubbleBackground: 'rgba(6, 30, 33, 0.24)',
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
  capturePulseOpacity: 0.4,
  cameraHint: Colors.cameraGuideText,
  cameraHintMuted: Colors.cameraGuideTextMuted,
  predictionCardBackground: 'rgba(255, 255, 255, 0.82)',
  predictionCardBorder: 'rgba(255, 255, 255, 0.42)',
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

const OVERLAY_TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.45)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 6,
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
    description: 'Dein Beitrag verbessert das Wörterbuch der App.',
  },
  error: {
    label: 'Bitte nochmal',
    description: 'Etwas ist schiefgelaufen. Probier es erneut.',
  },
};

// Reserve space for the primary action row plus the secondary row, including the gap between them.
const ACTION_BUTTON_MIN_HEIGHT = 56;
const COMPACT_SECONDARY_ACTIONS_BREAKPOINT = 360; // px width threshold for stacking secondary actions
const COMPACT_HEIGHT_BREAKPOINT = 720; // px height threshold for switching to scrollable layout
const WIDE_LAYOUT_BREAKPOINT = 900; // px width threshold for switching to split layout
const HANDSET_LAYOUT_BREAKPOINT = 640; // px width threshold for compact handset layout tweaks
const ACTIONS_SLOT_MIN_HEIGHT = ACTION_BUTTON_MIN_HEIGHT * 2 + spacing.sm;
const COMPACT_ACTIONS_SLOT_MIN_HEIGHT =
  ACTION_BUTTON_MIN_HEIGHT * 3 + spacing.sm * 2;
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

  let mimeType = 'image/jpeg';
  if (typeof uri === 'string' && uri.startsWith('data:image/')) {
    const mimeEnd = uri.indexOf(';', 'data:'.length);
    if (mimeEnd > 0) {
      mimeType = uri.slice('data:'.length, mimeEnd);
    }
  }

  if (!uri || !uri.startsWith('data:image/')) {
    uri = `data:${mimeType};base64,${base64}`;
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
  navigation: TabNavigationProp<typeof APP_TAB_ROUTES.Recognition>;
}) {
  const dimensions = useWindowDimensions();
  const fallbackWindow = Dimensions.get('window');
  const fallbackWidth =
    typeof fallbackWindow?.width === 'number'
      ? fallbackWindow.width
      : COMPACT_SECONDARY_ACTIONS_BREAKPOINT + 1;
  const fallbackHeight =
    typeof fallbackWindow?.height === 'number' && fallbackWindow.height > 0
      ? fallbackWindow.height
      : 800;

  const windowWidth =
    Number.isFinite(dimensions.width) && dimensions.width > 0
      ? dimensions.width
      : fallbackWidth;
  const windowHeight =
    Number.isFinite(dimensions.height) && dimensions.height > 0
      ? dimensions.height
      : fallbackHeight;

  const isWideLayout = windowWidth >= WIDE_LAYOUT_BREAKPOINT;
  const isCompactSecondaryActions = windowWidth <= COMPACT_SECONDARY_ACTIONS_BREAKPOINT;
  const isCompactHeight = windowHeight <= COMPACT_HEIGHT_BREAKPOINT;
  const isHandsetLayout = !isWideLayout && windowWidth < HANDSET_LAYOUT_BREAKPOINT;
  const { showToast } = useMessage();
  const { getSuccessMessage } = useThemeMessages();
  const insets = useSafeAreaInsets();

  const overlaySpacingStyle = useMemo(
    () => ({
      paddingTop: insets.top + (isHandsetLayout ? spacing.md : spacing['2xl']),
      paddingBottom: insets.bottom + (isHandsetLayout ? spacing.md : spacing['2xl']),
      paddingHorizontal: isWideLayout
        ? spacing['2xl'] + spacing.lg
        : windowWidth <= 420 || isHandsetLayout
          ? spacing.md
          : spacing['2xl'],
    }),
    [insets.bottom, insets.top, isHandsetLayout, isWideLayout, windowWidth],
  );

  const constrainedContentStyle = useMemo(
    () => (!isWideLayout && windowWidth >= 720 ? styles.wideContent : undefined),
    [isWideLayout, windowWidth],
  );

  const state = useRecognitionState();
  const {
    profile,
    setProfile,
    status,
    error,
    gestureConfidence,
    lastSuccessfulConfidence,
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
    modelUpdateStatus,
    recognitionPath,
  } = state;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const confidenceFilterRef = useRef(new OneEuroFilter(1.2, 0.007, 1.0));
  const labelHistoryRef = useRef<string[]>([]);
  const lastSuccessAtRef = useRef<number>(0);
  const lastGestureIdRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastModelUpdateTimeRef = useRef<number>(0);
  const handStabilizerRef = useRef(
    createHandLandmarkStabilizer({ ttlMs: HAND_PREVIEW_STABILIZER_TTL_MS, maxHands: 2 }),
  );
  const latestFrameRef = useRef<GestureImageCapture | null>(null);
  const activeGestureRef = useRef<string | null>(null);

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
  }, [facingMode]);

  useEffect(() => {
    let isCancelled = false;
    const unsub = onMlpModelUpdated(() => {
      const activeProfileId = profile?.id;
      void (async () => {
        let message = 'Neues Modell geladen';
        try {
          const meta = await getCachedMlpMeta(activeProfileId);
          if (isCancelled) {
            return;
          }
          if (meta?.source === 'profile') {
            message =
              meta.profileId && activeProfileId && meta.profileId !== activeProfileId
                ? 'Personalisierte Modellversion wurde geladen.'
                : 'Danke! Dein persönliches Modell wurde gerade aktualisiert.';
          } else if (meta?.source === 'global') {
            message = 'Gemeinsames Modell aktualisiert – danke fürs Mitmachen!';
          }
        } catch (error) {
          if (!isCancelled) {
            logger.warn('Konnte Modell-Metadaten nach Update nicht laden', error);
          }
        } finally {
          if (!isCancelled) {
            showToast({ message, tone: 'success', durationMs: 2000 });
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

  const stabilizeHands = useCallback(
    (landmarks: number[][][], handedness: string[]): StabilizedHands => {
      const mirrored = facingMode === 'user';
      const safeLandmarks = cloneLandmarks(landmarks);
      const adjustedHandedness = adjustHandednessForMirror(handedness ?? [], mirrored);
      return handStabilizerRef.current.update(safeLandmarks, adjustedHandedness);
    },
    [facingMode],
  );

  const updateHandPreview = useCallback(
    (landmarks: number[][][], handedness: string[]): StabilizedHands =>
      stabilizeHands(landmarks, handedness),
    [stabilizeHands],
  );

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
      activeGestureRef,
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
      const stabilized = updateHandPreview(landmarks, handedness);
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
    [baseHandleGestureDetected, updateHandPreview],
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

  const toggleFacingMode = useCallback(() => {
    setFacingMode((prev) => getNextCameraFacingMode(prev));
  }, [setFacingMode]);

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

    const sequenceConfidence = sequenceMeaning
      ? sequenceMatch?.matchConfidence
      : null;
    const directConfidence = detectedGestureMeaning?.confidence;
    const stableConfidence =
      typeof sequenceConfidence === 'number'
        ? sequenceConfidence
        : typeof directConfidence === 'number'
        ? directConfidence
        : lastSuccessfulConfidence;
    const confidence = Number.isFinite(stableConfidence) && stableConfidence >= 0
      ? stableConfidence
      : gestureConfidence;

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
    lastSuccessfulConfidence,
    lastRecognizedGesture,
    sequenceMatch,
    sequenceMeaning,
  ]);

  const safeStatus = typeof status === 'string' ? status : '';
  const normalizedStatus = safeStatus.toLowerCase();
  const hasActiveGesture = Boolean(gestureMeaningDisplayProps);
  const [renderActions, setRenderActions] = useState(hasActiveGesture);
  const showGestureActions = renderActions;
  const actionsFadeAnim = useRef(new Animated.Value(hasActiveGesture ? 1 : 0)).current;
  const fadeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [actionsPointerEvents, setActionsPointerEvents] = useState<'none' | 'auto'>(
    hasActiveGesture ? 'auto' : 'none',
  );
  const actionsAccessibilityHidden = showGestureActions
    ? actionsPointerEvents === 'none'
    : false;
  const [isHandsetPanelExpanded, setIsHandsetPanelExpanded] = useState(!isHandsetLayout);

  useEffect(() => {
    setIsHandsetPanelExpanded(!isHandsetLayout);
  }, [isHandsetLayout]);

  useEffect(() => {
    if (hasActiveGesture) {
      setRenderActions(true);
    }
  }, [hasActiveGesture]);

  useEffect(() => {
    if (fadeAnimationRef.current) {
      fadeAnimationRef.current.stop();
      fadeAnimationRef.current = null;
    }

    if (hasActiveGesture) {
      setActionsPointerEvents('auto');
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
      return () => {
        fadeInAnimation.stop();
        fadeAnimationRef.current = null;
      };
    }

    if (!renderActions) {
      setActionsPointerEvents('none');
      actionsFadeAnim.setValue(0);
      return undefined;
    }

    const fadeOutAnimation = Animated.timing(actionsFadeAnim, {
      toValue: 0,
      duration: 250,
      easing: Easing.ease,
      useNativeDriver: true,
    });
    fadeAnimationRef.current = fadeOutAnimation;
    fadeOutAnimation.start(({ finished }) => {
      if (finished) {
        setActionsPointerEvents('none');
        setRenderActions(false);
      }
      fadeAnimationRef.current = null;
    });

    return () => {
      fadeOutAnimation.stop();
      fadeAnimationRef.current = null;
    };
  }, [actionsFadeAnim, hasActiveGesture, renderActions]);

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
      safeStatus.startsWith('✅') ||
      safeStatus.startsWith('✨') ||
      normalizedStatus.includes('danke') ||
      normalizedStatus.includes('modell einsatzbereit')
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
    safeStatus,
  ]);

  const statusCopy = useMemo(() => STATUS_COPY[statusCategory], [statusCategory]);
  const statusLabel = statusCopy.label;
  const statusDetail = useMemo(() => {
    const trimmedError = error?.trim();
    if (trimmedError) {
      return trimmedError;
    }

    const trimmedStatus = safeStatus.trim();
    if (trimmedStatus && trimmedStatus.length > 0) {
      return trimmedStatus;
    }

    return statusCopy.description;
  }, [error, safeStatus, statusCopy]);

  const encouragement =
    statusCategory === 'recognized' ? statusCopy.encouragement ?? null : null;

  const statusCardBackground = CAMERA_THEME.statusBackground[statusCategory];
  const statusCardText = CAMERA_THEME.statusText[statusCategory];
  const statusCardBorder =
    statusCategory === 'recognized' || statusCategory === 'updating'
      ? Colors.overlayBadgeBorder
      : Colors.overlayPlaceholderBorder;

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
    navigation.navigate(APP_TAB_ROUTES.Lernen, {
      screen: gestureId
        ? LERNEN_STACK_ROUTES.Recording
        : LERNEN_STACK_ROUTES.LernenHome,
      params: gestureId ? { gestureId } : undefined,
    });
  }, [gestureMeaningDisplayProps, navigation]);

  const handleAlternativesPress = useCallback(() => {
    logger.info('Alternativen geöffnet');
    navigation.navigate(APP_TAB_ROUTES.Lernen, {
      screen: LERNEN_STACK_ROUTES.LernenHome,
    });
  }, [navigation]);

  const topPanel = (
    <View
      style={[
        styles.overlayPanel,
        constrainedContentStyle,
        isWideLayout && styles.overlayPanelWide,
        isHandsetLayout && styles.handsetPanel,
      ]}
    >
      <View style={styles.topSection}>
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: statusCardBackground,
              borderColor: statusCardBorder,
            },
            isHandsetLayout && styles.handsetStatusCard,
          ]}
          accessibilityRole="text"
        >
          <Text
            style={[
              styles.statusLabel,
              { color: statusCardText },
              isHandsetLayout && styles.handsetStatusLabel,
            ]}
          >
            {statusLabel}
          </Text>
          {statusDetail ? (
            <Text
              style={[
                styles.statusDetail,
                { color: statusCardText },
                isHandsetLayout && styles.handsetStatusDetail,
              ]}
            >
              {statusDetail}
            </Text>
          ) : null}
          {encouragement ? (
            <Text
              style={[
                styles.statusEncouragement,
                { color: statusCardText },
                isHandsetLayout && styles.handsetStatusEncouragement,
              ]}
            >
              {encouragement}
            </Text>
          ) : null}
        </View>

        <View style={[styles.cameraToggleRow, isHandsetLayout && styles.handsetCameraToggleRow]}>
          <Text style={[styles.cameraToggleLabel, isHandsetLayout && styles.handsetCameraToggleLabel]}>
            {getCameraStatusText(facingMode)}
          </Text>
          <Pressable
            onPress={toggleFacingMode}
            accessibilityRole="button"
            accessibilityLabel={CAMERA_TOGGLE_COPY.accessibilityLabel}
            accessibilityHint={CAMERA_TOGGLE_COPY.accessibilityHint}
            accessibilityValue={{ text: getCameraFacingText(facingMode) }}
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.cameraToggleButton,
              pressed && styles.cameraToggleButtonPressed,
              isHandsetLayout && styles.handsetCameraToggleButton,
            ]}
          >
            <Text style={[styles.cameraToggleText, isHandsetLayout && styles.handsetCameraToggleText]}>
              {getCameraToggleActionText(facingMode)}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const cameraSection = (
    <View
      style={[
        styles.cameraZone,
        constrainedContentStyle,
        isWideLayout && styles.cameraZoneWide,
        isHandsetLayout && styles.handsetCameraZone,
      ]}
    >
      <View style={styles.cameraPreviewContainer}>
        <MediaPipeGestureDetector
          onGestureDetected={processGesture}
          onError={handleGestureError}
          onWebViewEvent={(telemetry) => {
            if (__DEV__) {
              const safePayload = {
                event: telemetry?.event,
                timestamp: telemetry?.timestamp,
              };
              logger.debug('WebView telemetry', safePayload);
            }
          }}
          onModelUpdateStatus={handleModelUpdateStatus}
          facingMode={facingMode}
          gestureSizeTolerance={gestureSizeTolerance}
        />
        <View pointerEvents="none" style={styles.cameraOverlay}>
          <CameraFrame
            capturePulseAnim={capturePulseAnim}
            pulseOpacity={CAMERA_THEME.capturePulseOpacity}
            style={styles.cameraFrame}
          />
          <View
            style={[
              styles.cameraHintBubble,
              isWideLayout && styles.cameraHintBubbleWide,
              isHandsetLayout && styles.handsetCameraHintBubble,
            ]}
          >
            <Text style={[styles.cameraHint, isHandsetLayout && styles.handsetCameraHint]}>
              Hand ruhig im Rahmen halten.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const shouldExpandHandsetBottom = Boolean(gestureMeaningDisplayProps) || showGestureActions;

  const bottomPanelContent = (
    <View
      style={[
        styles.bottomSection,
        isHandsetLayout && styles.handsetBottomSection,
        isHandsetLayout && shouldExpandHandsetBottom && styles.handsetBottomSectionExpanded,
      ]}
    >
      {gestureMeaningDisplayProps ? (
        <Animated.View
          style={[
            styles.predictionCard,
            { opacity: fadeAnim },
            isHandsetLayout && styles.handsetPredictionCard,
          ]}
        >
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
        <View
          style={[
            styles.predictionPlaceholder,
            isHandsetLayout && styles.handsetPredictionPlaceholder,
          ]}
          accessible
          accessibilityRole="text"
        >
          <Text
            accessibilityRole="header"
            style={[
              styles.predictionPlaceholderTitle,
              isHandsetLayout && styles.handsetPredictionTitle,
            ]}
          >
            Zeig Amy deine Geste
          </Text>
          <Text
            style={[
              styles.predictionPlaceholderSubtitle,
              isHandsetLayout && styles.handsetPredictionSubtitle,
            ]}
          >
            Sobald Amy dich entdeckt, erscheint hier deine Stimme.
          </Text>
        </View>
      )}

      <View
        style={[
          styles.actionsSlot,
          isCompactSecondaryActions && styles.actionsSlotCompact,
          isHandsetLayout && styles.handsetActionsSlot,
          !showGestureActions && styles.actionsSlotCollapsed,
        ]}
      >
        <View
          testID="recognition-actions"
          pointerEvents={showGestureActions ? actionsPointerEvents : 'none'}
          accessibilityElementsHidden={
            showGestureActions ? actionsAccessibilityHidden : false
          }
          importantForAccessibility={
            showGestureActions && actionsAccessibilityHidden ? 'no-hide-descendants' : 'auto'
          }
          collapsable={false}
          style={[styles.actionsHost, isHandsetLayout && styles.handsetActionsHost]}
        >
          {showGestureActions ? (
            <Animated.View
              style={[
                styles.actionsContainer,
                { opacity: actionsFadeAnim },
                isHandsetLayout && styles.handsetActionsContainer,
              ]}
            >
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
              <View
                style={[
                  styles.secondaryActionsBase,
                  isCompactSecondaryActions
                    ? styles.secondaryActionsColumn
                    : styles.secondaryActionsRow,
                  isHandsetLayout && styles.handsetSecondaryActions,
                ]}
              >
                <ActionButton
                  label="Lernen"
                  accessibilityLabel="Lernmodus öffnen"
                  onPress={handleLearnPress}
                  backgroundColor={CAMERA_THEME.actionButtons.learn.background}
                  pressedBackgroundColor={CAMERA_THEME.actionButtons.learn.pressed}
                  textColor={CAMERA_THEME.actionButtons.learn.text}
                  style={[
                    styles.secondaryActionButton,
                    isCompactSecondaryActions
                      ? styles.secondaryActionButtonColumn
                      : styles.secondaryActionButtonRow,
                    isCompactSecondaryActions && styles.secondaryActionCompact,
                  ]}
                />
                <ActionButton
                  label="Alternativen"
                  accessibilityLabel="Alternativen anzeigen"
                  onPress={handleAlternativesPress}
                  backgroundColor={CAMERA_THEME.actionButtons.alternatives.background}
                  pressedBackgroundColor={CAMERA_THEME.actionButtons.alternatives.pressed}
                  textColor={CAMERA_THEME.actionButtons.alternatives.text}
                  style={[
                    styles.secondaryActionButton,
                    isCompactSecondaryActions
                      ? styles.secondaryActionButtonColumn
                      : styles.secondaryActionButtonRow,
                    isCompactSecondaryActions && styles.secondaryActionCompact,
                  ]}
                />
              </View>
            </Animated.View>
          ) : (
            <View
              accessibilityRole="text"
              style={[
                styles.actionsPlaceholder,
                isHandsetLayout && styles.handsetActionsPlaceholder,
              ]}
              pointerEvents="none"
            >
              <Text style={styles.actionsPlaceholderTitle}>Aktionen erscheinen hier.</Text>
              <Text style={styles.actionsPlaceholderSubtitle}>
                Sobald Amy deine Geste erkennt, kannst du hier bestätigen oder lernen.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const bottomPanel = (
    <View
      style={[
        styles.overlayPanel,
        styles.overlayPanelBottom,
        constrainedContentStyle,
        isWideLayout && styles.overlayPanelWide,
        isHandsetLayout && styles.handsetPanel,
      ]}
    >
      {isHandsetLayout ? (
        <>
          <Pressable
            onPress={() => setIsHandsetPanelExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isHandsetPanelExpanded }}
            style={({ pressed }) => [
              styles.handsetBottomToggle,
              pressed && styles.handsetBottomTogglePressed,
            ]}
          >
            <View style={styles.handsetBottomToggleRow}>
              <Text style={styles.handsetBottomTitle}>Aktionen &amp; Stimme</Text>
              <Text style={styles.handsetBottomChevron}>
                {isHandsetPanelExpanded ? '▾' : '▸'}
              </Text>
            </View>
            <Text style={styles.handsetBottomSubtitle}>
              {isHandsetPanelExpanded ? 'Tippe, um zu schließen' : 'Tippe, um zu öffnen'}
            </Text>
          </Pressable>
          <View
            style={[
              styles.handsetBottomContent,
              !isHandsetPanelExpanded && styles.handsetBottomContentCollapsed,
            ]}
            pointerEvents={isHandsetPanelExpanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!isHandsetPanelExpanded}
            importantForAccessibility={
              isHandsetPanelExpanded ? 'auto' : 'no-hide-descendants'
            }
            collapsable={false}
          >
            {bottomPanelContent}
          </View>
        </>
      ) : (
        bottomPanelContent
      )}
    </View>
  );

  const overlayBody = isWideLayout ? (
    <View style={styles.wideLayout}>
      <View style={styles.wideCameraColumn}>{cameraSection}</View>
      <View style={styles.wideSidebar}>
        {topPanel}
        {bottomPanel}
      </View>
    </View>
  ) : (
    <>
      {cameraSection}
      {topPanel}
      {bottomPanel}
    </>
  );

  return (
    <>
      <LinearGradient colors={CAMERA_THEME.gradient} style={styles.container}>
        {isCompactHeight ? (
          <ScrollView
            style={styles.overlayScrollContainer}
            contentContainerStyle={[
              styles.overlay,
              styles.overlayScrollable,
              overlaySpacingStyle,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {overlayBody}
          </ScrollView>
        ) : (
          <View style={[styles.overlay, overlaySpacingStyle]}>{overlayBody}</View>
        )}
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
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  wideLayout: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing['2xl'],
  },
  wideCameraColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  wideSidebar: {
    flexShrink: 0,
    width: 360,
    maxWidth: 400,
    gap: spacing['2xl'],
  },
  overlayScrollContainer: {
    flex: 1,
  },
  overlayScrollable: {
    flexGrow: 1,
  },
  overlayPanel: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: CAMERA_THEME.panelBackground,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlayBadgeBorder,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
    marginBottom: spacing.xl,
  },
  handsetPanel: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    gap: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(7, 33, 36, 0.18)',
  },
  overlayPanelWide: {
    marginBottom: 0,
  },
  overlayPanelBottom: {
    marginBottom: 0,
  },
  topSection: {
    width: '100%',
    alignItems: 'stretch',
    gap: spacing.lg,
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
  handsetStatusCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderRadius: 20,
  },
  statusLabel: {
    fontSize: typography.sizes.titleSm,
    fontWeight: typography.weights.semibold as any,
    letterSpacing: 0.5,
    textAlign: 'center',
    ...OVERLAY_TEXT_SHADOW,
  },
  handsetStatusLabel: {
    fontSize: typography.sizes.body,
    letterSpacing: 0.2,
  },
  statusDetail: {
    fontSize: typography.sizes.body,
    lineHeight: typography.lineHeights.relaxed,
    textAlign: 'center',
    opacity: 0.94,
    ...OVERLAY_TEXT_SHADOW,
  },
  handsetStatusDetail: {
    fontSize: typography.sizes.body,
    lineHeight: typography.lineHeights.default,
  },
  statusEncouragement: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.medium as any,
    letterSpacing: 0.4,
    textAlign: 'center',
    opacity: 0.88,
    ...OVERLAY_TEXT_SHADOW,
  },
  handsetStatusEncouragement: {
    letterSpacing: 0.2,
    fontSize: typography.sizes.caption,
  },
  cameraToggleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.overlaySurface,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: Colors.overlayBadgeBorder,
  },
  handsetCameraToggleRow: {
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cameraToggleLabel: {
    flex: 1,
    marginRight: spacing.md,
    fontSize: typography.sizes.body,
    color: Colors.overlayText,
  },
  handsetCameraToggleLabel: {
    flexBasis: '100%',
    marginRight: 0,
  },
  cameraToggleButton: {
    borderRadius: 16,
    backgroundColor: Colors.actionSecondaryBackgroundMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  handsetCameraToggleButton: {
    paddingHorizontal: spacing.md,
  },
  cameraToggleButtonPressed: {
    backgroundColor: Colors.actionSecondaryPressed,
  },
  cameraToggleText: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold as any,
    color: Colors.overlayText,
  },
  handsetCameraToggleText: {
    fontSize: typography.sizes.body,
    letterSpacing: 0.2,
  },
  cameraZone: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    minHeight: 300,
  },
  cameraZoneWide: {
    marginBottom: 0,
    paddingHorizontal: spacing['2xl'],
  },
  handsetCameraZone: {
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    flex: 2,
    minHeight: 320,
  },
  cameraPreviewContainer: {
    width: '100%',
    maxWidth: 720,
    aspectRatio: 3 / 4,
    borderRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(6, 30, 33, 0.24)',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFrame: {
    height: '100%',
  },
  cameraHintBubble: {
    position: 'absolute',
    bottom: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: CAMERA_THEME.cameraHintBubbleBackground,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlayBadgeBorder,
  },
  cameraHintBubbleWide: {
    bottom: spacing['2xl'] + spacing.md,
  },
  handsetCameraHintBubble: {
    bottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 30, 33, 0.15)',
  },
  cameraHint: {
    fontSize: typography.sizes.bodyLg,
    fontWeight: typography.weights.semibold as any,
    color: CAMERA_THEME.cameraHint,
    textAlign: 'center',
  },
  handsetCameraHint: {
    fontSize: typography.sizes.body,
  },
  bottomSection: {
    width: '100%',
    gap: spacing.lg,
    flexShrink: 0,
  },
  handsetBottomSection: {
    gap: spacing.xs,
    flexShrink: 1,
    maxHeight: '30%',
  },
  handsetBottomSectionExpanded: {
    maxHeight: '50%',
  },
  actionsSlot: {
    minHeight: ACTIONS_SLOT_MIN_HEIGHT,
    width: '100%',
    justifyContent: 'flex-end',
  },
  actionsSlotCompact: {
    minHeight: COMPACT_ACTIONS_SLOT_MIN_HEIGHT,
  },
  handsetActionsSlot: {
    minHeight: 0,
    paddingBottom: spacing.xs,
  },
  actionsSlotCollapsed: {
    minHeight: 0,
    justifyContent: 'flex-start',
    paddingTop: spacing.sm,
  },
  actionsHost: {
    width: '100%',
  },
  handsetActionsHost: {
    width: '100%',
  },
  actionsPlaceholder: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  handsetActionsPlaceholder: {
    gap: spacing.xs,
  },
  actionsPlaceholderTitle: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium as any,
    color: CAMERA_THEME.cameraHint,
    textAlign: 'center',
  },
  actionsPlaceholderSubtitle: {
    fontSize: typography.sizes.caption,
    color: CAMERA_THEME.cameraHintMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
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
  handsetPredictionCard: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  predictionPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 24,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
    alignItems: 'center',
    gap: spacing.sm,
  },
  handsetPredictionPlaceholder: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  predictionPlaceholderTitle: {
    fontSize: typography.sizes.titleSm,
    fontWeight: typography.weights.semibold as any,
    color: CAMERA_THEME.cameraHint,
    textAlign: 'center',
    ...OVERLAY_TEXT_SHADOW,
  },
  handsetPredictionTitle: {
    fontSize: typography.sizes.label,
  },
  predictionPlaceholderSubtitle: {
    fontSize: typography.sizes.body,
    color: CAMERA_THEME.cameraHintMuted,
    textAlign: 'center',
    ...OVERLAY_TEXT_SHADOW,
  },
  handsetPredictionSubtitle: {
    fontSize: typography.sizes.body,
    lineHeight: typography.lineHeights.default,
  },
  actionsContainer: {
    gap: spacing.sm,
    width: '100%',
    alignItems: 'stretch',
  },
  handsetActionsContainer: {
    gap: spacing.md,
  },
  primaryActionWrapper: {
    width: '100%',
  },
  primaryActionButton: {
    width: '100%',
  },
  secondaryActionsBase: {
    width: '100%',
    gap: spacing.sm,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  secondaryActionsColumn: {
    flexDirection: 'column',
  },
  handsetSecondaryActions: {
    gap: spacing.sm,
  },
  secondaryActionButton: {},
  secondaryActionButtonRow: {
    flex: 1,
  },
  secondaryActionButtonColumn: {
    width: '100%',
  },
  secondaryActionCompact: {
    paddingHorizontal: spacing.xl,
  },
  handsetBottomToggle: {
    borderRadius: 20,
    backgroundColor: Colors.overlaySurface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlayBadgeBorder,
    gap: spacing.xs,
  },
  handsetBottomTogglePressed: {
    backgroundColor: Colors.overlaySurfaceMuted,
  },
  handsetBottomToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  handsetBottomTitle: {
    fontSize: typography.sizes.bodyLg,
    fontWeight: typography.weights.semibold as any,
    color: Colors.overlayText,
  },
  handsetBottomChevron: {
    fontSize: typography.sizes.subtitle,
    color: Colors.overlayText,
  },
  handsetBottomSubtitle: {
    fontSize: typography.sizes.caption,
    color: Colors.overlayText,
    opacity: 0.8,
  },
  handsetBottomContent: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  handsetBottomContentCollapsed: {
    height: 0,
    maxHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    paddingTop: 0,
    gap: 0,
  },
  wideContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
});
