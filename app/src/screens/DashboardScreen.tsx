import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {
  loadAnalytics,
  uploadAnalytics,
  LearningAnalytics,
} from '../services/analytics';
import { useAccessibility } from '../components/AccessibilityContext';

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
      backgroundColor: highContrast ? '#000' : '#fff',
    },
    label: {
      fontSize: largeText ? 24 : 20,
      marginBottom: 10,
      color: highContrast ? '#fff' : '#000',
    },
    barBackground: {
      width: 200,
      height: 20,
      borderColor: '#888',
      borderWidth: 1,
      marginBottom: 10,
    },
    barFill: {
      height: '100%',
      backgroundColor: '#4caf50',
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
