
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { gestureHistoryService, type GestureHistoryEntry } from '../services/gestureHistoryService';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import type { TabNavigationProp } from '../navigation/types';
import WorkflowSupportLinks from '../components/WorkflowSupportLinks';
import WorkflowStageHeader from '../components/WorkflowStageHeader';
import ActionButton from '../components/ActionButton';

const CONFIDENCE_THRESHOLD_STRONG = 0.75;
const CONFIDENCE_THRESHOLD_MEDIUM = 0.5;

const formatTimestamp = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const getConfidenceMeta = (confidence: number) => {
  const percent = Math.round(confidence * 100);

  if (confidence >= CONFIDENCE_THRESHOLD_STRONG) {
    return {
      color: Colors.historyBadgeHigh,
      label: 'Selbstentdeckung bestätigt',
      detail: `${percent}% Vertrauen`,
      narrative:
        'Amy hat diesen Moment als Stimme gespeichert – ihr könnt ihn sofort noch einmal erleben.',
    };
  }

  if (confidence >= CONFIDENCE_THRESHOLD_MEDIUM) {
    return {
      color: Colors.historyBadgeMedium,
      label: 'Noch unsicher',
      detail: `${percent}% Vertrauen`,
      narrative:
        'Dieser Eintrag braucht vielleicht noch eine Bestätigung oder Übung, bevor er sicher sitzt.',
    };
  }

  return {
    color: Colors.historyBadgeLow,
    label: 'Bitte prüfen',
    detail: `${percent}% Vertrauen`,
    narrative:
      'Amy war sich hier nicht sicher – überprüfe die Geste oder nimm neue Beispiele in Lernen auf.',
  };
};

const HistoryScreen: React.FC = () => {
  const [history, setHistory] = useState<GestureHistoryEntry[]>([]);
  const navigation = useNavigation<TabNavigationProp<'History'>>();

  const loadHistory = useCallback(() => {
    setHistory(gestureHistoryService.getRecentHistory());
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  const historyItems = useMemo(() => history, [history]);
  const latestDiscovery = useMemo(
    () => history.find((entry) => (entry.confidence ?? 0) >= CONFIDENCE_THRESHOLD_STRONG),
    [history],
  );

  const handleQuickLearn = useCallback(
    (entry: GestureHistoryEntry) => {
      navigation.navigate('Lernen', {
        gestureId: entry.id,
        gestureLabel: entry.label,
      });
    },
    [navigation],
  );

  const navigateToCamera = useCallback(() => {
    navigation.navigate('Recognition');
  }, [navigation]);

  const renderItem = ({ item }: { item: GestureHistoryEntry }) => {
    const meta = getConfidenceMeta(item.confidence ?? 0);
    const timestamp = formatTimestamp(item.timestamp);
    const category = item.category?.toUpperCase() ?? 'GESTE';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.emojiBubble}>
            <Text style={styles.emoji}>{item.emoji || '✋'}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{item.label}</Text>
            <Text style={styles.cardTimestamp}>{timestamp}</Text>
          </View>
          <View
            style={[styles.confidenceBadge, { backgroundColor: meta.color }]}
            accessibilityLabel={`Vertrauen: ${meta.detail}`}
          >
            <Text style={styles.confidenceLabel}>{meta.label}</Text>
            <Text style={styles.confidenceDetail}>{meta.detail}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.cardFooterText}>
            <Text style={styles.cardCategory}>{category}</Text>
            <Text style={styles.cardNarrative}>{meta.narrative}</Text>
          </View>
          <ActionButton
            label="Jetzt üben"
            accessibilityLabel={`Gestentraining für ${item.label} öffnen`}
            onPress={() => handleQuickLearn(item)}
            variant="secondary"
            style={styles.quickLearnButton}
            testID={`history-quick-learn-${item.id}`}
          />
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={[Colors.backgroundStart, Colors.backgroundEnd]} style={styles.container}>
      <WorkflowStageHeader route="History" tone="dark" style={styles.stageHeader} />
      {latestDiscovery ? (
        <View style={styles.highlightWrapper}>
          <View style={styles.highlightCard} accessibilityRole="summary">
            <View style={styles.highlightBadge}>
              <Text style={styles.highlightBadgeText}>Selbstentdeckung gesichert</Text>
            </View>
            <Text style={styles.highlightTitle}>{latestDiscovery.label}</Text>
            <Text style={styles.highlightSubtitle}>
              Amy hat diese Geste gerade als Stimme gespiegelt. Möchtest du den Moment wiederholen oder direkt weiterlernen?
            </Text>
            <View style={styles.highlightActions}>
              <ActionButton
                label="Zur Kamera"
                accessibilityLabel="Zur Kamera zurückkehren"
                onPress={navigateToCamera}
                backgroundColor={Colors.cameraActionConfirmBackground}
                pressedBackgroundColor={Colors.cameraActionConfirmPressed}
                textColor={Colors.cameraActionConfirmText}
                style={styles.highlightPrimaryAction}
                testID="history-highlight-camera"
              />
              <ActionButton
                label="Im Lernmodus vertiefen"
                accessibilityLabel={`Gestentraining für ${latestDiscovery.label} öffnen`}
                onPress={() => handleQuickLearn(latestDiscovery)}
                variant="secondary"
                style={styles.highlightSecondaryAction}
                testID="history-highlight-learn"
              />
            </View>
          </View>
        </View>
      ) : null}
      <FlatList
        data={historyItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>
              Noch keine Selbstentdeckungen. Sobald Amy eine Geste zeigt, landet ihr Moment hier im Verlauf.
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
  },
  stageHeader: {
    marginBottom: spacing['2xl'],
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  supportLinks: {
    marginTop: spacing['2xl'],
  },
  highlightWrapper: {
    marginBottom: spacing['2xl'],
  },
  highlightCard: {
    backgroundColor: Colors.historyHighlightBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.historyHighlightBorder,
    padding: spacing['2xl'],
    gap: spacing.md,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  highlightBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    backgroundColor: Colors.historyHighlightBadge,
  },
  highlightBadgeText: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold as any,
    color: Colors.historyHighlightText,
    letterSpacing: 0.6,
  },
  highlightTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.extrabold as any,
    color: Colors.historyHighlightText,
  },
  highlightSubtitle: {
    fontSize: typography.sizes.body,
    color: Colors.historyHighlightMuted,
    lineHeight: typography.lineHeights.relaxed,
  },
  highlightActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  highlightPrimaryAction: {
    minWidth: 160,
  },
  highlightSecondaryAction: {
    minWidth: 200,
  },
  card: {
    backgroundColor: Colors.overlayBadgeBackground,
    borderRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
    borderWidth: 1,
    borderColor: Colors.overlayBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.overlaySurfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  emoji: {
    fontSize: typography.sizes.title,
  },
  cardContent: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
    color: Colors.neutral,
  },
  cardTimestamp: {
    fontSize: typography.sizes.caption,
    color: Colors.textMuted,
  },
  confidenceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'flex-start',
    minWidth: 120,
    gap: 4,
  },
  confidenceLabel: {
    color: Colors.inverseText,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold as any,
  },
  confidenceDetail: {
    color: Colors.inverseText,
    fontSize: typography.sizes.micro,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
  },
  cardFooterText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardCategory: {
    fontSize: typography.sizes.caption,
    letterSpacing: 1.1,
    color: Colors.textMuted,
  },
  cardNarrative: {
    fontSize: typography.sizes.body,
    color: Colors.overlayText,
    lineHeight: typography.lineHeights.relaxed,
  },
  quickLearnButton: {
    minWidth: 160,
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

export default HistoryScreen;
