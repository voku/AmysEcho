import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gestureModel } from '../model';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import Colors from '../constants/colors';
import ActionButton from '../components/ActionButton';
import type { TabNavigationProp } from '../navigation/types';

type LernenScreenProps = {
  navigation: TabNavigationProp<'Lernen'>;
};

type GestureListItem = {
  id: string;
  label: string;
  emoji?: string;
};

const LernenScreen: React.FC<LernenScreenProps> = ({ navigation }) => {
  const gestures: GestureListItem[] = Array.isArray(gestureModel.gestures)
    ? gestureModel.gestures
    : [];

  const handleTrain = useCallback(
    (gestureId: string, label: string) => {
      navigation.navigate('Recording', { gestureId, gestureLabel: label || gestureId });
    },
    [navigation],
  );

  const renderItem = ({ item }: { item: GestureListItem }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardEmoji}>{item.emoji ?? '🤲'}</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardSubtitle}>Empfohlen: 5 Beispiele · ca. 1 Minute</Text>
        </View>
      </View>
      <ActionButton
        label="Jetzt aufnehmen"
        accessibilityLabel={`Gestentraining für ${item.label} starten`}
        onPress={() => handleTrain(item.id, item.label)}
        variant="secondary"
        style={styles.cardAction}
      />
    </View>
  );

  return (
    <LinearGradient colors={[Colors.backgroundStart, Colors.backgroundEnd]} style={styles.container}>
      <Text style={styles.title}>Lernen &amp; Trainieren</Text>
      <Text style={styles.subtitle}>
        Ergänze Amy&apos;s Wörterbuch mit neuen Beispielen oder frische bekannte Gesten auf.
      </Text>
      <FlatList
        data={gestures}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyText}>
              Noch keine Gesten vorhanden. Lege zuerst im Pflegebereich neue Zeichen an.
            </Text>
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
  title: {
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
    padding: spacing.xl,
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
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: spacing.lg,
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
