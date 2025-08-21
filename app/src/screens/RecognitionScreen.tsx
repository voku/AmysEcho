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
import {
  Camera,
  useCameraDevices,
  CameraRuntimeError,
  useCameraFormat,
} from 'react-native-vision-camera';
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
  playSymbolVideo,
  gestureDataProtector,
  ChildSessionManager,
  mlService,
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
// ML pipeline is provided by mlService via the hybrid frame processor
import { recognizeGestureRemotely } from '../services/remoteGestureRecognitionService';
import { useHybridFrameProcessor } from '../services/HybridRecognizer';
import BottomNav from '../components/BottomNav';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { mapToPreview } from '../utils/landmarkMapping';
import { isResizePluginAvailable } from '../services/landmarkExtractor';
import Svg, { Circle, Line } from 'react-native-svg';
import { HAND_CONNECTIONS } from '../constants/hand';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import { ModelPerformanceMonitor } from '../services/ModelPerformanceMonitor';
import { telemetry } from '../telemetry/recorder';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { fetchCentroids, getCachedCentroids } from '../services/dgsModelClient';
import { classifyWithCentroids } from '../services/offlineClassifier';
import { sendDgsSample } from '../services/dgsTrainingService';
import { LOCAL_CONFIDENCE_THRESHOLD } from '../config/recognition';
import { determineRecognitionState, type RecognitionPath } from '../utils/recognitionState';

const { width, height } = Dimensions.get('window');

interface RecognitionResult {
  gesture: string;
  confidence: number;
  source: 'local' | 'cloud' | 'centroid';
}

