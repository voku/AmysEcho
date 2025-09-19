import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import Svg, { Circle, Path } from 'react-native-svg';

const TEXT = {
  title: 'Deine Erfolge heute',
  subtitle: 'Das hast du toll gemacht!',
  total: 'Gesamt',
  unique: 'Verschiedene',
  today: 'Heute',
  mostUsed: 'Am häufigsten verwendet',
  allGestures: 'Alle Gesten',
  used: 'Verwendet',
  times: 'Mal',
  noData: 'Noch keine Gesten aufgezeichnet',
};

interface SuccessItem {
  gesture: string;
  count: number;
  lastUsed: Date;
  icon: string;
}

interface DailySuccessSummaryProps {
  onClose?: () => void;
}

// Mock data - in real app this would come from analytics/local storage
const mockSuccessData: SuccessItem[] = [
  { gesture: 'Hallo', count: 12, lastUsed: new Date(), icon: 'hello' },
  { gesture: 'Danke', count: 8, lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000), icon: 'thank_you' },
  { gesture: 'Bitte', count: 6, lastUsed: new Date(Date.now() - 4 * 60 * 60 * 1000), icon: 'please' },
  { gesture: 'Hilfe', count: 3, lastUsed: new Date(Date.now() - 6 * 60 * 60 * 1000), icon: 'help' },
  { gesture: 'Ja', count: 15, lastUsed: new Date(Date.now() - 1 * 60 * 60 * 1000), icon: 'yes' },
  { gesture: 'Nein', count: 4, lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000), icon: 'no' },
];

// Get icon for gesture
const getGestureIcon = (iconName: string, size: number = 24) => {
  const iconSize = size;

  switch (iconName) {
    case 'hello':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#4CAF50" strokeWidth={2} />
          <Path d="M14 2v6h6" stroke="#4CAF50" strokeWidth={2} />
          <Path d="M16 13H8" stroke="#4CAF50" strokeWidth={2} />
          <Path d="M16 17H8" stroke="#4CAF50" strokeWidth={2} />
          <Path d="M10 9H8" stroke="#4CAF50" strokeWidth={2} />
        </Svg>
      );
    case 'thank_you':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="#FF5722" strokeWidth={2} />
        </Svg>
      );
    case 'please':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#2196F3" strokeWidth={2} />
          <Path d="M8 12l2 2 4-4" stroke="#2196F3" strokeWidth={2} />
        </Svg>
      );
    case 'help':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#F44336" strokeWidth={2} />
          <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="#F44336" strokeWidth={2} />
          <Path d="M12 17h.01" stroke="#F44336" strokeWidth={2} />
        </Svg>
      );
    case 'yes':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#4CAF50" strokeWidth={2} />
          <Path d="M8 12l2 2 4-4" stroke="#4CAF50" strokeWidth={2} />
        </Svg>
      );
    case 'no':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#F44336" strokeWidth={2} />
          <Path d="M8 8l8 8M16 8l-8 8" stroke="#F44336" strokeWidth={2} />
        </Svg>
      );
    default:
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#607D8B" strokeWidth={2} />
          <Path d="M9 12l2 2 4-4" stroke="#607D8B" strokeWidth={2} />
        </Svg>
      );
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function DailySuccessSummary(_props: DailySuccessSummaryProps) {
  const { largeText, highContrast } = useAccessibility();
  const [successData] = useState<SuccessItem[]>(mockSuccessData);

  // Calculate summary statistics
  const totalGestures = successData.reduce((sum, item) => sum + item.count, 0);
  const mostUsedGesture = successData.reduce((prev, current) =>
    prev.count > current.count ? prev : current
  );
  const recentGestures = successData.filter(item =>
    Date.now() - item.lastUsed.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
  );

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
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      margin: SPACING.md,
      borderRadius: RADIUS,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    statItem: {
      alignItems: 'center',
    },
    statNumber: {
      fontSize: largeText ? 32 : 28,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    statLabel: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      marginTop: SPACING.xs,
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
    gestureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    gestureIcon: {
      marginRight: SPACING.md,
    },
    gestureInfo: {
      flex: 1,
    },
    gestureName: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    gestureStats: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginTop: SPACING.xs,
    },
    gestureCount: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    emptyState: {
      textAlign: 'center',
      padding: SPACING.xl,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      fontSize: largeText ? 16 : 14,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{TEXT.title}</Text>
        <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalGestures}</Text>
          <Text style={styles.statLabel}>{TEXT.total}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{successData.length}</Text>
          <Text style={styles.statLabel}>{TEXT.unique}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{recentGestures.length}</Text>
          <Text style={styles.statLabel}>{TEXT.today}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{TEXT.mostUsed}</Text>
          <View style={styles.gestureItem}>
            <View style={styles.gestureIcon}>
              {getGestureIcon(mostUsedGesture.icon, 32)}
            </View>
            <View style={styles.gestureInfo}>
              <Text style={styles.gestureName}>{mostUsedGesture.gesture}</Text>
              <Text style={styles.gestureStats}>
                {TEXT.used} <Text style={styles.gestureCount}>{mostUsedGesture.count}</Text> {TEXT.times}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{TEXT.allGestures}</Text>
          {successData.length > 0 ? (
            successData.map((item) => (
              <View key={item.gesture} style={styles.gestureItem}>
                <View style={styles.gestureIcon}>
                  {getGestureIcon(item.icon)}
                </View>
                <View style={styles.gestureInfo}>
                  <Text style={styles.gestureName}>{item.gesture}</Text>
                  <Text style={styles.gestureStats}>
                    {TEXT.used} <Text style={styles.gestureCount}>{item.count}</Text> {TEXT.times}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyState}>{TEXT.noData}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}