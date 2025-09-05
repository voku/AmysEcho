import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import Svg, { Circle, Path } from 'react-native-svg';
import { LanguageManager } from '../services/LanguageManager';

interface ScheduleItem {
  id: string;
  time: string;
  activity: string;
  completed: boolean;
  icon: string;
}

interface VisualScheduleProps {
  onScheduleComplete?: () => void;
  onActivityPress?: (activity: ScheduleItem) => void;
}

// Sample schedule data - in real app this would come from storage/settings
const defaultSchedule: ScheduleItem[] = [
  { id: '1', time: '09:00', activity: 'Guten Morgen Geste', completed: false, icon: 'hello' },
  { id: '2', time: '10:00', activity: 'Danke Geste üben', completed: false, icon: 'thank_you' },
  { id: '3', time: '11:00', activity: 'Bitte Geste', completed: false, icon: 'please' },
  { id: '4', time: '14:00', activity: 'Hilfe Geste', completed: false, icon: 'help' },
  { id: '5', time: '15:00', activity: 'Ja/Nein Gesten', completed: false, icon: 'yes_no' },
  { id: '6', time: '16:00', activity: 'Mehr Geste', completed: false, icon: 'more' },
];

// Visual icons for activities
const getActivityIcon = (iconName: string, size: number = 32) => {
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
    case 'yes_no':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={8} cy={8} r={6} stroke="#4CAF50" strokeWidth={2} />
          <Path d="M5 8l2 2 4-4" stroke="#4CAF50" strokeWidth={2} />
          <Circle cx={16} cy={16} r={6} stroke="#F44336" strokeWidth={2} />
          <Path d="M13 13l6 6M19 13l-6 6" stroke="#F44336" strokeWidth={2} />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#9C27B0" strokeWidth={2} />
          <Path d="M8 12h8M12 8v8" stroke="#9C27B0" strokeWidth={2} />
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
export default function VisualSchedule({ onScheduleComplete, onActivityPress }: VisualScheduleProps) {
  const { largeText, highContrast } = useAccessibility();
  const [schedule, setSchedule] = useState<ScheduleItem[]>(defaultSchedule);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const handleActivityPress = (item: ScheduleItem) => {
    if (onActivityPress) {
      onActivityPress(item);
    } else {
      // Default behavior: mark as completed
      setSchedule(prev =>
        prev.map(s => s.id === item.id ? { ...s, completed: !s.completed } : s)
      );
    }
  };

  const getCurrentTimeSlot = () => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    // Find the current or next activity
    for (const item of schedule) {
      if (item.time >= currentTimeString) {
        return item;
      }
    }
    return null;
  };

  const currentActivity = getCurrentTimeSlot();
  const completedCount = schedule.filter(item => item.completed).length;
  const totalCount = schedule.length;

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
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.sm,
    },
    progressText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
      marginHorizontal: SPACING.sm,
    },
    scheduleContainer: {
      flex: 1,
      padding: SPACING.md,
    },
    timeSlot: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    timeSlotCurrent: {
      backgroundColor: highContrast ? COLORS.primaryAccent : COLORS.primaryAccent,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    timeSlotCompleted: {
      backgroundColor: highContrast ? COLORS.secondaryAccent : '#E8F5E8',
      borderColor: highContrast ? COLORS.highContrastText : '#4CAF50',
    },
    timeContainer: {
      width: 80,
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    timeText: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    activityContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconContainer: {
      marginRight: SPACING.md,
    },
    activityText: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    statusIndicator: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusIndicatorCompleted: {
      backgroundColor: highContrast ? COLORS.highContrastText : '#4CAF50',
      borderColor: highContrast ? COLORS.highContrastText : '#4CAF50',
    },
    checkmark: {
      color: highContrast ? COLORS.highContrastBackground : 'white',
      fontSize: 14,
      fontWeight: 'bold',
    },
    currentIndicator: {
      position: 'absolute',
      right: SPACING.md,
      top: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastText : '#FF9800',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS,
    },
    currentText: {
      color: highContrast ? COLORS.highContrastBackground : 'white',
      fontSize: largeText ? 14 : 12,
      fontWeight: 'bold',
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{LanguageManager.t('schedule.title')}</Text>
        <Text style={styles.subtitle}>{LanguageManager.t('schedule.subtitle')}</Text>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {completedCount} / {totalCount} {LanguageManager.t('schedule.completed')}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scheduleContainer}>
        {schedule.map((item) => {
          const isCurrent = currentActivity?.id === item.id;
          const isCompleted = item.completed;

          return (
            <Pressable
              key={item.id}
              style={[
                styles.timeSlot,
                isCurrent && styles.timeSlotCurrent,
                isCompleted && styles.timeSlotCompleted,
              ]}
              onPress={() => handleActivityPress(item)}
              accessibilityLabel={`${item.time}: ${item.activity}${isCompleted ? ' - erledigt' : ''}`}
              accessibilityRole="button"
              accessibilityHint={isCompleted ? 'Aktivität als unerledigt markieren' : 'Aktivität als erledigt markieren'}
            >
              <View style={styles.timeContainer}>
                <Text style={[styles.timeText, isCurrent && { color: highContrast ? COLORS.highContrastBackground : 'white' }]}>
                  {item.time}
                </Text>
              </View>

              <View style={styles.activityContainer}>
                <View style={styles.iconContainer}>
                  {getActivityIcon(item.icon)}
                </View>
                <Text style={[styles.activityText, isCurrent && { color: highContrast ? COLORS.highContrastBackground : 'white' }]}>
                  {item.activity}
                </Text>
                <View style={[styles.statusIndicator, isCompleted && styles.statusIndicatorCompleted]}>
                  {isCompleted && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </View>

              {isCurrent && (
                <View style={styles.currentIndicator}>
                  <Text style={styles.currentText}>{LanguageManager.t('schedule.now')}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}