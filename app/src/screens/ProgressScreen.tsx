import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { loadUsageStats } from '../services/usageTracker';
import { loadEngagementStats } from '../services/engagementTracker';
import { loadProfile, Profile } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { childHaptic } from '../services/feedbackService';

export default function ProgressScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const [engagement, setEngagement] = useState<{ totalSessions: number; averageDurationMs: number }>({ totalSessions: 0, averageDurationMs: 0 });

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p);
      if (p) {
        loadUsageStats(p.id).then(setStats);
        loadEngagementStats(p.id).then(setEngagement);
      }
    });
  }, []);

  const entries = gestureModel.gestures
    .map((g) => ({ ...g, count: stats[g.id] || 0 }))
    .filter((e) => e.count > 0);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.lg,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    summaryItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    label: {
      fontSize: largeText ? 20 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.sm,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 80,
      alignItems: 'center',
      marginHorizontal: SPACING.sm,
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
      fontSize: 14,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 16,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fortschritt</Text>
      <View style={styles.summaryItem}>
        <Text style={styles.label}>Sitzungen</Text>
        <Text style={styles.label}>{engagement.totalSessions}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.label}>Durchschnittliche Sitzungsdauer (s)</Text>
        <Text style={styles.label}>{Math.round(engagement.averageDurationMs / 1000)}</Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.label}>{item.label}</Text>
            <Pressable
              style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.sm,
            alignItems: 'center',
            justifyContent: 'center',
          },
                styles.button,
                highContrast && styles.buttonHC,
                pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
              ]}
              onPress={() => {
                void childHaptic();
                navigation.navigate('ProgressChart', { gestureId: item.id });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Details für ${item.label} anzeigen`}
            >
              <Text style={[
                styles.buttonText,
                largeText && styles.buttonTextLarge,
                highContrast && styles.buttonTextHC,
              ]}>
                Details
              </Text>
            </Pressable>
            <Text style={styles.label}>{item.count}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.label}>Noch keine Nutzung</Text>}
      />
      <Pressable
        style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.md,
            alignItems: 'center',
            justifyContent: 'center',
          },
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
