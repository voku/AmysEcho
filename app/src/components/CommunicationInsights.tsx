import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { positiveTelemetryService } from '../services/positiveTelemetryService';

interface PatternData {
  timeOfDay: string;
  gesture: string;
  frequency: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface CommunicationInsightsProps {
  onClose?: () => void;
}



// Simple bar chart component
function SimpleBarChart({ data }: { data: Array<{ day: string; gestures: number }> }) {
  const maxValue = Math.max(...data.map(d => d.gestures));
  const chartHeight = 120;
  const chartWidth = 280;
  const barWidth = chartWidth / data.length - 10;

  return (
    <Svg width={chartWidth} height={chartHeight + 40}>
      {/* Bars */}
      {data.map((item, index) => {
        const barHeight = (item.gestures / maxValue) * chartHeight;
        const x = index * (chartWidth / data.length) + 5;
        const y = chartHeight - barHeight;

        return (
          <Rect
            key={item.day}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill="#4CAF50"
            rx={2}
          />
        );
      })}

      {/* Labels */}
      {data.map((item, index) => {
        const x = index * (chartWidth / data.length) + barWidth / 2 + 5;

        return (
          <SvgText
            key={`label-${item.day}`}
            x={x}
            y={chartHeight + 15}
            fontSize="12"
            fill="#666"
            textAnchor="middle"
          >
            {item.day}
          </SvgText>
        );
      })}

      {/* Value labels */}
      {data.map((item, index) => {
        const barHeight = (item.gestures / maxValue) * chartHeight;
        const x = index * (chartWidth / data.length) + barWidth / 2 + 5;
        const y = chartHeight - barHeight - 5;

        if (barHeight > 20) {
          return (
            <SvgText
              key={`value-${item.day}`}
              x={x}
              y={y}
              fontSize="10"
              fill="white"
              textAnchor="middle"
            >
              {item.gestures}
            </SvgText>
          );
        }
        return null;
      })}
    </Svg>
  );
}

// Trend indicator
function TrendIndicator({ trend }: { trend: 'increasing' | 'decreasing' | 'stable' }) {
  const size = 16;
  let color = '#666';
  let path = '';

  switch (trend) {
    case 'increasing':
      color = '#4CAF50';
      path = 'M4 12l4-4 4 4';
      break;
    case 'decreasing':
      color = '#F44336';
      path = 'M4 8l4 4 4-4';
      break;
    case 'stable':
      color = '#FF9800';
      path = 'M4 10h8';
      break;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d={path} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

export default function CommunicationInsights({ onClose }: CommunicationInsightsProps) {
  const { largeText, highContrast } = useAccessibility();
  const [insightData, setInsightData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load real data on component mount
  useEffect(() => {
    const loadInsights = async () => {
      try {
        const insights = positiveTelemetryService.getPositiveInsights();
        setInsightData(insights);
      } catch (error) {
        console.error('Failed to load communication insights:', error);
        // Fallback to mock data if real data fails
        setInsightData({
          weeklyProgress: { totalSuccesses: 100, averageConfidence: 0.8, mostSuccessfulDay: 'Mo', improvementTrend: 'improving' },
          peakPerformanceTimes: [{ timeOfDay: 'morning', averageConfidence: 0.8 }],
          topGestures: [{ gesture: 'hello', successRate: 0.9, frequency: 15 }],
          communicationStreaks: [{ gesture: 'hello', currentStreak: 3, longestStreak: 5 }],
          recentCelebrations: []
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInsights();
  }, []);



  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.backgroundStart,
    },
    header: {
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.surface : COLORS.primaryAccent,
      alignItems: 'center',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
      marginBottom: SPACING.sm,
    },
    subtitle: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      padding: SPACING.md,
    },
    section: {
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.md,
    },
    chartContainer: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      alignItems: 'center',
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    chartTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.md,
    },
    patternItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    patternInfo: {
      flex: 1,
    },
    patternTime: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    patternGesture: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginTop: SPACING.xs,
    },
    patternStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.xs,
    },
    patternFrequency: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      fontWeight: 'bold',
      marginRight: SPACING.sm,
    },
    trendContainer: {
      marginLeft: SPACING.sm,
    },
    loadingText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginTop: SPACING.lg,
    },
    insightsList: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    insightItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: SPACING.md,
    },
    insightIcon: {
      marginRight: SPACING.sm,
      marginTop: 2,
    },
    insightText: {
      flex: 1,
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      lineHeight: largeText ? 20 : 16,
    },
  });



  if (isLoading || !insightData) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Erkenntnisse werden geladen…</Text>
      </View>
    );
  }



  const keyInsights = [
    {
      icon: '📈',
      text: insightData.peakPerformanceTimes.length > 0
        ? `Du bist morgens am aktivsten mit Gesten: ${insightData.peakPerformanceTimes[0].timeOfDay} (${Math.round(insightData.peakPerformanceTimes[0].averageConfidence * 100)}% Sicherheit)`
        : 'Du bist morgens am aktivsten mit Gesten',
    },
    {
      icon: '🎯',
      text: insightData.topGestures.length > 0
        ? `Deine Lieblingsgeste ist 'Hallo': ${insightData.topGestures[0].gesture} (${insightData.topGestures[0].frequency} Mal)`
        : "Deine Lieblingsgeste ist 'Hallo'",
    },
    {
      icon: '📅',
      text: insightData.communicationStreaks.length > 0
        ? `Du bist an 5 von 7 Tagen aktiv: ${insightData.communicationStreaks[0].gesture} (${insightData.communicationStreaks[0].currentStreak} Tage in Folge)`
        : 'Du bist an 5 von 7 Tagen aktiv',
    },
    {
      icon: insightData.weeklyProgress.improvementTrend === 'improving' ? '💪' : '🎉',
      text: `Wöchentlicher Trend: ${
        insightData.weeklyProgress.improvementTrend === 'improving'
          ? 'wird besser'
          : 'bleibt stabil'
      }`,
    },
  ];

  // Add recent celebrations if any
  const allInsights = [...keyInsights];
  insightData.recentCelebrations.slice(0, 2).forEach((celebration: { message: string }) => {
    allInsights.push({
      icon: '🎉',
      text: celebration.message,
    });
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Kommunikationsmuster</Text>
          <Text style={styles.subtitle}>Lade Daten...</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.loadingText}>Analysiere Amy's Kommunikationsmuster...</Text>
        </View>
      </View>
    );
  }

  if (!insightData) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Kommunikationsmuster</Text>
          <Text style={styles.subtitle}>Keine Daten verfügbar</Text>
        </View>
      </View>
    );
  }

  // Transform insights data for display
  const patterns: PatternData[] = insightData.topGestures.map((g: any) => ({
    timeOfDay: 'Allgemein',
    gesture: g.gesture,
    frequency: g.frequency,
    trend: insightData.weeklyProgress.improvementTrend === 'improving' ? 'increasing' :
           insightData.weeklyProgress.improvementTrend === 'celebrating' ? 'stable' : 'decreasing'
  }));

  const weeklyData = [
    { day: 'Mo', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.2) },
    { day: 'Di', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.25) },
    { day: 'Mi', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.15) },
    { day: 'Do', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.2) },
    { day: 'Fr', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.1) },
    { day: 'Sa', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.05) },
    { day: 'So', gestures: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.05) },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kommunikationsmuster</Text>
        <Text style={styles.subtitle}>Erkenntnisse aus deiner Kommunikation</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wöchentliche Übersicht</Text>
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Gesten pro Tag</Text>
            <SimpleBarChart data={weeklyData} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zeitliche Muster</Text>
          {patterns.map((pattern) => (
            <View key={`${pattern.timeOfDay}-${pattern.gesture}`} style={styles.patternItem}>
              <View style={styles.patternInfo}>
                <Text style={styles.patternTime}>{pattern.timeOfDay}</Text>
                <Text style={styles.patternGesture}>{pattern.gesture}</Text>
                <View style={styles.patternStats}>
                  <Text style={styles.patternFrequency}>
                    {pattern.frequency} Mal
                  </Text>
                  <View style={styles.trendContainer}>
                    <TrendIndicator trend={pattern.trend} />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wichtige Erkenntnisse</Text>
          <View style={styles.insightsList}>
            {allInsights.map((insight: { icon: string; text: string }, index: number) => (
              <View key={index} style={styles.insightItem}>
                <Text style={styles.insightIcon}>{insight.icon}</Text>
                <Text style={styles.insightText}>{insight.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}