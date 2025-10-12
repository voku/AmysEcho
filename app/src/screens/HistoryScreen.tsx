
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { gestureHistoryService, type GestureHistoryEntry } from '../services/gestureHistoryService';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import type { TabNavigationProp } from '../navigation/types';

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
      label: 'Sehr sicher',
      detail: `${percent}% Vertrauen`,
    };
  }

  if (confidence >= CONFIDENCE_THRESHOLD_MEDIUM) {
    return {
      color: Colors.historyBadgeMedium,
      label: 'Noch unsicher',
      detail: `${percent}% Vertrauen`,
    };
  }

  return {
    color: Colors.historyBadgeLow,
    label: 'Bitte prüfen',
    detail: `${percent}% Vertrauen`,
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

  const handleQuickLearn = useCallback(
    (entry: GestureHistoryEntry) => {
      navigation.navigate('Lernen', {
        gestureId: entry.id,
        gestureLabel: entry.label,
      });
    },
    [navigation],
  );

  const renderItem = ({ item }: { item: GestureHistoryEntry }) => {
    const meta = getConfidenceMeta(item.confidence ?? 0);
    const timestamp = formatTimestamp(item.timestamp);
    const category = item.category?.toUpperCase() ?? 'GESTE';
    return (
      <View style={styles.card} accessible accessibilityRole="summary">
        <View style={styles.cardHeader}>
          <View style={styles.emojiBubble}>
            <Text style={styles.emoji}>{item.emoji || '✋'}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{item.label}</Text>
            <Text style={styles.cardTimestamp}>{timestamp}</Text>
          </View>
          <View style={[styles.confidenceBadge, { backgroundColor: meta.color }]}
            accessibilityLabel={`Vertrauen: ${meta.detail}`}
          >
            <Text style={styles.confidenceLabel}>{meta.label}</Text>
            <Text style={styles.confidenceDetail}>{meta.detail}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardCategory}>{category}</Text>
          <Pressable
            onPress={() => handleQuickLearn(item)}
            accessibilityRole="button"
            accessibilityLabel={`Gestentraining für ${item.label} öffnen`}
            style={styles.quickLearnButton}
          >
            <Text style={styles.quickLearnText}>Jetzt üben</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={[Colors.backgroundStart, Colors.backgroundEnd]} style={styles.container}>
      <Text style={styles.screenTitle}>Verstehen</Text>
      <Text style={styles.subtitle}>Hier siehst du, wie sicher Amy deine Gesten verstanden hat.</Text>
      <FlatList
        data={historyItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>Noch keine Einträge. Sobald Amy gestikuliert, siehst du es hier.</Text>
          </View>
        }
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
  screenTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.extrabold as any,
    color: Colors.inverseText,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.body,
    color: Colors.overlayText,
    marginBottom: spacing['2xl'],
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
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
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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
  },
  cardCategory: {
    fontSize: typography.sizes.caption,
    letterSpacing: 1.1,
    color: Colors.textMuted,
  },
  quickLearnButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 82, 87, 0.16)',
  },
  quickLearnText: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold as any,
    color: Colors.actionSecondaryBackground,
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
