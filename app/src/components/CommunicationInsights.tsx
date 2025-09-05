import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { LanguageManager } from '../services/LanguageManager';

interface PatternData {
  timeOfDay: string;
  gesture: string;
  frequency: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface CommunicationInsightsProps {
  onClose?: () => void;
}

// Mock data - in real app this would come from analytics
const mockPatterns: PatternData[] = [
  { timeOfDay: 'Morgens (6-12)', gesture: 'Hallo', frequency: 8, trend: 'increasing' },
  { timeOfDay: 'Mittags (12-18)', gesture: 'Bitte', frequency: 12, trend: 'stable' },
  { timeOfDay: 'Abends (18-22)', gesture: 'Danke', frequency: 6, trend: 'decreasing' },
];

const mockWeeklyData = [
  { day: 'Mo', gestures: 15 },
  { day: 'Di', gestures: 22 },
  { day: 'Mi', gestures: 18 },
  { day: 'Do', gestures: 25 },
  { day: 'Fr', gestures: 20 },
  { day: 'Sa', gestures: 12 },
  { day: 'So', gestures: 8 },
];

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CommunicationInsights({ onClose }: CommunicationInsightsProps) {
  const { largeText, highContrast } = useAccessibility();
  const [patterns] = useState<PatternData[]>(mockPatterns);
  const [weeklyData] = useState(mockWeeklyData);

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
      borderRadius: RADIUS,
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
      borderRadius: RADIUS,
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
    insightsList: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: RADIUS,
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

  const insights = [
    {
      icon: '📈',
      text: LanguageManager.t('insights.most_active_time'),
    },
    {
      icon: '🎯',
      text: LanguageManager.t('insights.favorite_gesture'),
    },
    {
      icon: '📅',
      text: LanguageManager.t('insights.consistent_days'),
    },
    {
      icon: '💪',
      text: LanguageManager.t('insights.improvement_areas'),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{LanguageManager.t('insights.title')}</Text>
        <Text style={styles.subtitle}>{LanguageManager.t('insights.subtitle')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{LanguageManager.t('insights.weekly_overview')}</Text>
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>{LanguageManager.t('insights.gestures_per_day')}</Text>
            <SimpleBarChart data={weeklyData} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{LanguageManager.t('insights.patterns')}</Text>
          {patterns.map((pattern) => (
            <View key={`${pattern.timeOfDay}-${pattern.gesture}`} style={styles.patternItem}>
              <View style={styles.patternInfo}>
                <Text style={styles.patternTime}>{pattern.timeOfDay}</Text>
                <Text style={styles.patternGesture}>{pattern.gesture}</Text>
                <View style={styles.patternStats}>
                  <Text style={styles.patternFrequency}>
                    {pattern.frequency} {LanguageManager.t('insights.times')}
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
          <Text style={styles.sectionTitle}>{LanguageManager.t('insights.key_insights')}</Text>
          <View style={styles.insightsList}>
            {insights.map((insight, index) => (
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