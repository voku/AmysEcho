import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Theme, THEMES } from '../constants/themes';
import { SPACING } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface ThemeOptionProps {
  theme: Theme;
  isSelected: boolean;
  onSelect: () => void;
}

function ThemeOption({ theme, isSelected, onSelect }: ThemeOptionProps) {
  const { highContrast } = useAccessibility();

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.themeOption,
        isSelected && styles.themeOptionSelected,
        pressed && styles.themeOptionPressed,
        highContrast && styles.themeOptionHC,
      ]}
      accessibilityLabel={`${theme.displayName} Thema auswählen`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <View style={[styles.themePreview, { backgroundColor: theme.colors.gradientStart }]}>
        <View style={[styles.themeAccent, { backgroundColor: theme.colors.themeAccent }]} />
        <View style={[styles.themeSecondary, { backgroundColor: theme.colors.themeSecondary }]} />
      </View>
      <Text style={[
        styles.themeName,
        isSelected && styles.themeNameSelected,
        highContrast && styles.themeNameHC,
      ]}>
        {theme.assets?.logo} {theme.displayName}
      </Text>
      {isSelected && (
        <Text style={[styles.selectedIndicator, highContrast && styles.selectedIndicatorHC]}>
          ✓
        </Text>
      )}
    </Pressable>
  );
}

export default function ThemeSelector() {
  const { theme: currentTheme, themeName, setTheme, availableThemes } = useTheme();
  const { largeText, highContrast } = useAccessibility();

  const handleThemeSelect = async (themeName: keyof typeof THEMES) => {
    await setTheme(themeName);
  };

  return (
    <View style={styles.container}>
      <Text style={[
        styles.title,
        largeText && styles.titleLarge,
        highContrast && styles.titleHC,
      ]}>
        🎨 Thema wählen
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.themesContainer}
      >
        {Object.entries(availableThemes).map(([key, theme]) => (
          <ThemeOption
            key={key}
            theme={theme}
            isSelected={themeName === key}
            onSelect={() => handleThemeSelect(key as keyof typeof THEMES)}
          />
        ))}
      </ScrollView>

      <Text style={[
        styles.description,
        largeText && styles.descriptionLarge,
        highContrast && styles.descriptionHC,
      ]}>
        Wähle ein Thema, das Amy gefällt! Jedes Thema hat seine eigenen Farben und Muster.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  titleLarge: {
    fontSize: 22,
  },
  titleHC: {
    color: '#FFFFFF',
  },
  themesContainer: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  themeOption: {
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  themeOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  themeOptionPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  themeOptionHC: {
    borderColor: '#FFFFFF',
    backgroundColor: '#000000',
  },
  themePreview: {
    width: 60,
    height: 40,
    borderRadius: 8,
    marginBottom: SPACING.xs,
    position: 'relative',
    overflow: 'hidden',
  },
  themeAccent: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  themeSecondary: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 16,
    height: 8,
    borderRadius: 4,
  },
  themeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  themeNameSelected: {
    color: '#1E40AF',
    fontWeight: 'bold',
  },
  themeNameHC: {
    color: '#FFFFFF',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 16,
    color: '#10B981',
    fontWeight: 'bold',
  },
  selectedIndicatorHC: {
    color: '#FFFFFF',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  descriptionLarge: {
    fontSize: 16,
  },
  descriptionHC: {
    color: '#FFFFFF',
  },
});