import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Animated,
  Easing,
  SafeAreaView,
  Switch,
  Dimensions,
  Pressable,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, useCameraDevices, CameraRuntimeError } from 'react-native-vision-camera';
import { useCameraPermissionStatus } from '../hooks/useCameraPermissionStatus';
import { useIsFocused } from '@react-navigation/native';
import CorrectionPanel from '../components/CorrectionPanel';
import SymbolVideoPlayer from '../components/SymbolVideoPlayer';
import { loadProfile, Profile, logCorrection } from '../storage';
import {
  audioService,
  triggerSpeakAndShow,
  correctionService,
  announceGestureRecognition,
  createGestureAccessibilityLabel,
} from '../services';
import { assessOcclusion } from '../services/GestureOcclusion';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { database } from '../../db';
import { Correction, GestureDefinition } from '../../db/models';
import { dialogEngine, LLMSuggestionResponse } from '../services';
import { incrementUsage } from '../services';
import { gestureModel, GestureModelEntry } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { getSymbolLabelForGesture } from '../components/gestureMap';
import { useGestureClassifier } from '../services';
import BottomNav from '../components/BottomNav';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import Svg, { Circle, Line } from 'react-native-svg';
import { HAND_CONNECTIONS } from '../constants/hand';
import ErrorMessage from '../components/ErrorMessage';
import { logger } from '../utils/logger';
import { ModelPerformanceMonitor } from '../services/ModelPerformanceMonitor';
import { telemetry } from '../telemetry/recorder';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

