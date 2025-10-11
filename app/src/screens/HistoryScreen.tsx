
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { gestureHistoryService, type GestureHistoryEntry } from '../services/gestureHistoryService';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';

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

const getConfidenceColor = (confidence: number) => {
  if (confidence >= CONFIDENCE_THRESHOLD_STRONG) return Colors.historyBadgeHigh;
  if (confidence >= CONFIDENCE_THRESHOLD_MEDIUM) return Colors.historyBadgeMedium;
  return Colors.historyBadgeLow;
};

const HistoryScreen: React.FC = () => {
  const [history, setHistory] = useState<GestureHistoryEntry[]>([]);

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

  const renderItem = ({ item }: { item: GestureHistoryEntry }) => {
    const confidencePercent = Math.round((item.confidence ?? 0) * 100);
    const badgeColor = getConfidenceColor(item.confidence ?? 0);
    return (
      <View style={styles.card} accessible accessibilityRole="text">
        <View style={styles.emojiBubble}>
          <Text style={styles.emoji}>{item.emoji || '✋'}</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardTimestamp}>{formatTimestamp(item.timestamp)}</Text>
        </View>
        <View style={[styles.confidenceBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.confidenceText}>{`${confidencePercent}%`}</Text>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#EFF6FF', '#F3F4F6']} style={styles.container}>
      <Text style={styles.screenTitle}>Verlauf</Text>
      <Text style={styles.subtitle}>Letzte Gesten von Amy auf einen Blick.</Text>
      <FlatList
        data={historyItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    color: Colors.text,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.body,
    color: Colors.textSecondary,
    marginBottom: spacing.xl,
  },
  listContent: {
    paddingBottom: spacing['2xl'],
  },
  separator: {
    height: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  emojiBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  emoji: {
    fontSize: typography.sizes.title,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
    color: Colors.text,
  },
  cardTimestamp: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.caption,
    color: Colors.textSecondary,
  },
  confidenceBadge: {
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confidenceText: {
    color: Colors.inverseText,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold as any,
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
    color: Colors.textSecondary,
  },
});

export default HistoryScreen;
