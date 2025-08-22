import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {
  loadAnalytics,
  uploadAnalytics,
  LearningAnalytics,
} from '../services/analytics';
import { useAccessibility } from '../components/AccessibilityContext';
import { API_URL, API_TOKEN } from '../constants';
import { COLORS, SPACING } from '../constants/ui';

export default function DashboardScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [data, setData] = useState<LearningAnalytics | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [insights, setInsights] = useState<any | null>(null);

  useEffect(() => {
    loadAnalytics().then((d) => {
      setData(d);
      uploadAnalytics(d);
    });
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
          {summary && (
            <>
              <Text style={styles.label}>Corrections: {(summary.correctionRate * 100).toFixed(0)}%</Text>
              <Text style={styles.label}>Uncertainty: {(summary.uncertaintyRatio * 100).toFixed(0)}%</Text>
              {summary.medianLatencyMs != null && (
                <Text style={styles.label}>Median Latency: {summary.medianLatencyMs} ms</Text>
              )}
            </>
          )}
          {insights && Array.isArray(insights.recommendations) && insights.recommendations.length > 0 && (
            <>
              <Text style={styles.label}>Recommendations:</Text>
              <Text style={styles.label}>{insights.recommendations.map((r: any) => r.gesture).join(', ')}</Text>
            </>
          )}
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
