import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {
  loadAnalytics,
  uploadAnalytics,
  LearningAnalytics,
} from '../services/analytics';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';

export default function DashboardScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [data, setData] = useState<LearningAnalytics | null>(null);

  useEffect(() => {
    loadAnalytics().then((d) => {
      setData(d);
      uploadAnalytics(d);
    });
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
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Analytics Dashboard</Text>
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
            Success Rate (7d): {(data.successRate7d * 100).toFixed(0)}%
          </Text>
          <Text style={styles.label}>
            Trend: {(data.improvementTrend * 100).toFixed(0)}%
          </Text>
        </>
      ) : (
        <Text style={styles.label}>No data</Text>
      )}
      <Button
        title="Back"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Zurück"
      />
    </View>
  );
}
