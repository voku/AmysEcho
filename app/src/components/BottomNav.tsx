import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Hand, BookOpen, Settings } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING } from '../constants/ui';

interface Props {
  active: 'recognition' | 'training' | 'parent';
  profileId: string;
}

export default function BottomNav({ active, profileId }: Props) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => navigation.navigate('Recognition', { profileId })}
        style={styles.item}
        accessibilityLabel="Listen"
      >
        <Hand
          size={24}
          color={active === 'recognition' ? COLORS.primaryAccent : COLORS.secondaryAccent}
          style={styles.icon}
        />
        <Text style={[styles.label, active === 'recognition' && styles.active]}>Listen</Text>
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('Training', { gestureLabel: undefined })}
        style={styles.item}
        accessibilityLabel="Learn"
      >
        <BookOpen
          size={24}
          color={active === 'training' ? COLORS.primaryAccent : COLORS.secondaryAccent}
          style={styles.icon}
        />
        <Text style={[styles.label, active === 'training' && styles.active]}>Learn</Text>
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('ProfileSelect')}
        style={styles.item}
        accessibilityLabel="Menu"
      >
        <Settings
          size={24}
          color={active === 'parent' ? COLORS.primaryAccent : COLORS.secondaryAccent}
          style={styles.icon}
        />
        <Text style={[styles.label, active === 'parent' && styles.active]}>Menu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  item: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: 12,
    color: COLORS.secondaryAccent,
  },
  active: {
    color: COLORS.primaryAccent,
    fontWeight: 'bold',
  },
});

