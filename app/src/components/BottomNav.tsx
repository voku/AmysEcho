import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

interface Props {
  active: 'recognition' | 'symbols' | 'training';
}

export default function BottomNav({ active }: Props) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.container}>
      <Pressable onPress={() => navigation.navigate('Recognition')} style={styles.item} accessibilityLabel="Erkennen">
        <Text style={[styles.label, active === 'recognition' && styles.active]}>Listen</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Learning')} style={styles.item} accessibilityLabel="Symbole">
        <Text style={[styles.label, active === 'symbols' && styles.active]}>Symbols</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Teaching')} style={styles.item} accessibilityLabel="Lernen">
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

