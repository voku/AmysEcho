import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import Svg, { Path, Circle } from 'react-native-svg';
import type { OptimizedGestureService } from '../services/optimizedGestureService';

interface CorrectionPanelProps {
  onSelect: (choiceId: string) => void;
  onAddNew: () => void;
  onCancel: () => void;
  suggestions: { id: string; label: string; confidence?: number }[];
  gestureModel?: OptimizedGestureService;
  showPictures?: boolean;
}

// Enhanced gesture icon mapping - visual representations for common gestures
export const getGestureIcon = (gestureId: string) => {
  const iconSize = 48;

  switch (gestureId) {
    case 'hello':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path d="M7 4v16l13-8L7 4z" stroke="#4CAF50" strokeWidth={2} fill="#4CAF50" fillOpacity={0.2} />
          <Path d="M7 4v16" stroke="#4CAF50" strokeWidth={2} />
        </Svg>
      );
    case 'thank_you':
      return (
        <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="#FF5722" strokeWidth={2} fill="#FF5722" fillOpacity={0.2} />
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
          <Circle cx={12} cy={12} r={10} stroke="#9E9E9E" strokeWidth={2} />
          <Path d="M8 12l2 2 4-4" stroke="#9E9E9E" strokeWidth={2} />
        </Svg>
      );
  }
};

function CorrectionPanel({ onSelect, onAddNew, onCancel, suggestions, gestureModel, showPictures }: CorrectionPanelProps) {
  const { largeText, highContrast } = useAccessibility();

  const styles = StyleSheet.create({
    modal: {
      flex: 1,
      backgroundColor: `${COLORS.highContrastBackground}CC`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    container: {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: RADIUS * 2,
      padding: SPACING.md,
      margin: SPACING.md,
      maxWidth: '90%',
      maxHeight: '80%',
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    title: {
      fontSize: largeText ? 28 : 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    optionButton: {
      width: '48%',
      backgroundColor: highContrast ? COLORS.text : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      alignItems: 'center',
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    iconContainer: {
      marginBottom: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionButtonPressed: {
      backgroundColor: highContrast ? COLORS.highContrastPressed : COLORS.pressed,
    },
    optionLabel: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: SPACING.sm,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    optionDescription: {
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
      color: highContrast ? COLORS.border : COLORS.textMuted,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: SPACING.md,
    },
    actionButton: {
      backgroundColor: COLORS.primaryAccent,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS,
      minWidth: 104,
    },
    actionButtonSecondary: {
      backgroundColor: highContrast ? COLORS.textMuted : COLORS.secondaryAccent,
    },
    actionButtonText: {
      color: COLORS.highContrastText,
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    suggestionsContainer: {
      marginBottom: SPACING.sm,
    },
    subtitle: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    subtitleHC: {
      color: COLORS.highContrastText,
    },
    confidenceBadge: {
      position: 'absolute',
      top: -8,
      right: -8,
      backgroundColor: COLORS.success,
      borderRadius: 12,
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confidenceText: {
      fontSize: 14,
      color: COLORS.highContrastText,
    },
    recommendedText: {
      fontSize: largeText ? 12 : 10,
      color: COLORS.success,
      fontWeight: 'bold',
      marginTop: SPACING.xs,
    },
    recommendedTextHC: {
      color: COLORS.highContrastText,
    },
  });

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modal}>
        <View style={styles.container}>
          <Text style={styles.title}>Welche Gebärde hat Amy gezeigt?</Text>

          {suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <Text style={[styles.subtitle, highContrast && styles.subtitleHC]}>
                Vorschläge:
              </Text>
            </View>
          )}

            <View style={styles.optionsGrid}>
             {suggestions.length > 0 ? suggestions.map((s, index) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [styles.optionButton, pressed && styles.optionButtonPressed]}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelect(s.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Wähle ${s.label}`}
                >
                  <View style={styles.iconContainer}>
                    {getGestureIcon(s.id)}
                    {s.confidence && s.confidence > 0.7 && (
                      <View style={styles.confidenceBadge}>
                        <Text style={styles.confidenceText}>⭐</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.optionLabel}>{s.label}</Text>
                  {index === 0 && suggestions.length > 1 && (
                    <Text style={[styles.recommendedText, highContrast && styles.recommendedTextHC]}>
                      Empfohlen
                    </Text>
                  )}
                </Pressable>
              )) : (
                <View style={styles.optionButton}>
                  <Text style={styles.optionLabel}>Keine Vorschläge verfügbar</Text>
                  <Text style={styles.optionDescription}>Drücke "Neu hinzufügen" um eine neue Geste zu erstellen</Text>
                </View>
              )}
          </View>

          <View style={styles.actionButtons}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.actionButtonSecondary, pressed && styles.optionButtonPressed]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onCancel();
              }}
              accessibilityRole="button"
              accessibilityLabel="Korrektur abbrechen"
            >
              <Text style={styles.actionButtonText}>Abbrechen</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.optionButtonPressed]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onAddNew();
              }}
              accessibilityRole="button"
              accessibilityLabel="Neue Geste hinzufügen"
            >
              <Text style={styles.actionButtonText}>Neu hinzufügen</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Custom comparison function for React.memo
const arePropsEqual = (prevProps: CorrectionPanelProps, nextProps: CorrectionPanelProps): boolean => {
  return (
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.onAddNew === nextProps.onAddNew &&
    prevProps.onCancel === nextProps.onCancel &&
    prevProps.showPictures === nextProps.showPictures &&
    prevProps.gestureModel === nextProps.gestureModel &&
    JSON.stringify(prevProps.suggestions) === JSON.stringify(nextProps.suggestions)
  );
};

export { CorrectionPanel as CorrectionPanelComponent };
export default memo(CorrectionPanel, arePropsEqual);
