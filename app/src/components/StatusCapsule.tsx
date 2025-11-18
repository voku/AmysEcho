/**
 * StatusCapsule - Compact floating status indicator
 * Inspired by Gemini click-dummy design for cleaner visual hierarchy
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';

interface StatusCapsuleProps {
  /**
   * Main status text to display
   */
  text: string;
  
  /**
   * Status category determines dot color
   */
  category: 'idle' | 'listening' | 'recognized' | 'updating' | 'error';
  
  /**
   * Optional detailed status message
   */
  detail?: string;
  
  /**
   * Whether to use compact mode (smaller sizing)
   */
  compact?: boolean;
}

const DOT_COLORS = {
  idle: '#FFCC00',      // Yellow - waiting
  listening: '#4CD964', // Green - active
  recognized: '#5AC8FA',// Blue - recognized
  updating: '#FF9500',  // Orange - updating
  error: '#FF3B30',     // Red - error
} as const;

/**
 * Compact status capsule component with colored dot indicator
 * More compact than traditional status cards for better screen space utilization
 */
export default function StatusCapsule({ 
  text, 
  category, 
  detail, 
  compact = false 
}: StatusCapsuleProps) {
  return (
    <View 
      style={[
        styles.container,
        compact && styles.containerCompact,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${text}${detail ? `, ${detail}` : ''}`}
    >
      <View 
        style={[
          styles.dot, 
          { backgroundColor: DOT_COLORS[category] },
          compact && styles.dotCompact,
        ]} 
      />
      <View style={styles.textContainer}>
        <Text 
          style={[
            styles.text,
            compact && styles.textCompact,
          ]}
          numberOfLines={1}
        >
          {text}
        </Text>
        {detail && !compact && (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 112, 111, 0.85)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    alignSelf: 'center',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  containerCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  dotCompact: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  textContainer: {
    flexDirection: 'column',
  },
  text: {
    color: Colors.inverseText,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium as any,
    letterSpacing: 0.3,
  },
  textCompact: {
    fontSize: typography.sizes.caption,
    letterSpacing: 0.2,
  },
  detail: {
    color: Colors.inverseText,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.regular as any,
    opacity: 0.8,
  },
});
