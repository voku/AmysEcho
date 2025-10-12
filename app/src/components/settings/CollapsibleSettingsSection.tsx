import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';

import { COLORS, DEFAULT_RADIUS, SPACING } from '../../constants/ui';
import { childFriendlyStyles } from '../../styles/touchTargets';

interface CollapsibleSettingsSectionProps {
  title: string;
  children: React.ReactNode;
  initiallyExpanded?: boolean;
  highContrast?: boolean;
  largeText?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function CollapsibleSettingsSection({
  title,
  children,
  initiallyExpanded = false,
  highContrast = false,
  largeText = false,
  containerStyle,
  titleStyle,
  contentStyle,
}: CollapsibleSettingsSectionProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <View style={[styles.container, highContrast && styles.containerHC, containerStyle]}>
      <Pressable
        style={({ pressed }) => [
          childFriendlyStyles.minTouchTarget,
          styles.header,
          highContrast && styles.headerHC,
          pressed && (highContrast ? styles.headerPressedHC : styles.headerPressed),
        ]}
        onPress={() => setExpanded((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={`${title} ein- oder ausklappen`}
        accessibilityHint={expanded ? 'Abschnitt schließen' : 'Abschnitt öffnen'}
      >
        <Text
          style={[
            styles.title,
            largeText && styles.titleLarge,
            highContrast && styles.titleHC,
            titleStyle,
          ]}
        >
          {title}
        </Text>
        <Text
          style={[styles.chevron, largeText && styles.chevronLarge, highContrast && styles.chevronHC]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>
      {expanded && <View style={[styles.content, contentStyle]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: DEFAULT_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.lg,
    overflow: 'hidden',
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  headerHC: {
    backgroundColor: COLORS.highContrastBackground,
  },
  headerPressed: {
    backgroundColor: COLORS.pressed,
  },
  headerPressedHC: {
    backgroundColor: COLORS.highContrastPressed,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  titleLarge: {
    fontSize: 20,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  chevronLarge: {
    fontSize: 22,
  },
  chevronHC: {
    color: COLORS.highContrastText,
  },
  content: {
    padding: SPACING.md,
  },
});
