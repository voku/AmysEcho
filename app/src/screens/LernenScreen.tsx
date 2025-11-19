import React, { useCallback } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { StackScreenProps } from '@react-navigation/stack';
import { gestureModel } from '../model';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import Colors from '../constants/colors';
import ActionButton from '../components/ActionButton';
import type { LernenStackParamList } from '../navigation/types';
import { APP_TAB_ROUTES, LERNEN_STACK_ROUTES } from '../navigation/types';
import WorkflowSupportLinks from '../components/WorkflowSupportLinks';
import WorkflowStageHeader from '../components/WorkflowStageHeader';

type LernenScreenProps = StackScreenProps<
  LernenStackParamList,
  typeof LERNEN_STACK_ROUTES.LernenHome
>;

type GestureListItem = {
  id: string;
  label: string;
  emoji?: string;
};

const COMPACT_CARD_BREAKPOINT = 640;

const LernenScreen: React.FC<LernenScreenProps> = ({ navigation }) => {
  const gestures: GestureListItem[] = Array.isArray(gestureModel.gestures)
    ? gestureModel.gestures
    : [];

  const dimensions = useWindowDimensions();
  const fallbackWindow = Dimensions.get('window');
  const fallbackWidth =
    typeof fallbackWindow?.width === 'number' && fallbackWindow.width > 0
      ? fallbackWindow.width
      : COMPACT_CARD_BREAKPOINT + 1;
  const windowWidth =
    Number.isFinite(dimensions.width) && dimensions.width > 0
      ? dimensions.width
      : fallbackWidth;

  const isCompactLayout = windowWidth < COMPACT_CARD_BREAKPOINT;

  const handleTrain = useCallback(
    (gestureId: string, label: string) => {
      navigation.navigate(LERNEN_STACK_ROUTES.Recording, {
        gestureId,
        gestureLabel: label || gestureId,
      });
    },
    [navigation],
  );

  const handleAddCustomGesture = useCallback(() => {
    navigation.navigate(LERNEN_STACK_ROUTES.Recording, {});
  }, [navigation]);

  const renderItem = ({ item }: { item: GestureListItem }) => (
    <View style={[styles.card, isCompactLayout && styles.cardCompact]}>
      <View style={[styles.cardInfo, isCompactLayout && styles.cardInfoCompact]}>
        <Text style={[styles.cardEmoji, isCompactLayout && styles.cardEmojiCompact]}>{item.emoji ?? '🤲'}</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardSubtitle}>Empfohlen: 5 Beispiele · ca. 1 Minute</Text>
        </View>
      </View>
      <ActionButton
        label={`„${item.label}“ aufnehmen`}
        accessibilityLabel={`Gestentraining für ${item.label} starten`}
        onPress={() => handleTrain(item.id, item.label)}
        variant="secondary"
        style={[styles.cardAction, isCompactLayout && styles.cardActionCompact]}
      />
    </View>
  );

  return (
    <LinearGradient colors={[Colors.backgroundStart, Colors.backgroundEnd]} style={styles.container}>
      <WorkflowStageHeader route={APP_TAB_ROUTES.Lernen} tone="dark" style={styles.stageHeader} />
      <FlatList
        data={gestures}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={[styles.heroCard, isCompactLayout && styles.heroCardCompact]}>
            <View style={styles.heroText}>
              <Text style={styles.heroEyebrow}>Training</Text>
              <Text style={styles.heroTitle}>Neue Geste hinzufügen</Text>
              <Text style={styles.heroSubtitle}>
                Nimm eine individuelle Geste als Video auf und trainiere sie direkt mit deinem Kind.
              </Text>
            </View>
            <ActionButton
              label="Gestentraining starten"
              accessibilityLabel="Neues Gestentraining beginnen"
              onPress={handleAddCustomGesture}
              style={[styles.heroAction, isCompactLayout && styles.heroActionCompact]}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyText}>
              Noch keine Gesten vorhanden. Tippe oben auf „Neue Geste hinzufügen“, um sofort loszulegen.
            </Text>
          </View>
        }
        ListFooterComponent={<WorkflowSupportLinks style={styles.supportLinks} />}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  stageHeader: {
    marginBottom: spacing['2xl'],
  },
  listContent: {
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  supportLinks: {
    marginTop: spacing.xl,
  },
  heroCard: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    borderRadius: 28,
    backgroundColor: Colors.overlaySurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  heroCardCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  heroText: {
    flex: 1,
    marginRight: spacing.xl,
    gap: spacing.sm,
  },
  heroEyebrow: {
    fontSize: typography.sizes.caption,
    textTransform: 'uppercase',
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: Colors.neutral,
  },
  heroSubtitle: {
    fontSize: typography.sizes.body,
    color: Colors.overlayText,
  },
  heroAction: {
    minWidth: 200,
  },
  heroActionCompact: {
    alignSelf: 'stretch',
    width: '100%',
  },
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 24,
    backgroundColor: Colors.overlayBadgeBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    borderWidth: 1,
    borderColor: Colors.overlaySurface,
  },
  cardCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    rowGap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardInfoCompact: {
    width: '100%',
    gap: spacing.md,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: spacing.lg,
  },
  cardEmojiCompact: {
    marginRight: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
    color: Colors.neutral,
  },
  cardSubtitle: {
    fontSize: typography.sizes.caption,
    color: Colors.textMuted,
  },
  cardAction: {
    minWidth: 140,
    marginLeft: spacing.lg,
  },
  cardActionCompact: {
    alignSelf: 'stretch',
    width: '100%',
    marginLeft: 0,
    paddingHorizontal: spacing.md,
  },
  emptyState: {
    marginTop: spacing['2xl'],
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyEmoji: {
    fontSize: typography.sizes.title,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.sizes.body,
    textAlign: 'center',
    color: Colors.overlayText,
  },
});

export default LernenScreen;