const CLOUD_FALLBACK_TIMEOUT = 2000; // 2 seconds

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
  const [landmarksRaw, setLandmarksRaw] = useState<number[][]>([]);
  const [renderPoints, setRenderPoints] = useState<number[][]>([]);
  const [previewRect, setPreviewRect] = useState({ x: 0, y: 0, width, height });
  const { setMessage } = useMessage();
  const [showManualInputMode, setShowManualInputMode] = useState(false);
  const [showStaticMode, setShowStaticMode] = useState(false);
  const [showFallbackMode, setShowFallbackMode] = useState(false);
  const [occlusionHints, setOcclusionHints] = useState<string[] | null>(null);
  const [usingOffline, setUsingOffline] = useState(false);
  const [remoteFailures, setRemoteFailures] = useState(0);
  const neutralCooldownRef = useRef<number>(0);
  const [lastResultAt, setLastResultAt] = useState<number>(0);
  const [showNeutralHint, setShowNeutralHint] = useState(false);
  const perfMonitorRef = useRef(new ModelPerformanceMonitor(60));
  const [showPerfBanner, setShowPerfBanner] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugStats, setDebugStats] = useState<{
    medianLatency: number;
    offlineRatio: number;
    cloudRatio: number;
    fps: number;
    queueDepth: number;
    circuitOpen: boolean;
    lastLatency: number;
    pluginUsed?: boolean;
  }>({
    medianLatency: 0,
    offlineRatio: 0,
    cloudRatio: 0,
    fps: 0,
    queueDepth: 0,
    circuitOpen: false,
    lastLatency: 0,
    pluginUsed: undefined,
  });
  const [classifierUsed, setClassifierUsed] = useState<'tflite' | 'centroid' | 'remote' | null>(null);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const sessionManagerRef = useRef<ChildSessionManager | null>(null);
  const latestResultId = useRef(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;

  const [currentGesture, setCurrentGesture] = useState<string>('');
  const [gestureConfidence, setGestureConfidence] = useState<number>(0);
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [recognitionState, setRecognitionState] = useState<'listening' | 'thinking' | 'confident' | 'uncertain'>('listening');
  const lastPathRef = useRef<RecognitionPath | null>(null);

  const evaluateConfidence = useCallback((confidence: number, source: RecognitionPath) => {
    lastPathRef.current = source;
    const state = determineRecognitionState(confidence, LOCAL_CONFIDENCE_THRESHOLD);
    setRecognitionState(state);
    setShowUncertainty(state === 'uncertain');
  }, []);

  // Legacy local/centroid/cloud path removed in favor of mlService hybrid processor


  // Support both VisionCamera returns: array (v4) and object with keys (older)
  const devices = useCameraDevices() as any;
  const deviceList: any[] = Array.isArray(devices)
    ? devices
    : [devices?.back, devices?.front, devices?.external].filter(Boolean);
  const device =
    deviceList.find((d) => d.position === 'back') ??
    deviceList.find((d) => d.position === 'front') ??
    deviceList[0];
  const format = useCameraFormat(device, [{ videoResolution: { width: 1280, height: 720 }, fps: 30 }]);
  const mirror = device?.position === 'front';
  const camera = useRef<Camera>(null);
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  const canUseCamera =
    hasPermission && device != null && isFocused && isCameraActive && appState === 'active';

  const showUserFriendlyMessage = useCallback(
    (msg: string) => setMessage(msg),
    [setMessage],
  );
  const showPermissionGuide = () =>
    setMessage('Camera permission denied. Please enable it in settings.');
  const logErrorToAnalytics = (error: any) => logger.error('Camera error logged:', error);
  const handleCameraDisconnect = () => setMessage('Camera disconnected');

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

  // Hybrid ML frame processor: feeds results + metrics for the unified debug overlay
  const frameProcessor = useHybridFrameProcessor(
    (result, lms, raw, metrics) => {
      setLastDetection(Date.now());
      // Keep landmarks for other UI needs
      setLandmarks(lms);
      setLandmarksRaw(raw || lms);

      // Map to preview for drawing overlay
      const mapped = lms.map((p) => {
        const pt = mapToPreview(
          [p[0], p[1], p[2] ?? 0] as any,
          format?.videoWidth ?? 1,
          format?.videoHeight ?? 1,
          { width: previewRect.width, height: previewRect.height },
          mirror,
        );
        return [pt.x, pt.y];
      });
      setRenderPoints(mapped);

      if (result) {
        setCurrentGesture(result.label);
        setGestureConfidence(result.confidence);
        setLastConfidence(result.confidence);
        evaluateConfidence(result.confidence, result.isLocal ? 'local' : 'cloud');
        setClassifierUsed(result.isLocal ? 'tflite' : 'remote');
        setLastResultAt(Date.now());
      } else {
        setCurrentGesture('uncertain');
        setGestureConfidence(0);
        setClassifierUsed(null);
      }

      if (metrics) {
        setDebugStats((prev) => ({
          ...prev,
          fps: Math.round(metrics.fps || 0),
          queueDepth: metrics.queueDepth ?? 0,
          lastLatency: Math.round(metrics.processingMs || 0),
          circuitOpen: metrics.circuitBreakerOpen ?? prev.circuitOpen,
          pluginUsed: metrics.pluginUsed ?? prev.pluginUsed,
        }));
      }
    },
    isProcessing,
    LOCAL_CONFIDENCE_THRESHOLD,
    (message) => setMessage(message),
  );

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

    // Prefetch centroids for offline classification once profile is known
    (async () => {
      const p = await loadProfile();
      const cached = await getCachedCentroids(p?.id);
      if (!cached) {
        await fetchCentroids(p?.id || undefined);
      }
    })();
    
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
    if (profile?.id) {
      mlService.setProfileId(profile.id);
    }
  }, [profile?.id]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const manager = new ChildSessionManager(
      {
        onEncouragement: () => {
          void audioService.playEncouragement();
        },
        onBreak: () => {
          updateStatus('Time for a short break!');
          void audioService.playEncouragement();
          manager.startSession();
        },
      },
      profile.id,
    );
    sessionManagerRef.current = manager;
    manager.startSession();
    return () => manager.endSession();
  }, [profile, updateStatus]);

  useEffect(() => {
    if (!showDebug) return;
    const id = setInterval(() => {
      try {
        const data = telemetry.dump() as any[];
        if (data.length === 0) {
          setDebugStats((prev) => ({
            ...prev,
            medianLatency: 0,
            offlineRatio: 0,
            cloudRatio: 0,
          }));
          return;
        }
        const lat = data.map((d: any) => d.latencyMs).sort((a: number, b: number) => a - b);
        const mid = Math.floor(lat.length / 2);
        const median = lat.length % 2 ? lat[mid] : (lat[mid - 1] + lat[mid]) / 2;
        const offline = data.filter((d: any) => d.path === 'offline').length;
        const cloud = data.filter((d: any) => d.path === 'cloud').length;
        const total = data.length;
        setDebugStats((prev) => ({
          ...prev,
          medianLatency: Math.round(median),
          offlineRatio: total ? Math.round((offline / total) * 100) : 0,
          cloudRatio: total ? Math.round((cloud / total) * 100) : 0,
          circuitOpen: mlService.isCircuitBreakerOpen(),
        }));
      } catch (error) {
        logger.warn('Failed to update debug stats', { error });
      }
    }, 1500);
    return () => clearInterval(id);
  }, [showDebug]);

  // Initialize plugin availability once for the debug banner
  useEffect(() => {
    if (showDebug) {
      setDebugStats((prev) => ({ ...prev, pluginUsed: isResizePluginAvailable() }));
    }
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

  

  

  useEffect(() => {
    if (remoteFailures >= 3 && !usingOffline) {
      setUsingOffline(true);
      updateStatus('Offline-Erkennung aktiv');
    }
  }, [remoteFailures, usingOffline, updateStatus]);

  const detectionActive = now - lastDetection < 1000;

  useEffect(() => {
    if (!detectionActive) setLandmarks([]);
  }, [detectionActive]);

  const mapLandmark = useCallback(
    (lm: number[]) =>
      mapToPreview(
        [lm[0], lm[1], lm[2] ?? 0],
        format?.videoWidth ?? 1,
        format?.videoHeight ?? 1,
        { width: previewRect.width, height: previewRect.height },
        mirror,
      ),
    [previewRect, format, mirror],
  );

  const lmDisplay = landmarks;
  // Prefer precomputed render points when available (already mapped to preview space)
  const lmDraw = renderPoints.length > 0 ? renderPoints : lmDisplay;

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
          } catch (error) {
            logger.warn('Neutral hint haptics failed', error);
          }
          setShowNeutralHint(true);
          setTimeout(() => setShowNeutralHint(false), 2000);
        } catch (error) {
          logger.warn('Neutral hint speech failed', error);
        }
        neutralCooldownRef.current = ts + 7000;
      }
      // Do not pause the camera automatically; continuous feedback helps Amy
    }, 1000);
    return () => clearInterval(id);
  }, [canUseCamera, isProcessing, lastDetection, lastResultAt, isCameraActive, updateStatus]);

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

      // Send current landmarks as a labeled DGS sample to server (if any)
      try {
        if (landmarks && landmarks.length >= 21) {
          void sendDgsSample(choiceId, [landmarks], profile?.id || undefined);
        }
      } catch (error) {
        logger.warn('Failed to send DGS sample', error);
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

  const getStatusMessage = () => {
    switch (recognitionState) {
      case 'listening': return "Show me your gesture...";
      case 'thinking': return "Let me think...";
      case 'confident': return currentGesture;
      case 'uncertain': return "I'm not sure. Can you help me?";
      default: return "Ready";
    }
  };

  const getStatusColor = () => {
    switch (recognitionState) {
      case 'confident': return '#4CAF50'; // Green
      case 'thinking': return '#FF9800';  // Orange
      case 'uncertain': return '#F44336'; // Red
      default: return '#2196F3';          // Blue
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
    statusContainer: {
      position: 'absolute',
      bottom: 100,
      left: 20,
      right: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 10,
      padding: 15,
    },
    statusText: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 10,
    },
    confidenceBar: {
      height: 6,
      backgroundColor: '#E0E0E0',
      borderRadius: 3,
      marginBottom: 10,
    },
    confidenceFill: {
      height: '100%',
      borderRadius: 3,
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
        <View style={styles.cameraContainer} onLayout={(e) => setPreviewRect(e.nativeEvent.layout)}>
          {canUseCamera && (
            <Camera
              ref={camera}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              frameProcessor={frameProcessor}
              pixelFormat="yuv"
              format={format}
              onError={handleCameraError}
            />
          )}

          <View style={styles.overlay} pointerEvents="none">
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
            {lmDraw.length > 0 && (
              <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${previewRect.width} ${previewRect.height}`}>
                {(() => {
                  const HAND_SIZE = 21;
                  const handCount = Math.floor(lmDraw.length / HAND_SIZE) || 1;
                  const lines: any[] = [];
                  for (let h = 0; h < handCount; h++) {
                    const base = h * HAND_SIZE;
                    HAND_CONNECTIONS.forEach(([startIdx, endIdx], cIdx) => {
                      const start = lmDraw[base + startIdx];
                      const end = lmDraw[base + endIdx];
                      if (!start || !end) return;
                      const s = { x: start[0], y: start[1] };
                      const e = { x: end[0], y: end[1] };
                      lines.push(
                        <Line
                          key={`conn-${h}-${cIdx}`}
                          x1={s.x}
                          y1={s.y}
                          x2={e.x}
                          y2={e.y}
                          stroke={COLORS.warning}
                          strokeWidth={3}
                        />,
                      );
                    });
                  }
                  return lines;
                })()}
                {(() => {
                  const HAND_SIZE = 21;
                  return lmDraw.map((l, idx) => {
                    const p = { x: l[0], y: l[1] };
                    return <Circle key={`point-${idx}`} cx={p.x} cy={p.y} r={5} fill={COLORS.warning} />;
                  });
                })()}
              </Svg>
            )}
            <View style={styles.detectionIndicator}>
              <View
                style={[styles.dot, { backgroundColor: detectionActive ? COLORS.success : COLORS.warning }]}
              />
              <Text style={styles.detectionText}>
                {detectionActive
                  ? `Hands detected: ${Math.max(1, Math.floor(lmDraw.length / 21))}`
                  : 'No hand'}
              </Text>
            </View>

            <Pressable
              onLongPress={() => setShowDebug((v) => !v)}
              accessibilityLabel="Long press to toggle debug overlay"
              testID="status-container"
              style={styles.statusContainer}
            >
              <Text testID="current-gesture" style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusMessage()}
              </Text>
              
              {/* Confidence bar */}
              <View style={styles.confidenceBar}>
                <View 
                  style={[
                    styles.confidenceFill, 
                    { 
                      width: `${gestureConfidence * 100}%`,
                      backgroundColor: getStatusColor()
                    }
                  ]} 
                />
              </View>
              
              {/* Show correction panel when uncertain */}
              {showUncertainty && (
                <Button 
                  title="Help Me Choose" 
                  testID="btn-help-me-choose"
                  onPress={handleHelpPress}
                />
              )}
            </Pressable>

              {showDebug && (
                <View style={styles.debugOverlay}>
              <Text style={styles.debugText}>
                Median latency: {debugStats.medianLatency} ms · Last: {debugStats.lastLatency} ms
              </Text>
              <Text style={styles.debugText}>Offline: {debugStats.offlineRatio}% · Cloud: {debugStats.cloudRatio}%</Text>
              <Text style={styles.debugText}>
                FPS: {debugStats.fps} · Queue: {debugStats.queueDepth} · Circuit: {debugStats.circuitOpen ? 'open' : 'closed'} · Plugin: {debugStats.pluginUsed ? 'yes' : 'no'}
              </Text>
              <Text style={styles.debugText}>
                Path: {lastPathRef.current ?? '-'} · Classifier: {classifierUsed ?? '-'} · Confidence: {lastConfidence?.toFixed(2) ?? '-'}
              </Text>
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

      {!isCameraActive && (
        <Button
          title="Resume Camera"
          accessibilityLabel="Resume camera"
          onPress={() => {
            setIsCameraActive(true);
            updateStatus("I'm listening...");
            const ts = Date.now();
            setLastDetection(ts);
            setLastResultAt(ts);
          }}
        />
      )}

      {profile && <BottomNav active="recognition" profileId={profile.id} />}
    </SafeAreaView>
    </LinearGradient>
  );
}
