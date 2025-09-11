
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
import PracticeSuggestion from '../components/PracticeSuggestion';
import AdaptiveLearningPanel from '../components/AdaptiveLearningPanel';
import { COLORS, SPACING } from '../constants/ui';
import { logger } from '../utils/logger';
import {
  audioService,
  triggerSpeakAndShow,
  correctionService,
  dialogEngine,
  announceGestureRecognition,
  gestureSuggester,
  detectionHapticFeedback,
  partialGestureHapticFeedback,
  multiSensoryFeedback,
   activeLearningService,
   adaptiveLearningService,
   personalizedConfidenceService,
  gestureCombinationService,
} from '../services';
import { gestureHistoryService } from '../services/gestureHistoryService';
import { automaticRecoveryService } from '../services/automaticRecoveryService';
import { zeroDowntimeModelService } from '../services/zeroDowntimeModelService';
import { emergencyPriorityService } from '../services/emergencyPriorityService';
import { preCachedResponseService } from '../services/preCachedResponseService';
import { loadProfile, Profile } from '../storage';
import { GestureModelEntry } from '../model';
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
import { recordAmyActivity } from '../services/dailyJobs';
import { positiveTelemetryService } from '../services/positiveTelemetryService';
import { performanceOptimizationService } from '../services/performanceOptimizationService';
import { batteryOptimizationService } from '../services/batteryOptimizationService';
import { frameRateOptimizationService } from '../services/frameRateOptimizationService';
import { optimizedGestureService } from '../services/optimizedGestureService';

import { backgroundPrefetchService } from '../services/backgroundPrefetchService';
import { usePreloadComponents } from '../components/LazyComponent';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import PictureInPictureGuidance from '../components/PictureInPictureGuidance';
import SlowMotionReplay from '../components/SlowMotionReplay';
import { LanguageManager } from '../services/LanguageManager';
import Celebration, { CELEBRATION_DURATION_MS } from '../components/Celebration';
import { useMessage } from '../context/MessageContext';
import { onMlpModelUpdated } from '../services/dgsModelClient';
import { emergencyRollback } from '../services/modelUpdate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeMessages } from '../utils/themeMessages';
import MoodSelector from '../components/MoodSelector';
import LocationSelector from '../components/LocationSelector';
import VisualRipple from '../components/VisualRipple';
import ScreenFlash from '../components/ScreenFlash';
import GestureComparison from '../components/GestureComparison';
import TwoHandGestureDisplay from '../components/TwoHandGestureDisplay';
import { isTwoHandGestureString, parseTwoHandGestureString } from '../constants/twoHandGestures';
import { twoHandGestureService, DetectedTwoHandGesture } from '../services/twoHandGestureService';
import type { RootStackParamList } from '../navigation/types';
import { getShortcutMessage, getShortcutAction, getShortcutDisplayName } from '../utils/shortcutUtils';
import { useRecognitionState } from '../hooks/useRecognitionState';
import { useRecognitionCallbacks } from '../hooks/useRecognitionCallbacks';

const FEEDBACK_THROTTLE_MS = 2000;
// CELEBRATION_DURATION_MS sourced from Celebration.tsx sequence

