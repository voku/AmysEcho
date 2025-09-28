/**
 * Two-Hand Gesture Selector Component - Phase 3.1
 *
 * Allows users to select and configure two-hand gestures during training
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { TWO_HAND_GESTURES, TwoHandGestureDefinition } from '../constants/twoHandGestures';

interface TwoHandGestureSelectorProps {
  onGestureSelected: (gesture: TwoHandGestureDefinition) => void;
  onCancel: () => void;
}

export default function TwoHandGestureSelector({
  onGestureSelected,
  onCancel
}: TwoHandGestureSelectorProps) {
  const { largeText, highContrast } = useAccessibility();
  const [selectedCategory, setSelectedCategory] = useState<TwoHandGestureDefinition['category'] | 'all'>('all');

  const categories: Array<{ key: TwoHandGestureDefinition['category'] | 'all'; label: string }> = [
    { key: 'all', label: 'Alle' },
    { key: 'communication', label: 'Kommunikation' },
    { key: 'emotional', label: 'Emotional' },
    { key: 'playful', label: 'Spielerisch' },
    { key: 'emergency', label: 'Notfall' },
  ];

  const filteredGestures = selectedCategory === 'all'
    ? TWO_HAND_GESTURES
    : TWO_HAND_GESTURES.filter(g => g.category === selectedCategory);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: DEFAULT_RADIUS * 2,
      padding: SPACING.lg,
      maxHeight: '80%',
    },
    header: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    subtitle: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
    categoryContainer: {
      flexDirection: 'row',
      marginBottom: SPACING.lg,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    categoryButton: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: DEFAULT_RADIUS,
      margin: SPACING.xs,
      borderWidth: 2,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    categoryButtonActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    categoryButtonInactive: {
      backgroundColor: 'transparent',
    },
    categoryText: {
      fontSize: largeText ? 14 : 12,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    categoryTextActive: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    gesturesContainer: {
      flex: 1,
    },
    gestureCard: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    gestureHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    gestureName: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    difficultyBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: DEFAULT_RADIUS,
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.secondaryAccent,
    },
    difficultyText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      fontWeight: 'bold',
    },
    gestureDescription: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: SPACING.sm,
      lineHeight: largeText ? 18 : 16,
    },
    handsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
    },
    handIndicator: {
      fontSize: largeText ? 24 : 20,
      marginHorizontal: SPACING.xs,
    },
    leftHand: {
      color: highContrast ? COLORS.highContrastText : '#4A90E2', // Blue for left
    },
    rightHand: {
      color: highContrast ? COLORS.highContrastText : '#E94B3C', // Red for right
    },
    gestureLabels: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    selectButton: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      alignItems: 'center',
    },
    selectButtonText: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    cancelButton: {
      backgroundColor: 'transparent',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      alignItems: 'center',
      marginTop: SPACING.md,
      borderWidth: 2,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    cancelButtonText: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    emptyState: {
      alignItems: 'center',
      padding: SPACING.lg,
    },
    emptyStateText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
  });

  const getDifficultyColor = (difficulty: TwoHandGestureDefinition['difficulty']) => {
    switch (difficulty) {
      case 'easy':
        return highContrast ? COLORS.highContrastText : '#4CAF50'; // Green
      case 'medium':
        return highContrast ? COLORS.highContrastText : '#FF9800'; // Orange
      case 'hard':
        return highContrast ? COLORS.highContrastText : '#F44336'; // Red
      default:
        return highContrast ? COLORS.highContrastText : COLORS.secondaryAccent;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          🤲 Zweihändige Gesten
        </Text>
        <Text style={styles.subtitle}>
          Wähle eine Geste aus, die beide Hände verwendet
        </Text>
      </View>

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        {categories.map((category) => {
          const isActive = selectedCategory === category.key;
          return (
            <Pressable
              key={category.key}
              style={[
                styles.categoryButton,
                isActive ? styles.categoryButtonActive : styles.categoryButtonInactive,
              ]}
              onPress={() => setSelectedCategory(category.key)}
              accessibilityLabel={`${category.label} Kategorie ${isActive ? 'ausgewählt' : 'auswählen'}`}
              accessibilityRole="button"
            >
              <Text style={[
                styles.categoryText,
                isActive && styles.categoryTextActive,
              ]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Gestures List */}
      <ScrollView style={styles.gesturesContainer} showsVerticalScrollIndicator={false}>
        {filteredGestures.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Keine Gesten in dieser Kategorie gefunden.
            </Text>
          </View>
        ) : (
          filteredGestures.map((gesture) => (
            <View key={gesture.id} style={styles.gestureCard}>
              <View style={styles.gestureHeader}>
                <Text style={styles.gestureName}>{gesture.name}</Text>
                <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(gesture.difficulty) }]}>
                  <Text style={styles.difficultyText}>
                    {gesture.difficulty.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.gestureDescription}>{gesture.description}</Text>

              {/* Visual hand indicators */}
              <View style={styles.handsContainer}>
                <Text style={[styles.handIndicator, styles.leftHand]}>🤲</Text>
                <Text style={styles.handIndicator}>+</Text>
                <Text style={[styles.handIndicator, styles.rightHand]}>🤲</Text>
              </View>

              <Text style={styles.gestureLabels}>
                {gesture.leftGesture} + {gesture.rightGesture}
              </Text>

              <Pressable
                style={styles.selectButton}
                onPress={() => onGestureSelected(gesture)}
                accessibilityLabel={`${gesture.name} auswählen`}
                accessibilityRole="button"
                accessibilityHint="Diese zweihändige Geste für das Training auswählen"
              >
                <Text style={styles.selectButtonText}>
                  Diese Geste wählen
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* Cancel Button */}
      <Pressable
        style={styles.cancelButton}
        onPress={onCancel}
        accessibilityLabel="Abbrechen"
        accessibilityRole="button"
        accessibilityHint="Zweihändige Geste Auswahl abbrechen"
      >
        <Text style={styles.cancelButtonText}>
          Abbrechen
        </Text>
      </Pressable>
    </View>
  );
}