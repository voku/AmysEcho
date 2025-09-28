import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocation } from '../context/LocationContext';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';

const LOCATIONS = [
  { key: 'home' as const, label: 'Zuhause', emoji: '🏠' },
  { key: 'school' as const, label: 'Kindergarten', emoji: '🎒' },
  { key: 'playground' as const, label: 'Spielplatz', emoji: '🛝' },
  { key: 'other' as const, label: 'Anderer Ort', emoji: '📍' },
];

export default function LocationSelector() {
  const { currentLocation, setLocation } = useLocation();
  const { largeText, highContrast } = useAccessibility();

  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: DEFAULT_RADIUS,
      margin: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    title: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    locationContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    locationButton: {
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 80,
    },
    locationButtonActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    locationButtonInactive: {
      backgroundColor: 'transparent',
    },
    locationEmoji: {
      fontSize: largeText ? 32 : 28,
      marginBottom: SPACING.xs,
    },
    locationLabel: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    locationLabelActive: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.highContrastText,
    },
  }), [largeText, highContrast]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ort wählen</Text>
      <View style={styles.locationContainer}>
        {LOCATIONS.map(loc => {
          const isActive = currentLocation === loc.key;
          return (
            <Pressable
              key={loc.key}
              style={[
                styles.locationButton,
                isActive ? styles.locationButtonActive : styles.locationButtonInactive,
              ]}
              onPress={() => setLocation(loc.key)}
              accessibilityLabel={`${loc.label} auswählen`}
              accessibilityRole="button"
            >
              <Text style={styles.locationEmoji}>{loc.emoji}</Text>
              <Text
                style={[
                  styles.locationLabel,
                  isActive && styles.locationLabelActive,
                ]}
              >
                {loc.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
