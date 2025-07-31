import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

interface Props {
  active: 'recognition' | 'symbols' | 'training';
  profileId: string;
}

export default function BottomNav({ active, profileId }: Props) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <View style={styles.container}>
      <Pressable onPress={() => navigation.navigate('Recognition')} style={styles.item} accessibilityLabel="Listen">
        <Text style={[styles.label, active === 'recognition' && styles.active]}>Listen</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Learning', { profileId })} style={styles.item} accessibilityLabel="Symbols">
        <Text style={[styles.label, active === 'symbols' && styles.active]}>Symbols</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Training', { profileId })} style={styles.item} accessibilityLabel="Learn">
        <Text style={[styles.label, active === 'training' && styles.active]}>Learn</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
  },
  item: {
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
  },
  active: {
    color: '#3b82f6',
    fontWeight: 'bold',
  },
});

