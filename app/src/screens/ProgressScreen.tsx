import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Button, StyleSheet } from 'react-native';
import { loadUsageStats } from '../services/usageTracker';
import { loadProfile, Profile } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';

export default function ProgressScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p);
      if (p) {
        loadUsageStats(p.id).then(setStats);
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
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    label: {
      fontSize: largeText ? 20 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Progress</Text>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.label}>{item.count}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.label}>No usage yet</Text>}
      />
      <Button title="Back" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
    </View>
  );
}
