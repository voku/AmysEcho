/**
 * Visual Feedback Component - Amy First
 *
 * Provides immediate visual feedback for gesture recognition and user actions
 */

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface VisualFeedbackProps {
  isActive: boolean;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  duration?: number;
}

export default function VisualFeedback({
  isActive,
  type,
  message,
  duration = 1000
}: VisualFeedbackProps) {
  const { largeText, highContrast } = useAccessibility();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!isActive) {
      fadeAnim.stopAnimation();
      scaleAnim.stopAnimation();
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      return;
    }

    // Start animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-hide after duration
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, duration);

    return () => clearTimeout(timer);
  }, [isActive, fadeAnim, scaleAnim, duration]);

  if (!isActive) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: highContrast ? COLORS.highContrastText : COLORS.success,
          textColor: highContrast ? COLORS.highContrastBackground : COLORS.neutral,
          icon: '✅'
        };
      case 'warning':
        return {
          backgroundColor: highContrast ? COLORS.highContrastText : COLORS.warning,
          textColor: highContrast ? COLORS.highContrastBackground : COLORS.neutral,
          icon: '⚠️'
        };
      case 'error':
        return {
          backgroundColor: highContrast ? COLORS.highContrastText : COLORS.error,
          textColor: highContrast ? COLORS.highContrastBackground : COLORS.neutral,
          icon: '❌'
        };
      case 'info':
      default:
        return {
          backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
          textColor: highContrast ? COLORS.highContrastBackground : COLORS.highContrastText,
          icon: 'ℹ️'
        };
    }
  };

  const typeStyles = getTypeStyles();

  const styles = StyleSheet.create({
    container: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      backgroundColor: typeStyles.backgroundColor,
      borderRadius: DEFAULT_RADIUS,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    icon: {
      fontSize: largeText ? 20 : 18,
      marginRight: SPACING.xs,
    },
    text: {
      color: typeStyles.textColor,
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
    },
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [
            { translateX: -75 },
            { translateY: -25 },
            { scale: scaleAnim }
          ]
        }
      ]}
    >
      <Text style={styles.icon}>{typeStyles.icon}</Text>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}