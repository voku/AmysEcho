import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { loadProfile, Profile } from '../storage';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';

import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';

export default function GesturePracticeScreen() {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);

  const [landmarks, setLandmarks] = useState<number[][][]>([]);
  const [lastDetection, setLastDetection] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { setMessage } = useMessage();

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .catch((e) => {
        logger.error('Failed to load profile', e);
        setMessage('Profil konnte nicht geladen werden');
      });
  }, [setMessage]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const detectionActive = now - lastDetection < 1000;

  useEffect(() => {
    if (!detectionActive) setLandmarks([]);
  }, [detectionActive]);

  const styles = createStyles(largeText, highContrast);
  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);

  const handleGestureDetected = (gesture: string | null, confidence: number, landmarks: number[][][]) => {
    setLandmarks(landmarks);
    setLastDetection(Date.now());
    if (gesture && confidence > 0.5) {
      setMessage(`Gut gemacht! ${gesture} erkannt`);
    }
  };

  const handleError = (error: string) => {
    logger.warn('GesturePractice detector error:', error);
    setMessage('Versuch es nochmal!');
  };

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Gesten üben</Text>
        <View style={styles.content}>
          <Text style={styles.instruction}>
            Halte deine Hand vor die Kamera und mache eine Geste
          </Text>
          <View style={styles.cameraContainer}>
            <MediaPipeGestureDetector
              onGestureDetected={handleGestureDetected}
              onError={handleError}
            />
            {landmarks.length > 0 && (
              <View style={styles.overlay}>
                <Text style={styles.detectionText}>
                  {detectionActive ? 'Hand erkannt' : 'Keine Hand'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.hint}>
            Versuche verschiedene Gesten aus dem Modell
          </Text>
        </View>
      </SafeAreaView>
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </LinearGradient>
  );
}

const createStyles = (largeText: boolean, highContrast: boolean) =>
  StyleSheet.create({
    container: { flex: 1, padding: SPACING.lg },
    title: {
      fontSize: largeText ? 28 : 24,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    instruction: {
      fontSize: largeText ? 20 : 16,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    cameraContainer: {
      width: 300,
      height: 300,
      marginBottom: SPACING.lg,
      position: 'relative',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: highContrast ? COLORS.highContrastPressed : COLORS.border,
    },
    overlay: {
      position: 'absolute',
      bottom: SPACING.sm,
      left: SPACING.sm,
      right: SPACING.sm,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: SPACING.sm,
      borderRadius: 8,
    },
    detectionText: {
      color: COLORS.text,
      fontSize: largeText ? 18 : 16,
      textAlign: 'center',
    },
    hint: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
  });