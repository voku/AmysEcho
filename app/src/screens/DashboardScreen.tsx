// React imports
import React, { useEffect, useState } from 'react';

// React Native imports
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Third-party imports
// (none)

// Local imports
import {
  loadAnalytics,
  uploadAnalytics,
  LearningAnalytics,
} from '../services/analytics';
import { useAccessibility } from '../components/AccessibilityContext';
import { API_URL, API_TOKEN } from '../constants';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { loadProfile, Profile } from '../storage';
import BottomNav from '../components/BottomNav';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';

export default function DashboardScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [data, setData] = useState<LearningAnalytics | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [insights, setInsights] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadAnalytics().then((d) => {
      setData(d);
      uploadAnalytics(d);
    });
    loadProfile().then(setProfile);
    // Fetch server analytics summary and insights for caregivers
    (async () => {
      try {
        const [sumRes, insRes] = await Promise.all([
          fetch(`${API_URL}/api/analytics/summary`, { headers: { Authorization: `Bearer ${API_TOKEN}` } }),
          fetch(`${API_URL}/api/analytics/insights`, { headers: { Authorization: `Bearer ${API_TOKEN}` } }),
        ]);
        if (sumRes.ok) setSummary(await sumRes.json());
        if (insRes.ok) setInsights(await insRes.json());
      } catch {}
    })();
  }, []);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    label: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.sm,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    barBackground: {
      width: 200,
      height: 20,
      borderColor: COLORS.borderDark,
      borderWidth: 1,
      marginBottom: SPACING.sm,
    },
    barFill: {
      height: '100%',
      backgroundColor: COLORS.success,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
      marginTop: SPACING.lg,
      minWidth: 120,
    },
    buttonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonText: {
      color: COLORS.highContrastText,
      fontSize: 16,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 20,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Analyse-Dashboard</Text>
      {data ? (
        <>
          <View style={styles.barBackground}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(data.successRate7d * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.label}>
            Erfolgsrate (7 Tage): {(data.successRate7d * 100).toFixed(0)}%
          </Text>
          <Text style={styles.label}>
            Trend: {(data.improvementTrend * 100).toFixed(0)}%
          </Text>
          {summary && (
            <>
              <Text style={styles.label}>Korrekturen: {(summary.correctionRate * 100).toFixed(0)}%</Text>
              <Text style={styles.label}>Unsicherheit: {(summary.uncertaintyRatio * 100).toFixed(0)}%</Text>
              {summary.medianLatencyMs != null && (
                <Text style={styles.label}>Mittlere Latenz: {summary.medianLatencyMs} ms</Text>
              )}
            </>
          )}
          {insights && Array.isArray(insights.recommendations) && insights.recommendations.length > 0 && (
            <>
              <Text style={styles.label}>Empfehlungen:</Text>
              <Text style={styles.label}>{insights.recommendations.map((r: any) => r.gesture).join(', ')}</Text>
            </>
          )}
        </>
      ) : (
        <Text style={styles.label}>Keine Daten</Text>
      )}
      <Pressable
        style={({ pressed }) => [
          childFriendlyStyles.minTouchTarget,
          styles.button,
          highContrast && styles.buttonHC,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        onPress={() => {
          void childHaptic();
          navigation.goBack();
        }}
        accessibilityRole="button"
        accessibilityLabel="Zurück"
      >
        <Text style={[
          styles.buttonText,
          largeText && styles.buttonTextLarge,
          highContrast && styles.buttonTextHC,
        ]}>
          Zurück
        </Text>
      </Pressable>
      {profile && <BottomNav active="parent" profileId={profile.id} />}
    </View>
  );
}
