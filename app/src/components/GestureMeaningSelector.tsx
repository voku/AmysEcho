/**
 * Gesture Meaning Selector Component - Amy First
 *
 * Provides an accessible picker that lists every gesture meaning so
 * teachers can quickly choose which concept Amy should practice.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import {
  GESTURE_MEANINGS,
  GestureMeaningDefinition,
  GestureMeaningCategory,
} from '../constants/gestureMeanings';

const CATEGORY_LABELS: Record<GestureMeaningCategory, string> = {
  communication: 'Kommunikation',
  emotional: 'Emotional',
  playful: 'Spielerisch',
};

type CompositionFilter = 'all' | 'single' | 'coordinated' | 'sequence';

const COMPOSITION_LABELS: Record<CompositionFilter, string> = {
  all: 'Alle',
  single: 'Einzel',
  coordinated: 'Koordiniert',
  sequence: 'Sequenz',
};

interface GestureMeaningSelectorProps {
  onMeaningSelected: (meaning: GestureMeaningDefinition) => void;
  onCancel: () => void;
  selectedMeaningId?: string | null;
}

export function GestureMeaningSelector({
  onMeaningSelected,
  onCancel,
  selectedMeaningId = null,
}: GestureMeaningSelectorProps) {
  const { largeText, highContrast } = useAccessibility();
  const [categoryFilter, setCategoryFilter] = useState<GestureMeaningCategory | 'all'>('all');
  const [compositionFilter, setCompositionFilter] = useState<CompositionFilter>('all');

  const categories = useMemo(() => {
    const uniqueCategories = new Set<GestureMeaningCategory>();
    GESTURE_MEANINGS.forEach((meaning) => uniqueCategories.add(meaning.category));
    return Array.from(uniqueCategories);
  }, []);

  const filteredMeanings = useMemo(() => {
    return GESTURE_MEANINGS.filter((meaning) => {
      const matchesCategory = categoryFilter === 'all' || meaning.category === categoryFilter;
      const matchesComposition =
        compositionFilter === 'all' || meaning.composition === compositionFilter;
      return matchesCategory && matchesComposition;
    });
  }, [categoryFilter, compositionFilter]);

  const styles = useMemo(
    () => createStyles(largeText, highContrast),
    [largeText, highContrast],
  );

  const renderFilterButton = (
    label: string,
    active: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        active && styles.filterButtonActive,
        pressed && styles.filterButtonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Filter ${label}`}
    >
      <Text
        style={[
          styles.filterButtonText,
          active && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bedeutung auswählen</Text>
          <Text style={styles.subtitle}>
            Wähle aus Amys Bibliothek oder filtere nach Kategorie und Aufbau.
          </Text>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Kategorie</Text>
          <View style={styles.filterRow}>
            {renderFilterButton('Alle', categoryFilter === 'all', () => setCategoryFilter('all'))}
            {categories.map((category) =>
              renderFilterButton(
                CATEGORY_LABELS[category],
                categoryFilter === category,
                () => setCategoryFilter(category),
              ),
            )}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Aufbau</Text>
          <View style={styles.filterRow}>
            {(Object.keys(COMPOSITION_LABELS) as CompositionFilter[]).map((filterKey) =>
              renderFilterButton(
                COMPOSITION_LABELS[filterKey],
                compositionFilter === filterKey,
                () => setCompositionFilter(filterKey),
              ),
            )}
          </View>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {filteredMeanings.map((meaning) => (
            <View
              key={meaning.id}
              style={[
                styles.meaningCard,
                highContrast && styles.meaningCardHighContrast,
                selectedMeaningId === meaning.id && styles.meaningCardSelected,
              ]}
            >
              <View style={styles.meaningHeader}>
                <Text style={styles.meaningEmoji}>{meaning.emoji}</Text>
                <View style={styles.meaningHeaderText}>
                  <Text style={styles.meaningName}>{meaning.name}</Text>
                  <Text style={styles.meaningMeta}>
                    {CATEGORY_LABELS[meaning.category]} • {COMPOSITION_LABELS[meaning.composition]}
                  </Text>
                </View>
              </View>
              <Text style={styles.meaningDescription}>{meaning.description}</Text>

              {meaning.composition === 'coordinated' && (
                <Text style={styles.detailText}>
                  Linke Hand: {meaning.leftGesture} • Rechte Hand: {meaning.rightGesture}
                </Text>
              )}

              {meaning.composition === 'sequence' && (
                <Text style={styles.detailText}>
                  Schritte: {meaning.gestures.join(' → ')}
                </Text>
              )}

              <Text style={styles.examplesTitle}>Einsatzideen</Text>
              <View style={styles.examplesList}>
                {meaning.examples.map((example) => (
                  <Text key={example} style={styles.exampleItem}>
                    • {example}
                  </Text>
                ))}
              </View>

              <Pressable
                onPress={() => onMeaningSelected(meaning)}
                style={({ pressed }) => [
                  styles.selectButton,
                  pressed && styles.selectButtonPressed,
                  selectedMeaningId === meaning.id && styles.selectButtonActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${meaning.name} auswählen`}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    selectedMeaningId === meaning.id && styles.selectButtonTextActive,
                  ]}
                >
                  Auswählen
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Auswahl schließen"
        >
          <Text style={styles.cancelButtonText}>Abbrechen</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BASE_STYLES = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: DEFAULT_RADIUS * 2,
    padding: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  filterGroup: {
    marginBottom: SPACING.md,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  filterButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: DEFAULT_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.primaryAccent,
    backgroundColor: COLORS.surface,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primaryAccent,
  },
  filterButtonHighContrast: {
    borderColor: COLORS.highContrastText,
  },
  filterButtonPressed: {
    opacity: 0.7,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primaryAccent,
  },
  filterButtonTextActive: {
    color: COLORS.surface,
  },
  filterButtonTextHighContrast: {
    color: COLORS.highContrastText,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  meaningCard: {
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundEnd,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  meaningCardHighContrast: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.highContrastText,
  },
  meaningCardSelected: {
    borderColor: COLORS.primaryAccent,
    borderWidth: 2,
  },
  meaningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  meaningEmoji: {
    fontSize: 32,
    marginRight: SPACING.sm,
  },
  meaningHeaderText: {
    flex: 1,
  },
  meaningName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  meaningMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  meaningDescription: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  examplesTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  examplesList: {
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  exampleItem: {
    fontSize: 12,
    color: COLORS.text,
  },
  selectButton: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primaryAccent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: DEFAULT_RADIUS,
  },
  selectButtonActive: {
    backgroundColor: COLORS.secondaryAccent,
  },
  selectButtonPressed: {
    opacity: 0.9,
  },
  selectButtonText: {
    color: COLORS.surface,
    fontWeight: 'bold',
  },
  selectButtonTextActive: {
    color: COLORS.text,
  },
  cancelButton: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: DEFAULT_RADIUS,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonPressed: {
    opacity: 0.8,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

function createStyles(largeText: boolean, highContrast: boolean) {
  return StyleSheet.create({
    overlay: BASE_STYLES.overlay,
    container: {
      ...BASE_STYLES.container,
      padding: largeText ? SPACING.xl : SPACING.lg,
    },
    header: BASE_STYLES.header,
    title: {
      ...BASE_STYLES.title,
      fontSize: largeText ? 26 : 22,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    subtitle: {
      ...BASE_STYLES.subtitle,
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    filterGroup: BASE_STYLES.filterGroup,
    filterLabel: {
      ...BASE_STYLES.filterLabel,
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    filterRow: BASE_STYLES.filterRow,
    list: BASE_STYLES.list,
    listContent: BASE_STYLES.listContent,
    filterButton: {
      ...BASE_STYLES.filterButton,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
    },
    filterButtonActive: {
      ...BASE_STYLES.filterButtonActive,
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    filterButtonPressed: BASE_STYLES.filterButtonPressed,
    filterButtonText: {
      ...BASE_STYLES.filterButtonText,
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      fontSize: largeText ? 14 : 12,
    },
    filterButtonTextActive: {
      ...BASE_STYLES.filterButtonTextActive,
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    meaningCard: {
      ...BASE_STYLES.meaningCard,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    meaningCardHighContrast: BASE_STYLES.meaningCardHighContrast,
    meaningCardSelected: BASE_STYLES.meaningCardSelected,
    meaningHeader: BASE_STYLES.meaningHeader,
    meaningEmoji: {
      ...BASE_STYLES.meaningEmoji,
      fontSize: largeText ? 36 : 32,
    },
    meaningHeaderText: BASE_STYLES.meaningHeaderText,
    meaningName: {
      ...BASE_STYLES.meaningName,
      fontSize: largeText ? 20 : 18,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    meaningMeta: {
      ...BASE_STYLES.meaningMeta,
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    meaningDescription: {
      ...BASE_STYLES.meaningDescription,
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    detailText: {
      ...BASE_STYLES.detailText,
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    examplesTitle: {
      ...BASE_STYLES.examplesTitle,
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    examplesList: BASE_STYLES.examplesList,
    exampleItem: {
      ...BASE_STYLES.exampleItem,
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    selectButton: {
      ...BASE_STYLES.selectButton,
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    selectButtonActive: {
      ...BASE_STYLES.selectButtonActive,
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.secondaryAccent,
    },
    selectButtonPressed: BASE_STYLES.selectButtonPressed,
    selectButtonText: {
      ...BASE_STYLES.selectButtonText,
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    selectButtonTextActive: {
      ...BASE_STYLES.selectButtonTextActive,
      color: highContrast ? COLORS.highContrastBackground : COLORS.text,
    },
    cancelButton: {
      ...BASE_STYLES.cancelButton,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    cancelButtonPressed: BASE_STYLES.cancelButtonPressed,
    cancelButtonText: {
      ...BASE_STYLES.cancelButtonText,
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });
}

export default GestureMeaningSelector;
