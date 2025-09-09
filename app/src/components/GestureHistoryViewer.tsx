/**
 * Gesture History Viewer Component - Amy First
 *
 * Displays recent gesture history with filtering and search capabilities
 */

import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, TextInput } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';

interface GestureHistoryItem {
  id: string;
  label: string;
  confidence: number;
  timestamp: number;
  emoji?: string;
}

interface GestureHistoryViewerProps {
  gestureHistory: GestureHistoryItem[];
  onClose: () => void;
  onGestureSelect: (gesture: GestureHistoryItem) => void;
}

export default function GestureHistoryViewer({
  gestureHistory,
  onClose,
  onGestureSelect
}: GestureHistoryViewerProps) {
  const { largeText, highContrast } = useAccessibility();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'confidence' | 'frequency'>('recent');

  // Filter and sort history
  const filteredHistory = gestureHistory
    .filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.confidence - a.confidence;
        case 'frequency':
          // Simple frequency sort (could be enhanced with actual frequency data)
          return b.timestamp - a.timestamp;
        case 'recent':
        default:
          return b.timestamp - a.timestamp;
      }
    });

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Gerade eben';
    if (minutes < 60) return `Vor ${minutes}min`;
    if (hours < 24) return `Vor ${hours}h`;
    return `Vor ${days}d`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return COLORS.success;
    if (confidence >= 0.6) return COLORS.primaryAccent;
    return COLORS.warning;
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: RADIUS,
      padding: SPACING.lg,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      minWidth: 320,
      maxWidth: 400,
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    closeButton: {
      padding: SPACING.xs,
    },
    closeText: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    searchContainer: {
      marginBottom: SPACING.md,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      borderRadius: RADIUS,
      padding: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 16 : 14,
    },
    sortContainer: {
      flexDirection: 'row',
      marginBottom: SPACING.md,
    },
    sortButton: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS,
      marginRight: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    sortButtonActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    sortButtonText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    sortButtonTextActive: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.highContrastText,
    },
    historyItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.sm,
      marginBottom: SPACING.xs,
      backgroundColor: highContrast ? COLORS.surface : 'rgba(0, 0, 0, 0.05)',
      borderRadius: RADIUS,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    gestureEmoji: {
      fontSize: largeText ? 24 : 20,
      marginRight: SPACING.sm,
    },
    gestureInfo: {
      flex: 1,
    },
    gestureLabel: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    gestureTimestamp: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    confidenceBadge: {
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: RADIUS,
      minWidth: 50,
      alignItems: 'center',
    },
    confidenceText: {
      fontSize: largeText ? 12 : 10,
      fontWeight: 'bold',
      color: COLORS.highContrastText,
    },
    emptyState: {
      textAlign: 'center',
      padding: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      fontSize: largeText ? 16 : 14,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gestenverlauf</Text>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Suche nach Gesten..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          accessibilityLabel="Gesten durchsuchen"
        />
      </View>

      <View style={styles.sortContainer}>
        {[
          { key: 'recent', label: 'Kürzlich' },
          { key: 'confidence', label: 'Sicherheit' },
          { key: 'frequency', label: 'Häufigkeit' },
        ].map(({ key, label }) => (
          <Pressable
            key={key}
            style={[
              styles.sortButton,
              sortBy === key && styles.sortButtonActive,
            ]}
            onPress={() => setSortBy(key as any)}
            accessibilityRole="button"
            accessibilityLabel={`Nach ${label} sortieren`}
          >
            <Text style={[
              sortBy === key ? styles.sortButtonTextActive : styles.sortButtonText,
            ]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredHistory}
        keyExtractor={(item) => `${item.id}-${item.timestamp}`}
        renderItem={({ item }) => (
          <Pressable
            style={styles.historyItem}
            onPress={() => {
              void childHaptic();
              onGestureSelect(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Geste ${item.label} üben`}
          >
            <Text style={styles.gestureEmoji}>{item.emoji || '✋'}</Text>
            <View style={styles.gestureInfo}>
              <Text style={styles.gestureLabel}>{item.label}</Text>
              <Text style={styles.gestureTimestamp}>
                {formatTimestamp(item.timestamp)}
              </Text>
            </View>
            <View
              style={[
                styles.confidenceBadge,
                { backgroundColor: getConfidenceColor(item.confidence) }
              ]}
            >
              <Text style={styles.confidenceText}>
                {Math.round(item.confidence * 100)}%
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyState}>
            {searchQuery ? 'Keine Gesten gefunden' : 'Noch keine Gesten aufgezeichnet'}
          </Text>
        }
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 300 }}
      />
    </View>
  );
}