export default function RecognitionScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("I'm listening...");
  const [statusA11y, setStatusA11y] = useState("I'm listening...");
  const updateStatus = useCallback((msg: string, a11yMsg?: string) => {
    setStatus(msg);
    setStatusA11y(a11yMsg ?? msg);
  }, []);
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<LLMSuggestionResponse>({
    nextWords: [],
    caregiverPhrases: [],
  });
  const [dialogContext, setDialogContext] = useState<string[]>([]);
  const [useDgs, setUseDgs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [correctionOptions, setCorrectionOptions] = useState<{ id: string; label: string }[]>([]);
  const [pendingGesture, setPendingGesture] = useState<string | null>(null);
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState<GestureModelEntry | null>(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [weakGesture, setWeakGesture] = useState<GestureDefinition | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const { hasPermission, requestPermission } = useCameraPermissionStatus();
  const [lastDetection, setLastDetection] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [landmarks, setLandmarks] = useState<number[][]>([]);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [showManualInputMode, setShowManualInputMode] = useState(false);
  const [showStaticMode, setShowStaticMode] = useState(false);
  const [showFallbackMode, setShowFallbackMode] = useState(false);
  const [occlusionHints, setOcclusionHints] = useState<string[] | null>(null);
  const neutralCooldownRef = useRef<number>(0);
  const [lastResultAt, setLastResultAt] = useState<number>(0);
  const [showNeutralHint, setShowNeutralHint] = useState(false);
  const perfMonitorRef = useRef(new ModelPerformanceMonitor(60));
  const [showPerfBanner, setShowPerfBanner] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugStats, setDebugStats] = useState<{ medianLatency: number; offlineRatio: number; cloudRatio: number }>({
    medianLatency: 0,
    offlineRatio: 0,
    cloudRatio: 0,
  });

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;

  const devices = useCameraDevices();
  const device =
    devices.find((d) => d.position === 'back') ??
    devices.find((d) => d.position === 'front') ??
    devices[0];
  const camera = useRef<Camera>(null);
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  const canUseCamera =
    hasPermission && device != null && isFocused && isCameraActive && appState === 'active';

  const showUserFriendlyMessage = (msg: string) => setProcessingError(msg);
  const showPermissionGuide = () =>
    setProcessingError('Camera permission denied. Please enable it in settings.');
  const logErrorToAnalytics = (error: any) => logger.error('Camera error logged:', error);
  const handleCameraDisconnect = () => setProcessingError('Camera disconnected');

  const handleCameraError = useCallback(
    (error: CameraRuntimeError) => {
      logger.error('Camera error:', error);
      const code = (error.code as string) || '';
      switch (code) {
        case 'device/camera-not-available':
          setShowManualInputMode(true);
          showUserFriendlyMessage('Camera not available. You can still use manual selection.');
          break;
        case 'device/no-device':
          setShowStaticMode(true);
          break;
        case 'permission/camera-permission-denied':
          showPermissionGuide();
          break;
        default:
          logErrorToAnalytics(error);
          setShowFallbackMode(true);
      }
    },
    [],
  );

  const monitorCameraHealth = useCallback(() => {
    const healthCheck = setInterval(async () => {
      try {
        if (camera.current && device) {
          const devices = await Camera.getAvailableCameraDevices();
          if (!devices.find((d) => d.id === device.id)) {
            handleCameraDisconnect();
          }
        }
      } catch (error) {
        logger.warn('Camera health check failed:', error);
      }
    }, 5000);
    return () => clearInterval(healthCheck);
  }, [device]);

  const handleRequestPermission = useCallback(async () => {
    logger.debug('Requesting camera permission...');
    await requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    const cleanup = monitorCameraHealth();
    return cleanup;
  }, [monitorCameraHealth]);

  useEffect(() => {
    loadProfile().then(setProfile);
    const fetchWeakGesture = async () => {
      const gesture = await adaptiveLearningService.getWeakGesture();
      setWeakGesture(gesture);
      if (gesture) {
        try {
          await audioService.playEncouragement(gesture.name);
        } catch (error) {
          logger.warn('Encouragement audio failed:', error);
        }
      }
    };
    fetchWeakGesture();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showDebug) return;
    const id = setInterval(() => {
      try {
        const data = telemetry.dump() as any[];
        if (data.length === 0) {
          setDebugStats({ medianLatency: 0, offlineRatio: 0, cloudRatio: 0 });
          return;
        }
        const lat = data.map((d: any) => d.latencyMs).sort((a: number, b: number) => a - b);
        const mid = Math.floor(lat.length / 2);
        const median = lat.length % 2 ? lat[mid] : (lat[mid - 1] + lat[mid]) / 2;
        const offline = data.filter((d: any) => d.path === 'offline').length;
        const cloud = data.filter((d: any) => d.path === 'cloud').length;
        const total = data.length;
        setDebugStats({
          medianLatency: Math.round(median),
          offlineRatio: total ? Math.round((offline / total) * 100) : 0,
          cloudRatio: total ? Math.round((cloud / total) * 100) : 0,
        });
      } catch {}
    }, 1500);
    return () => clearInterval(id);
  }, [showDebug]);

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
  }, [fadeAnim, symbolScaleAnim]);

  const handleHelpPress = () => {
    setShowCorrection(true);
    setShowHelp(false);
    startFeedbackAnimation();
  };

  const handleCancelCorrection = () => {
    if (pendingGesture) {
      correctionService.logNegativeSample(pendingGesture);
    }
    setShowCorrection(false);
    setShowHelp(false);
    setIsProcessing(false);
    updateStatus("I'm listening...");
  };

  const onGestureResult = useCallback(async (result: any, detectedLandmarks: number[][]) => {
    setLastDetection(Date.now());
    setLandmarks(detectedLandmarks);
    setProcessingError(null);
    setLastResultAt(Date.now());

    // Assess occlusion to guide user positioning
    try {
      const assessment = assessOcclusion(detectedLandmarks);
      setOcclusionHints(assessment.occluded ? assessment.hints : null);
    } catch {}

    // Update performance monitor
    try {
      perfMonitorRef.current.add({
        t: Date.now(),
        label: result?.label ?? 'uncertain',
        confidence: result?.confidence ?? 0,
        requiresConfirmation: result?.requiresConfirmation ?? true,
      });
      setShowPerfBanner(perfMonitorRef.current.isDegraded());
    } catch {}
    if (isProcessing) return;

    if (
      result &&
      result.label &&
      result.label !== 'uncertain' &&
      !result.requiresConfirmation
    ) {
      setIsProcessing(true);

      const recognizedSymbolLabel =
        getSymbolLabelForGesture(result.label) || result.label;
      const entry =
        gestureModel.gestures.find((g) => g.id === result.label) || {
          id: result.label,
          label: recognizedSymbolLabel,
          videoUri: undefined,
          dgsVideoUri: undefined,
        };

      setLastRecognizedGesture(entry);
      updateStatus(
        recognizedSymbolLabel,
        createGestureAccessibilityLabel(recognizedSymbolLabel, result.confidence),
      );
      announceGestureRecognition(recognizedSymbolLabel, result.confidence);
      startFeedbackAnimation();
      triggerSpeakAndShow(
        recognizedSymbolLabel,
        result.confidence,
        () => {
          if (useDgs && entry.dgsVideoUri) {
            setShowVideoPlayer(true);
          } else if (entry.videoUri) {
            setShowVideoPlayer(true);
          }
        },
      ).catch((error) => {
        logger.warn('Feedback failed:', error);
      });

      if (profile) {
        try {
          incrementUsage(entry, profile.id);
        } catch (error) {
          logger.warn('Usage tracking failed:', error);
        }
      }

      try {
        const adv = await dialogEngine.getLLMSuggestions({
          input: recognizedSymbolLabel,
          context: dialogContext,
          language: 'de',
          age: 4,
        });
        setSuggestions(adv);
        setDialogContext((ctx) => {
          const next = [...ctx, recognizedSymbolLabel];
          return next.slice(-5);
        });
      } catch (error) {
        logger.warn('Failed to get LLM suggestions:', error);
      }

      setTimeout(() => {
        setIsProcessing(false);
        updateStatus("I'm listening...");
      }, 3000);
    } else if (result && result.requiresConfirmation) {
      setIsProcessing(true);
      setPendingGesture(result.label);
      const opts =
        result.suggestions && result.suggestions.length > 0
          ? result.suggestions
          : [result.label];
      const mapped = opts.map((id: string) => ({
        id,
        label: getSymbolLabelForGesture(id) || id,
      }));
      setCorrectionOptions(mapped);
      setLastRecognizedGesture(null);
      updateStatus("Can you help me?");
      setShowHelp(true);
      startFeedbackAnimation();
      audioService.playErrorFeedback().catch((error) => {
        logger.warn('Error feedback failed:', error);
      });
    }
  }, [isProcessing, useDgs, profile, startFeedbackAnimation, updateStatus]);

  const frameProcessor = useGestureClassifier(onGestureResult, isProcessing, setProcessingError);
  const detectionActive = now - lastDetection < 1000;

  useEffect(() => {
    if (!detectionActive) setLandmarks([]);
  }, [detectionActive]);

  // Neutral UX fail-safe: periodically reassure user when there is no result
  useEffect(() => {
    const id = setInterval(async () => {
      const ts = Date.now();
      const noFrames = ts - lastDetection > 3000;
      const noResults = ts - lastResultAt > 4000;
      if (canUseCamera && !isProcessing && (noFrames || noResults) && ts >= neutralCooldownRef.current) {
        try {
          await audioService.speak('Ich bin hier und höre zu.');
          try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
          setShowNeutralHint(true);
          setTimeout(() => setShowNeutralHint(false), 2000);
        } catch {}
        neutralCooldownRef.current = ts + 7000;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [canUseCamera, isProcessing, lastDetection, lastResultAt]);

  const handleSelect = async (choiceId: string) => {
    try {
      await database.write(async () => {
        const collection = database.get<Correction>('corrections');
        await collection.create((r) => {
          r.predictedGesture = pendingGesture || 'unknown';
          r.actualGesture = choiceId;
          r.confidence = 0;
          r.landmarks = [];
          r.timestamp = Date.now();
          r.isSynced = false;
        });
      });

      await logCorrection(choiceId);

      const entry =
        gestureModel.gestures.find((g) => g.id === choiceId) || {
          id: choiceId,
          label: getSymbolLabelForGesture(choiceId) || choiceId,
          videoUri: undefined,
          dgsVideoUri: undefined,
        };

      setShowCorrection(false);
      setShowHelp(false);
      setLastRecognizedGesture(entry);
      updateStatus(entry.label, createGestureAccessibilityLabel(entry.label, 1));
      announceGestureRecognition(entry.label, 1);
      startFeedbackAnimation();
      audioService
        .playSuccessFeedback(entry.label, 1)
        .catch((error) => {
          logger.warn('Audio feedback failed:', error);
        });

      if (useDgs && entry.dgsVideoUri) {
        setShowVideoPlayer(true);
      } else if (entry.videoUri) {
        setShowVideoPlayer(true);
      }

      if (profile) {
        try {
          incrementUsage(entry, profile.id);
        } catch (error) {
          logger.warn('Usage tracking failed:', error);
        }
      }

      try {
        const adv = await dialogEngine.getLLMSuggestions({
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

      setPendingGesture(null);
      setTimeout(() => {
        setIsProcessing(false);
        updateStatus("I'm listening...");
        navigation.navigate('Training', { gestureLabel: pendingGesture, isPractice: true });
      }, 3000);
    } catch (error) {
      logger.error('Failed to save correction:', error);
      setIsProcessing(false);
    }
  };

  const handleAddNew = () => {
    setShowCorrection(false);
    setShowHelp(false);
    setIsProcessing(false);
    navigation.navigate('Training');
  };

  const handleVideoEnd = useCallback(() => {
    setShowVideoPlayer(false);
  }, []);

  const handleWeakGestureBannerPress = () => {
    if (weakGesture) {
      navigation.navigate('Training', { gestureLabel: weakGesture.name, isPractice: true });
      setWeakGesture(null);
    }
  };

  if (showManualInputMode || showStaticMode || showFallbackMode) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Camera unavailable</Text>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    cameraContainer: {
      flex: 1,
      position: 'relative',
    },
    camera: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: `${COLORS.highContrastBackground}4D`,
    },
    detectionIndicator: {
      position: 'absolute',
      top: SPACING.md,
      left: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.xs,
    },
    detectionText: {
      color: COLORS.highContrastText,
      fontSize: largeText ? 18 : 16,
    },
    status: {
      fontSize: largeText ? 48 : 40,
      fontWeight: 'bold',
      marginBottom: SPACING.lg,
      textAlign: 'center',
      color: COLORS.highContrastText,
      textShadowColor: `${COLORS.highContrastBackground}CC`,
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    },
    symbolDisplay: {
      fontSize: largeText ? 120 : 100,
      marginBottom: SPACING.lg,
      textShadowColor: `${COLORS.highContrastBackground}CC`,
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    },
    controls: {
      position: 'absolute',
      bottom: 96,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: `${COLORS.surface}E6`,
      borderRadius: RADIUS * 2,
      padding: SPACING.md,
    },
    suggestion: {
      fontSize: largeText ? 18 : 14,
      marginBottom: SPACING.sm,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    toggleLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    cameraToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: SPACING.sm,
    },
    helpButton: {
      flex: 1,
      backgroundColor: COLORS.primaryAccent,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
    },
    helpButtonText: {
      color: COLORS.highContrastText,
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
    },
    videoPlayerContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: width,
      height: height,
      backgroundColor: COLORS.highContrastBackground,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    weakGestureBanner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: COLORS.warning,
      padding: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
    },
    weakGestureBannerText: {
      color: COLORS.text,
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.md,
    },
    permissionText: {
      fontSize: largeText ? 20 : 18,
      textAlign: 'center',
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    debugOverlay: {
      position: 'absolute',
      bottom: SPACING.lg,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: `${COLORS.highContrastBackground}B3`,
      padding: SPACING.sm,
      borderRadius: RADIUS,
    },
    debugText: {
      color: COLORS.highContrastText,
      textAlign: 'center',
    },
    performanceBanner: {
      position: 'absolute',
      top: SPACING.md,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: `${COLORS.primaryAccent}E6`,
      padding: SPACING.md,
      borderRadius: RADIUS,
      zIndex: 1000,
    },
    performanceText: {
      color: COLORS.highContrastText,
      textAlign: 'center',
      fontWeight: '600',
    },
    occlusionBanner: {
      position: 'absolute',
      top: SPACING.xl,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: `${COLORS.warning}CC`,
      padding: SPACING.sm,
      borderRadius: RADIUS,
      zIndex: 998,
    },
    occlusionText: {
      color: COLORS.highContrastText,
      textAlign: 'center',
      fontWeight: '600',
    },
  });

  if (!hasPermission) {
    const gradientColors = highContrast
      ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
      : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>
              Amy's Echo needs camera access to recognize gestures.
            </Text>
            <Button title="Grant Camera Permission" onPress={handleRequestPermission} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!device) {
    const gradientColors = highContrast
      ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
      : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>No camera available on this device.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
      {weakGesture && (
        <Pressable
          onPress={handleWeakGestureBannerPress}
          style={styles.weakGestureBanner}
          accessibilityRole="button"
          accessibilityLabel="Practice weak gesture again"
        >
          <Text style={styles.weakGestureBannerText}>
            Let's try this one again: {weakGesture.name}
          </Text>
        </Pressable>
      )}

      {showVideoPlayer && lastRecognizedGesture ? (
        <View style={styles.videoPlayerContainer}>
          <SymbolVideoPlayer
            entry={lastRecognizedGesture}
            paused={!showVideoPlayer}
            useDgs={useDgs}
            onEnd={handleVideoEnd}
          />
        </View>
      ) : (
        <View style={styles.cameraContainer}>
          {canUseCamera && (
            <Camera
              ref={camera}
              style={styles.camera}
              device={device}
              isActive={true}
              frameProcessor={frameProcessor}
              pixelFormat="yuv"
              // YUV avoids extra color conversion, improving ML inference
              onError={handleCameraError}
            />
          )}

          <View style={styles.overlay}>
            {showPerfBanner && (
              <View style={styles.performanceBanner}>
                <Text style={styles.performanceText}>
                  Recognition seems inconsistent. Try a quick practice?
                </Text>
                <View style={{ height: SPACING.xs }} />
                <Button title="Practice" onPress={() => navigation.navigate('Training', { isPractice: true })} />
              </View>
            )}
            {occlusionHints && occlusionHints.length > 0 && (
              <View style={styles.occlusionBanner}>
                {occlusionHints.map((h, i) => (
                  <Text key={`occ-${i}`} style={styles.occlusionText}>{h}</Text>
                ))}
              </View>
            )}
            {landmarks.length > 0 && (
              <Svg
                style={StyleSheet.absoluteFill}
                viewBox={`0 0 ${width} ${height}`}
                pointerEvents="none"
              >
                {HAND_CONNECTIONS.map(([startIdx, endIdx], idx) => {
                  const start = landmarks[startIdx];
                  const end = landmarks[endIdx];
                  if (!start || !end) return null;
                  return (
                    <Line
                      key={`conn-${idx}`}
                      x1={start[0] * width}
                      y1={start[1] * height}
                      x2={end[0] * width}
                      y2={end[1] * height}
                      stroke={COLORS.warning}
                      strokeWidth={3}
                    />
                  );
                })}
                {landmarks.map((l, idx) => (
                  <Circle key={`point-${idx}`} cx={l[0] * width} cy={l[1] * height} r={5} fill={COLORS.warning} />
                ))}
              </Svg>
            )}
            <ErrorMessage message={processingError} />
            <View style={styles.detectionIndicator}>
              <View
                style={[styles.dot, { backgroundColor: detectionActive ? COLORS.success : COLORS.warning }]}
              />
              <Text style={styles.detectionText}>
                {detectionActive ? 'Hand detected' : 'No hand'}
              </Text>
            </View>

            <Animated.Text
              onLongPress={() => setShowDebug((v) => !v)}
              style={[styles.status]}
              accessibilityLabel={statusA11y}
            >
              {status}
            </Animated.Text>

            {showDebug && (
              <View style={styles.debugOverlay}>
                <Text style={styles.debugText}>Median latency: {debugStats.medianLatency} ms</Text>
                <Text style={styles.debugText}>Offline: {debugStats.offlineRatio}% · Cloud: {debugStats.cloudRatio}%</Text>
              </View>
            )}

            {showNeutralHint && !lastRecognizedGesture && (
              <Animated.Text
                style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}
              >
                {'🤔'}
              </Animated.Text>
            )}
            {lastRecognizedGesture && lastRecognizedGesture.label !== 'uncertain' && (
              <Animated.Text
                style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}
              >
                {lastRecognizedGesture.label}
              </Animated.Text>
            )}
          </View>

          <View style={styles.controls}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show DGS Video</Text>
              <Switch
                value={useDgs}
                onValueChange={setUseDgs}
                accessibilityLabel="Toggle DGS video"
              />
            </View>

            {showHelp && (
              <View style={styles.buttonRow}>
                <Pressable
                  style={styles.helpButton}
                  onPress={handleHelpPress}
                  accessibilityRole="button"
                  accessibilityLabel="Open correction panel"
                >
                  <Text style={styles.helpButtonText}>Help Me</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {showCorrection && (
        <CorrectionPanel
          onSelect={handleSelect}
          onAddNew={handleAddNew}
          onCancel={handleCancelCorrection}
          suggestions={correctionOptions}
        />
      )}

      {!showCorrection && (
        <Button
          title="Correction"
          testID="btn-correction"
          accessibilityLabel="Open correction screen"
          onPress={() => navigation.navigate('Correction')}
        />
      )}

      {profile && <BottomNav active="recognition" profileId={profile.id} />}
    </SafeAreaView>
    </LinearGradient>
  );
}
