import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';

interface CorrectionPanelProps {
  onSelect: (choiceId: string) => void;
  onAddNew: () => void;
  onCancel: () => void;
  suggestions: { id: string; label: string }[];
}

export default function CorrectionPanel({ onSelect, onAddNew, onCancel, suggestions }: CorrectionPanelProps) {
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
          <Text style={styles.title}>What did Amy sign?</Text>

          <View style={styles.optionsGrid}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                style={({ pressed }) => [styles.optionButton, pressed && styles.optionButtonPressed]}
                onPress={() => onSelect(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${s.label}`}
              >
                <Text style={styles.optionLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actionButtons}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.actionButtonSecondary, pressed && styles.optionButtonPressed]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel correction"
            >
              <Text style={styles.actionButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.optionButtonPressed]}
              onPress={onAddNew}
              accessibilityRole="button"
              accessibilityLabel="Add new gesture"
            >
              <Text style={styles.actionButtonText}>Add New</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
