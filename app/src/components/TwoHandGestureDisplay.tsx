/**
 * Two-Hand Gesture Display Component - Phase 3.1
 *
 * Enhanced display for two-hand gestures with visual indicators
 * and special formatting to show both hands are involved.
 *
 * The recognition screen renders this component whenever the
 * parallel/two-hand detection pipeline reports a combined gesture.
 * That makes it easier for Amy (and observers) to understand
 * which coordinated movement was recognised without conflating it
 * with the standard single-hand emoji view.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { isTwoHandGestureString, parseTwoHandGestureString, getTwoHandGestureById } from '../constants/twoHandGestures';

const CONFIDENCE_LABEL = 'Sicherheit';

interface TwoHandGestureDisplayProps {
  gestureString: string;
  confidence: number;
  showDetails?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function TwoHandGestureDisplay({
  gestureString,
  confidence,
  showDetails = true,
  size = 'medium'
}: TwoHandGestureDisplayProps) {
  const { largeText, highContrast } = useAccessibility();

  // Check if this is a two-hand gesture
  if (!isTwoHandGestureString(gestureString)) {
    return null; // Not a two-hand gesture, let normal display handle it
  }

  const parsed = parseTwoHandGestureString(gestureString);
  if (!parsed) {
    return null; // Invalid format
  }

  // Try to find the gesture definition
  const gestureDef = getTwoHandGestureById(gestureString);

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          symbolSize: largeText ? 24 : 20,
          textSize: largeText ? 14 : 12,
          confidenceSize: largeText ? 12 : 10,
        };
      case 'large':
        return {
          symbolSize: largeText ? 64 : 48,
          textSize: largeText ? 24 : 20,
          confidenceSize: largeText ? 18 : 16,
        };
      default: // medium
        return {
          symbolSize: largeText ? 48 : 36,
          textSize: largeText ? 20 : 18,
          confidenceSize: largeText ? 16 : 14,
        };
    }
  };

  const sizes = getSizeStyles();

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(0, 0, 0, 0.7)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.sm,
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    handsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: showDetails ? SPACING.xs : 0,
    },
    handSymbol: {
      fontSize: sizes.symbolSize,
      marginHorizontal: SPACING.xs,
    },
    leftHand: {
      color: highContrast ? COLORS.highContrastText : '#4A90E2', // Blue for left
    },
    rightHand: {
      color: highContrast ? COLORS.highContrastText : '#E94B3C', // Red for right
    },
    gestureName: {
      fontSize: sizes.textSize,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginBottom: showDetails ? SPACING.xs : 0,
    },
    confidenceText: {
      fontSize: sizes.confidenceSize,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
    detailsContainer: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.1)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.xs,
      marginTop: SPACING.xs,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    detailsText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      lineHeight: largeText ? 16 : 14,
    },
    categoryBadge: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      borderRadius: DEFAULT_RADIUS,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      marginTop: SPACING.xs,
    },
    categoryText: {
      fontSize: largeText ? 10 : 8,
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });

  return (
    <View style={styles.container}>
      {/* Two-hand visual indicator */}
      <View style={styles.handsContainer}>
        <Text style={[styles.handSymbol, styles.leftHand]}>🤲</Text>
        <Text style={styles.handSymbol}>+</Text>
        <Text style={[styles.handSymbol, styles.rightHand]}>🤲</Text>
      </View>

      {/* Gesture name */}
      <Text style={styles.gestureName}>
        {gestureDef ? gestureDef.name : `${parsed.left} + ${parsed.right}`}
      </Text>

      {/* Confidence */}
      <Text style={styles.confidenceText}>
        {Math.round(confidence * 100)}% {CONFIDENCE_LABEL}
      </Text>

      {/* Additional details */}
      {showDetails && gestureDef && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsText}>
            {gestureDef.description}
          </Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {gestureDef.category.toUpperCase()}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}