export default function RecognitionScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'Recognition'>;
}) {
  const { largeText } = useAccessibility();
  const { setMessage } = useMessage();
  const { getSuccessMessage } = useThemeMessages();

  const state = useRecognitionState();
  const callbacks = useRecognitionCallbacks(state, () => {}, navigation);
  const {
    profile, setProfile,
    status, setStatus,
    gestureConfidence, setGestureConfidence,
    error, setError,
    showCorrection, setShowCorrection,
    gestureSuggestions, setGestureSuggestions,
    dialogContext, setDialogContext,
    pendingGesture, setPendingGesture,
    lastRecognizedGesture, setLastRecognizedGesture,
    facingMode, setFacingMode,
    webviewKey, setWebviewKey,
    webviewRetries, setWebviewRetries,
    recognitionPath, setRecognitionPath,
    showDgsVideo, setShowDgsVideo,
    showCelebration, setShowCelebration,
    celebrationKey, setCelebrationKey,
    screenReaderEnabled, setScreenReaderEnabled,
    modelUpdateStatus, setModelUpdateStatus,
    showMoodSelector, setShowMoodSelector,
    showLocationSelector, setShowLocationSelector,
    kindergartenMode, setKindergartenMode,
    bullyingProtectionActive, setBullyingProtectionActive,
    gestureSizeTolerance, setGestureSizeTolerance,
    showVisualRipple, setShowVisualRipple,
    successSound, setSuccessSound,
    showScreenFlash, setShowScreenFlash,
    screenFlashPattern, setScreenFlashPattern,
    showGestureComparison, setShowGestureComparison,
    comparisonAttempt, setComparisonAttempt,
    shortcutActivated, setShortcutActivated,
    showPipGuidance, setShowPipGuidance,
    pipGuidanceGesture, setPipGuidanceGesture,
    showSlowMotionReplay, setShowSlowMotionReplay,
    showPracticeSuggestion, setShowPracticeSuggestion,
    showAdaptiveLearning, setShowAdaptiveLearning,
    slowMotionGesture, setSlowMotionGesture,
    contextInsights,
    detectedTwoHandGesture, setDetectedTwoHandGesture,
  } = state;

  const {
    handleGestureDetected,
    handleModelUpdateStatus,
    handlePartialFeedback,
    handleStabilityFeedback,
    handleGestureError,
    handleSelectCorrection,
    handleCloseComparison,
    handleAcceptPractice,
    handleDeclinePractice,
    handleLaterPractice,
    handleStartAdaptiveRecommendation,
    handleTryAgainFromComparison,
  } = callbacks;

  // Simple stub functions for adaptive PiP positioning
  const getAdaptivePipPosition = (): 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' => 'top-right';
  const getAdaptivePipSize = (): 'small' | 'medium' | 'large' => 'medium';
  const getAdaptivePlaybackMode = () => 'once' as const;

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
  const lastFrameTimeRef = useRef<number>(0);
  const centroidsRef = useRef<CentroidMap>({});
  const consecutiveFailuresRef = useRef<number>(0);
  const consecutiveSuccessesRef = useRef<number>(0);
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
    'SlowMotionReplay',
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

    // Monitor battery status and show warnings when needed
    const handlePowerModeChange = (isLowPower: boolean) => {
      if (isLowPower) {
        setStatus('🔋 Akku ist schwach. Ich passe mich an, um Energie zu sparen.');
        setTimeout(() => setStatus('Ich höre zu…'), 5000);
      } else {
        setStatus('🔋 Akku ist wieder gut geladen!');
        setTimeout(() => setStatus('Ich höre zu…'), 3000);
      }
    };

    // Register battery monitoring callback
    batteryOptimizationService.onPowerModeChange(handlePowerModeChange);

    return () => {
      clearInterval(performanceInterval);
      batteryOptimizationService.removePowerModeChangeCallback(handlePowerModeChange);
      // Cleanup services on unmount
      performanceOptimizationService.cleanup();
      batteryOptimizationService.cleanup();
      backgroundPrefetchService.cleanup();
    };
  }, []);

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
    fontSize: 12,
    color: COLORS.highContrastText,
  },
  encouragementText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.success,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

  return (
    <SafeAreaView style={styles.container}>
      {/* Kindergarten mode: Hide complex controls, show only essential ones */}
      {!kindergartenMode && (
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
          <Button
            title="Ort"
            onPress={() => setShowLocationSelector(!showLocationSelector)}
            accessibilityLabel="Ort festlegen"
          />
        </View>
      )}

      {/* Kindergarten mode: Simple mood button */}
      {kindergartenMode && (
        <View style={{ padding: SPACING.md, alignItems: 'center' }}>
          <Button
            title="😊 Wie geht's Amy?"
            onPress={() => setShowMoodSelector(!showMoodSelector)}
            accessibilityLabel="Amy's Stimmung auswählen"
          />
          <View style={{ height: SPACING.md }} />
          <Button
            title="📍 Wo bist du?"
            onPress={() => setShowLocationSelector(!showLocationSelector)}
            accessibilityLabel="Aktuellen Ort auswählen"
          />
        </View>
      )}

      {showMoodSelector && <MoodSelector />}
      {showLocationSelector && <LocationSelector />}
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
        {/* Kindergarten mode: Simplify status messages */}
        <Text style={styles.statusText}>
          {kindergartenMode ? (
            status === 'Bereit zur Gestenerkennung' ? '👋 Bereit!' :
            status === 'Geste erkannt!' ? '✨ Geste erkannt!' :
            status.includes('Hilfe') ? '🆘 Hilfe wird gerufen!' :
            status.includes('Fehler') ? '😊 Lass es uns nochmal versuchen!' :
            status
          ) : (
            <>
              {status}
              {modelUpdateStatus === 'updating' && ' 🔄'}
            </>
          )}
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
            {isTwoHandGestureString(lastRecognizedGesture.label) && detectedTwoHandGesture ? (
              <TwoHandGestureDisplay
                gestureString={detectedTwoHandGesture.gesture.id}
                confidence={detectedTwoHandGesture.confidence}
                showDetails={!kindergartenMode} // Hide technical details in kindergarten mode
                size="large" // Larger for kindergarten visibility
              />
            ) : isTwoHandGestureString(lastRecognizedGesture.label) ? (
              <TwoHandGestureDisplay
                gestureString={lastRecognizedGesture.label}
                confidence={gestureConfidence}
                showDetails={!kindergartenMode}
                size="large"
              />
            ) : (
              <>
                <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}>
                  {lastRecognizedGesture.label}
                </Animated.Text>
                {/* Kindergarten mode: Hide technical details */}
                {!kindergartenMode && (
                  <>
                    <Text style={styles.gestureText}>{(gestureConfidence * 100).toFixed(0)}%</Text>
                    <Text style={styles.confidenceText} testID="recognition-path">
                      via {recognitionPath}
                    </Text>
                  </>
                )}
                {/* Kindergarten mode: Show simple encouragement */}
                {kindergartenMode && gestureConfidence > 0.6 && (
                  <Text style={styles.encouragementText}>🎉 Super!</Text>
                )}
              </>
            )}
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

      {/* Amy First: Enhanced Picture-in-Picture guidance for learning during recognition */}
      <PictureInPictureGuidance
        gestureId={pipGuidanceGesture?.id}
        videoUri={pipGuidanceGesture?.dgsVideoUri}
        isVisible={showPipGuidance}
        onClose={() => setShowPipGuidance(false)}
        position={getAdaptivePipPosition()}
        size={getAdaptivePipSize()}
        autoPlay={true}
        showControls={false}
        playbackMode={getAdaptivePlaybackMode()}
        confidence={gestureConfidence}
        onPlaybackComplete={() => {
          // Track completion for learning analytics
          if (pipGuidanceGesture?.id) {
            void logHIPEvent('HIP_1', 'pip_guidance_completed', {
              gestureId: pipGuidanceGesture.id,
              confidence: gestureConfidence,
              context: contextInsights ? {
                timeOfDay: contextInsights.timeOfDay,
                patternMatch: contextInsights.patternMatch
              } : undefined
            });
          }
        }}
      />

      {/* Amy First: Slow-motion replay for detailed gesture learning */}
      <SlowMotionReplay
        gestureId={slowMotionGesture?.id || ''}
        videoUri={slowMotionGesture?.dgsVideoUri || ''}
        isVisible={showSlowMotionReplay}
        onClose={() => setShowSlowMotionReplay(false)}
        onReplayComplete={() => {
          setStatus('🎥 Wiederholung beendet. Versuche es selbst!');
        }}
        autoPlay={true}
        initialSpeed={0.5}
        showControls={true}
      />
    </View>

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
        showPictures={true}
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
        testID="btn-adaptive-learning"
        title="Lernfortschritt"
        accessibilityLabel="Persönliches Lernen öffnen"
        onPress={() => setShowAdaptiveLearning(true)}
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

    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{LanguageManager.t('recognition.showPipGuidance')}</Text>
      <Switch
        value={showPipGuidance}
        onValueChange={setShowPipGuidance}
        accessibilityLabel={LanguageManager.t('recognition.togglePipGuidance')}
      />
    </View>

    {/* Kindergarten mode toggle (hidden feature for testing) */}
    <View style={{ position: 'absolute', bottom: 100, right: 10 }}>
      <Button
        title={kindergartenMode ? "👨‍🏫" : "👶"}
        onPress={() => setKindergartenMode(!kindergartenMode)}
        accessibilityLabel="Modus wechseln"
      />
    </View>

    <BottomNav active="recognition" profileId={profile?.id || 'default'} />

    {/* Gesture Comparison Overlay - Amy First: Encouraging, non-judgmental learning */}
    {showGestureComparison && comparisonAttempt && (
      <GestureComparison
        userAttempt={comparisonAttempt}
          correctGesture={{
            id: pendingGesture || '',
            label: optimizedGestureService.getGestureById(pendingGesture || '')?.label || 'Unbekannte Geste',
            dgsVideoUri: optimizedGestureService.getGestureById(pendingGesture || '')?.dgsVideoUri
          }}
        onClose={handleCloseComparison}
        onTryAgain={handleTryAgainFromComparison}
      />
    )}

    {/* Practice Suggestion Overlay - Amy First: Targeted learning support */}
    <PracticeSuggestion
      visible={showPracticeSuggestion}
      onAccept={handleAcceptPractice}
      onDecline={handleDeclinePractice}
      onLater={handleLaterPractice}
    />

    {/* Adaptive Learning Panel - Amy First: Personalized learning paths */}
    <AdaptiveLearningPanel
      visible={showAdaptiveLearning}
      onClose={() => setShowAdaptiveLearning(false)}
      onStartRecommendation={handleStartAdaptiveRecommendation}
      availableTime={10}
    />
  </SafeAreaView>
);
}
