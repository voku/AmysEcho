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
import { API_URL, API_TOKEN } from '../constants';
import { loadProfile, Profile, logCorrection } from '../storage';
import { gestureModel, GestureModelEntry } from '../model';
import { LLMSuggestionResponse } from '../services/dialogEngine';
import MaintenanceBanner from '../components/MaintenanceBanner';
import { logInteractionEvent } from '../services/analytics';
import { logHIPEvent } from '../services/hipEvents';
import { shouldPromptPractice } from '../services/healthScore';

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

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile().then(setProfile);
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
      setDetectedGesture(finalGesture);
      setGestureConfidence(finalConfidence);
      setError(null);

      if (finalConfidence > 0.7 && finalGesture !== 'unknown') {
        const entry = (gestureModel.gestures.find((g) => g.id === finalGesture) || { id: finalGesture, label: finalGesture }) as GestureModelEntry;
        setLastRecognizedGesture(entry);
        setStatus(entry.label);
        triggerSpeakAndShow(entry.label, finalConfidence, () => {});
        startFeedbackAnimation();

        // Log success
        logInteractionEvent({
          gestureDefinitionId: entry.id,
          wasSuccessful: true,
          confidenceScore: finalConfidence,
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
      } else {
        setStatus("I'm not sure. Please try again.");
        setPendingGesture(finalGesture);
        setShowCorrection(true);
        // Gentle nudge to retry
        try { await audioService.playEncouragement(); } catch {}
        // HIP 3: opened correction/uncertainty path
        void logHIPEvent('HIP_3', 'help_me_opened', { suggestionFor: finalGesture });
        // Log failure for the incoming gesture id (could be 'unknown')
        const id = (gestureModel.gestures.find((g) => g.id === finalGesture)?.id) || finalGesture || 'unknown';
        logInteractionEvent({
          gestureDefinitionId: id,
          wasSuccessful: false,
          confidenceScore: finalConfidence,
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
    } catch (error) {
      telemetry.add('classify_landmarks_error', Date.now() - start, 'recognition-screen');
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
            const target = lastRecognizedGesture?.id || 'practice';
            navigation.navigate('Training', { gestureLabel: target, isPractice: true });
          }}
        />
      )}
      <View style={styles.cameraContainer}>
        <MediaPipeGestureDetector
          onGestureDetected={handleGestureDetected}
          onError={handleGestureError}
        />
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
