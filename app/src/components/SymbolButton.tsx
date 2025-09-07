// React imports
import React, { memo, useMemo } from 'react';

// React Native imports
import { Pressable, Text, StyleSheet } from 'react-native';

// Third-party imports
// (none)

// Local imports
import { Symbol } from '../../db/models';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';

/**
 * Map symbol categories to vocabulary pastel colors
 * @param category - The symbol category (drink, eat, play, etc.)
 * @returns The corresponding pastel color
 */
const getCategoryColor = (category: string): string => {
  switch (category?.toLowerCase()) {
    case 'drink':
    case 'trinken':
      return COLORS.vocabDrink;
    case 'eat':
    case 'essen':
      return COLORS.vocabEat;
    case 'play':
    case 'spielen':
      return COLORS.vocabPlay;
    default:
      return COLORS.primaryAccent; // Default to calm blue
  }
};

interface SymbolButtonProps {
  symbol: Symbol;
  onPress: (s: Symbol) => void;
}

/**
 * SymbolButton component for displaying vocabulary symbols
 * @param symbol - The symbol to display
 * @param onPress - Callback when the button is pressed
 */
const SymbolButtonComponent = ({ symbol, onPress }: SymbolButtonProps) => {
  const { largeText, highContrast } = useAccessibility();

  // Memoize computed values to prevent recalculation on every render
  const symbolColor = useMemo(() => symbol.color || getCategoryColor(symbol.category), [symbol.color, symbol.category]);

  const buttonStyle = useMemo(() => [
    childFriendlyStyles.minTouchTarget,
    styles.button,
    highContrast && styles.buttonHC,
    !highContrast && {
      backgroundColor: symbolColor,
      borderColor: symbolColor,
    },
  ], [highContrast, symbolColor]);

  const textStyle = useMemo(() => [
    styles.text,
    largeText && styles.textLarge,
    highContrast && styles.textHC,
  ], [largeText, highContrast]);

  return (
    <Pressable
      style={({ pressed }) => [
        ...buttonStyle,
        pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
      ]}
      onPress={() => {
        void childHaptic();
        onPress(symbol);
      }}
      accessibilityRole="button"
      accessibilityLabel={symbol.name}
    >
      <Text
        style={textStyle}
        accessibilityLabel={symbol.name}
      >
        {symbol.emoji} {symbol.name}
      </Text>
    </Pressable>
  );
};

// Custom comparison function for React.memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps: SymbolButtonProps, nextProps: SymbolButtonProps): boolean => {
  return (
    prevProps.symbol.id === nextProps.symbol.id &&
    prevProps.symbol.name === nextProps.symbol.name &&
    prevProps.symbol.emoji === nextProps.symbol.emoji &&
    prevProps.symbol.color === nextProps.symbol.color &&
    prevProps.symbol.category === nextProps.symbol.category &&
    prevProps.onPress === nextProps.onPress
  );
};

export const SymbolButton = memo(SymbolButtonComponent, arePropsEqual);

const styles = StyleSheet.create({
  button: {
    padding: SPACING.md,
    margin: SPACING.sm,
    borderRadius: RADIUS,
    borderWidth: 1,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  buttonPressed: { backgroundColor: COLORS.pressed },
  buttonPressedHC: { backgroundColor: COLORS.highContrastPressed },
  text: { fontSize: 20, color: COLORS.text },
  textLarge: { fontSize: 24 },
  textHC: { color: COLORS.highContrastText },
});
