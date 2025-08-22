import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Easing,
  Button
} from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import CorrectionPanel from '../components/CorrectionPanel';
import { COLORS, SPACING } from '../constants/ui';
import { logger } from '../utils/logger';
import { audioService, triggerSpeakAndShow, correctionService, dialogEngine } from '../services';
import { telemetry } from '../telemetry/recorder';
import { API_URL, API_TOKEN, USE_EXPO_CAMERA } from '../constants';
import { loadProfile, Profile, logCorrection } from '../storage';
import { gestureModel, GestureModelEntry } from '../model';
import { LLMSuggestionResponse } from '../services/dialogEngine';
import MaintenanceBanner from '../components/MaintenanceBanner';
import { logInteractionEvent } from '../services/analytics';
import { logHIPEvent } from '../services/hipEvents';
import { shouldPromptPractice } from '../services/healthScore';
import { OneEuroFilter } from '../services/OneEuroFilter';
import { SequenceRecognizer, SequenceDefinition } from '../services/sequenceRecognizer';
import ExpoCameraDetector from '../components/ExpoCameraDetector';

export default function RecognitionScreen({ navigation }: any) {
  const { largeText } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("I'm listening...");
  const [detectedGesture, setDetectedGesture] = useState<string>('listening...');
  const [gestureConfidence, setGestureConfidence] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<LLMSuggestionResponse>({
    nextWords: [],
    caregiverPhrases: [],
  });
  const [dialogContext, setDialogContext] = useState<string[]>([]);
  const [pendingGesture, setPendingGesture] = useState<string | null>(null);
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState<GestureModelEntry | null>(null);
  const [showPracticeBanner, setShowPracticeBanner] = useState(false);
  const [scheduledGesture, setScheduledGesture] = useState<string | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const [useExpoFallback, setUseExpoFallback] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraType, setCameraType] = useState<'front' | 'back'>('front');
  const [webviewKey, setWebviewKey] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;
  const confidenceFilterRef = useRef(new OneEuroFilter(1.2, 0.007, 1.0));
  const labelHistoryRef = useRef<string[]>([]);
  const seqDefsRef = useRef<SequenceDefinition[]>([
    { id: 'more_please', pattern: ['more', 'please'], windowMs: 3000 },
  ]);
  const seqRef = useRef(new SequenceRecognizer(seqDefsRef.current));

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  // Auto-fallback to Expo camera if WebView doesn't start camera within 5 seconds
  useEffect(() => {
    const t = setTimeout(() => {
      if (!webviewReady) {
        setUseExpoFallback(true);
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [webviewReady]);

  // Check practice schedules periodically and show banner when due
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const { getDueGesture } = await import('../services/practiceScheduler');
        timer = setInterval(async () => {
          const due = await getDueGesture();
          if (due) {
            setScheduledGesture(due);
            setShowPracticeBanner(true);
          }
        }, 60 * 1000);
      } catch {}
    })();
    return () => timer && clearInterval(timer);
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
  }, [fadeAnim, symbolScaleAnim]);

  const handleGestureDetected = useCallback(async (
    gesture: string,
    confidence: number,
    landmarks: number[][][],
  ) => {
    const start = Date.now();

    // Helper to apply a classification to UI + logs
    const handleOutcome = async (
      finalGesture: string,
      finalConfidence: number,
      processedBy: 'local' | 'cloud',
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

      setDetectedGesture(stableGesture);
      setGestureConfidence(smoothed);
      setError(null);

      if (smoothed > 0.7 && stableGesture !== 'unknown') {
        const entry = (gestureModel.gestures.find((g) => g.id === stableGesture) || { id: stableGesture, label: stableGesture }) as GestureModelEntry;
        setLastRecognizedGesture(entry);
        setStatus(entry.label);
        triggerSpeakAndShow(entry.label, smoothed, () => {});
        startFeedbackAnimation();

        // Log success
        logInteractionEvent({
          gestureDefinitionId: entry.id,
          wasSuccessful: true,
          confidenceScore: smoothed,
          timestamp: Date.now(),
          processedBy,
        }).catch(() => {});

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

        // Evaluate practice prompt
        shouldPromptPractice(entry.id, { minSamples: 5, lastN: 10, threshold: 0.6 })
          .then(setShowPracticeBanner)
          .catch(() => setShowPracticeBanner(false));

        // Sequence recognition (non-blocking): if a sequence matches, provide gentle feedback
        try {
          const seqId = seqRef.current.push(entry.id);
          if (seqId) {
            void logHIPEvent('HIP_2', 'sequence_detected', { sequence: seqId });
            // Optional extra cue without altering primary status
            void audioService.playEncouragement(seqId);
          }
        } catch {}
      } else {
        setStatus("I'm not sure. Please try again.");
        setPendingGesture(stableGesture);
        setShowCorrection(true);
        // Gentle nudge to retry
        try { await audioService.playEncouragement(); } catch {}
        // HIP 3: opened correction/uncertainty path
        void logHIPEvent('HIP_3', 'help_me_opened', { suggestionFor: finalGesture });
        // Log failure for the incoming gesture id (could be 'unknown')
        const id = (gestureModel.gestures.find((g) => g.id === stableGesture)?.id) || stableGesture || 'unknown';
        logInteractionEvent({
          gestureDefinitionId: id,
          wasSuccessful: false,
          confidenceScore: smoothed,
          timestamp: Date.now(),
          processedBy,
        }).catch(() => {});
        // Practice prompt check on last recognized if present
        if (lastRecognizedGesture) {
          shouldPromptPractice(lastRecognizedGesture.id, { minSamples: 5, lastN: 10, threshold: 0.6 })
            .then(setShowPracticeBanner)
            .catch(() => setShowPracticeBanner(false));
        }
      }
    };

    // Server classification with timeout; fallback to local values on timeout/error
    try {
      if (!landmarks || landmarks.length === 0) {
        // When using the ExpoCameraDetector path, results are already final
        await handleOutcome(gesture, confidence, 'cloud');
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 400);
        const response = await fetch(`${API_URL}/api/classify-landmarks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_TOKEN}`,
          },
          body: JSON.stringify({ landmarks }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        telemetry.add('classify_landmarks', Date.now() - start, 'recognition-screen');

        if (!response.ok) {
          throw new Error('Server error');
        }

        const result = await response.json();
        const { gesture: serverGesture, confidence: serverConfidence } = result;
        await handleOutcome(serverGesture, serverConfidence, 'cloud');
      }
    } catch (error) {
      telemetry.add('classify_landmarks_error', Date.now() - start, 'recogniction-screen');
      logger.warn('Falling back to local classification:', error);
      // Use locally detected gesture/confidence to keep the seam intact
      await handleOutcome(gesture, confidence, 'local');
    }
  }, [dialogContext, startFeedbackAnimation, lastRecognizedGesture]);

  const handleGestureError = useCallback((errorMessage: string) => {
    logger.error('Gesture detection error:', errorMessage);
    setError(errorMessage);
  }, []);

  const handleSelectCorrection = async (choiceId: string) => {
    if (pendingGesture) {
      await correctionService.logCorrection(choiceId);
      // HIP 3: correction submitted
      void logHIPEvent('HIP_3', 'correction_submitted', { actual: choiceId, predicted: pendingGesture });
    }
    setShowCorrection(false);
    setPendingGesture(null);
    setStatus("Thank you for teaching me!");
  };

  const handleCancelCorrection = () => {
    setShowCorrection(false);
    setPendingGesture(null);
    setStatus("I'm listening...");
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.backgroundStart,
    },
    cameraContainer: {
      flex: 1,
      borderRadius: SPACING.md,
      overflow: 'hidden',
      margin: SPACING.md,
    },
    gestureInfo: {
      padding: SPACING.lg,
      backgroundColor: COLORS.surface,
      borderRadius: SPACING.md,
      margin: SPACING.md,
      alignItems: 'center',
    },
    gestureText: {
      fontSize: largeText ? 28 : 22,
      fontWeight: 'bold',
      color: COLORS.text,
    },
    confidenceText: {
      fontSize: largeText ? 20 : 16,
      color: COLORS.textMuted,
      marginTop: SPACING.sm,
    },
    statusText: {
      fontSize: largeText ? 24 : 20,
      fontWeight: 'bold',
      color: COLORS.text,
      textAlign: 'center',
      margin: SPACING.md,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    errorText: {
      color: COLORS.warning,
      fontSize: largeText ? 20 : 16,
      textAlign: 'center',
    },
    symbolDisplay: {
      fontSize: largeText ? 120 : 100,
      marginBottom: SPACING.lg,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View testID="status-container">
        <Text style={styles.statusText}>{status}</Text>
      </View>
      {showPracticeBanner && (
        <MaintenanceBanner
          onPractice={() => {
            setShowPracticeBanner(false);
            const target = scheduledGesture || lastRecognizedGesture?.id || 'practice';
            navigation.navigate('Training', { gestureLabel: target, isPractice: true });
          }}
        />
      )}
      {/* Fallback status controls */}
      {(useExpoFallback) && (
        <View style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 2, backgroundColor: '#0009', padding: 8, borderRadius: 8 }}>
          <Text style={{ color: '#fff', textAlign: 'center' }}>Using fallback camera</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 }}>
            <Button title="Retry WebView" onPress={() => { setUseExpoFallback(false); setWebviewReady(false); setWebviewKey(k=>k+1); }} />
            <Button title={cameraType === 'front' ? 'Back Cam' : 'Front Cam'} onPress={() => setCameraType(t => t === 'front' ? 'back' : 'front')} />
          </View>
        </View>
      )}
      <View style={styles.cameraContainer}>
        {useExpoFallback || USE_EXPO_CAMERA ? (
          <ExpoCameraDetector onGestureDetected={handleGestureDetected} onError={(e)=>{ setError(e); }} cameraType={cameraType} />
        ) : (
          <MediaPipeGestureDetector
            key={webviewKey}
            onGestureDetected={handleGestureDetected}
            onError={(e)=>{ setError(e); setUseExpoFallback(true); }}
            onWebViewEvent={(ev)=>{ if (ev === 'camera_started') setWebviewReady(true); }}
            facingMode={facingMode}
          />
        )}
      </View>

      {error &&
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      }

      {!error && !showCorrection && lastRecognizedGesture &&
        <Animated.View style={[styles.gestureInfo, { opacity: fadeAnim }]}>
          <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}>
            {lastRecognizedGesture.label}
          </Animated.Text>
        </Animated.View>
      }

      {showCorrection && (
        <CorrectionPanel
          onSelect={handleSelectCorrection}
          onAddNew={() => {
            setShowCorrection(false);
            navigation.navigate('Teaching');
          }}
          onCancel={handleCancelCorrection}
          suggestions={[]}
        />
      )}

      <View style={{ padding: SPACING.md }}>
        <Button
          title={facingMode === 'user' ? 'Flip to Back (WebView)' : 'Flip to Front (WebView)'}
          onPress={() => { setFacingMode(m => m === 'user' ? 'environment' : 'user'); setWebviewKey(k=>k+1); }}
        />
        <View style={{ height: SPACING.sm }} />
        <Button
          testID="btn-help-me-choose"
          title="Help me choose"
          accessibilityLabel="Open correction screen"
          onPress={() => navigation.navigate('Correction')}
        />
        <View style={{ height: SPACING.sm }} />
        <Button
          testID="btn-correction"
          title="Correction"
          accessibilityLabel="Open correction screen"
          onPress={() => navigation.navigate('Correction')}
        />
        {/* Debug overlay path text marker for tests */}
        <Text style={{ opacity: 0 }}>Path: debug-overlay</Text>
      </View>

      <BottomNav active="recognition" profileId={profile?.id || 'default'} />
    </SafeAreaView>
  );
}
