import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NavigationProp } from '@react-navigation/native';
import { gestureModel } from '../model';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import Colors from '../constants/colors';
import ActionButton from '../components/ActionButton';
import type { RootStackParamList } from '../navigation/types';

type LernenScreenProps = {
  navigation: NavigationProp<RootStackParamList, 'Lernen'>;
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
    <View style={styles.card} accessible>
      <View style={styles.cardInfo}>
        <Text style={styles.cardEmoji}>{item.emoji ?? '🤲'}</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardSubtitle}>5 Beispiele • ca. 1 Minute</Text>
        </View>
      </View>
      <ActionButton
        label="Trainieren"
        accessibilityLabel={`Gestentraining für ${item.label} starten`}
        onPress={() => handleTrain(item.id, item.label)}
        variant="primary"
        style={styles.cardAction}
      />
    </View>
  );

  return (
    <LinearGradient colors={['#EFF6FF', '#F3F4F6']} style={styles.container}>
      <Text style={styles.title}>Lernen</Text>
      <Text style={styles.subtitle}>
        Wähle eine Geste, um neue Beispiele aufzunehmen oder erneut zu üben.
      </Text>
      <FlatList
        data={gestures}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardEmoji: {
    fontSize: 36,
    marginRight: spacing.lg,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
    color: Colors.text,
  },
  cardSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.caption,
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
  },
});

export default LernenScreen;
