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
import { USE_EXPO_CAMERA } from '../constants';
import { loadProfile, Profile, logCorrection } from '../storage';
import { gestureModel, GestureModelEntry } from '../model';
import { buildLocalCentroids } from '../services/localCentroids';
import { classifyWithCentroids } from '../services/offlineClassifier';
import type { CentroidMap } from '../services/dgsModelClient';
import { LLMSuggestionResponse } from '../services/dialogEngine';
import MaintenanceBanner from '../components/MaintenanceBanner';
import { logInteractionEvent } from '../services/analytics';
import { logHIPEvent } from '../services/hipEvents';
import { shouldPromptPractice } from '../services/healthScore';
import { OneEuroFilter } from '../services/OneEuroFilter';
import { SequenceRecognizer, SequenceDefinition } from '../services/sequenceRecognizer';
// ExpoCameraDetector removed from default path (server-based); WebView is primary

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
  const uncertainCountRef = useRef(0);
  const lastUncertainAtRef = useRef<number>(0);
  const centroidsRef = useRef<CentroidMap>({});

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  useEffect(() => {
    buildLocalCentroids().then((c) => { centroidsRef.current = c; }).catch(() => {});
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

  const flattenHands = (hands: number[][][]): number[][] => {
    const left = hands[0] || [];
    const right = hands[1] || [];
    const out: number[][] = [];
    for (let i = 0; i < 21; i++) {
      out.push(left[i] ? [...left[i]] : [0, 0, 0]);
    }
    for (let i = 0; i < 21; i++) {
      out.push(right[i] ? [...right[i]] : [0, 0, 0]);
    }
    return out;
  };

  const handleGestureDetected = useCallback(async (
    gesture: string,
    confidence: number,
    landmarks: number[][][],
  ) => {
    let g = gesture;
    let c = confidence;

    if (centroidsRef.current && (!g || c < 0.6)) {
      const flat = flattenHands(landmarks);
      const res = classifyWithCentroids(flat, centroidsRef.current);
      if (res && res.confidence > c) {
        g = res.label;
        c = res.confidence;
      }
    }

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
      uncertainCountRef.current = 0;

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
        // Only open correction after several consecutive uncertain frames
        const now = Date.now();
        if (now - lastUncertainAtRef.current > 1500) {
          uncertainCountRef.current = 0;
        }
        lastUncertainAtRef.current = now;
        uncertainCountRef.current += 1;
        if (!showCorrection && uncertainCountRef.current >= 3) {
          setShowCorrection(true);
          uncertainCountRef.current = 0;
        }
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

    // On-device classification only: use provided or locally-classified gesture
    await handleOutcome(g, c, 'local');
  }, [dialogContext, startFeedbackAnimation, lastRecognizedGesture]);

  const handleGestureError = useCallback((errorMessage: string) => {
    // Avoid flooding the UI; only surface critical init/camera errors
    logger.warn('Gesture detection warning:', errorMessage);
    if (/Camera error|Recognizer init failed/i.test(errorMessage)) {
      setError(errorMessage);
    }
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
  });

  return (
    <SafeAreaView style={styles.container}>
      <Button
        title={facingMode === 'user' ? 'Use Back Camera' : 'Use Front Camera'}
        onPress={() => {
          const m = facingMode === 'user' ? 'environment' : 'user';
          setFacingMode(m);
          setWebviewKey((k) => k + 1);
        }}
        accessibilityLabel="Switch camera"
      />
      <View style={styles.cameraContainer}>
        {
          <MediaPipeGestureDetector
            key={webviewKey}
            onGestureDetected={handleGestureDetected}
            onError={handleGestureError}
            onWebViewEvent={(ev)=>{ if (ev === 'camera_started') setWebviewReady(true); }}
            facingMode={facingMode}
          />
        }
        <Text style={styles.statusText}>{status}</Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!error && !showCorrection && lastRecognizedGesture && (
          <Animated.View style={[styles.gestureInfo, { opacity: fadeAnim }]}>
            <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}>
              {lastRecognizedGesture.label}
            </Animated.Text>
            <Text style={styles.gestureText}>{(gestureConfidence * 100).toFixed(0)}%</Text>
          </Animated.View>
        )}
      </View>

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

      {/* Optional controls could be reintroduced as overlays if needed */}

      <BottomNav active="recognition" profileId={profile?.id || 'default'} />
    </SafeAreaView>
  );
}
