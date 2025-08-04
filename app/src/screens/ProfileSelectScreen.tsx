import React from 'react';
import { View, Button, StyleSheet, Text } from 'react-native';
import { SPACING } from '../constants/ui';

export default function ProfileSelectScreen({ navigation }: any) {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: { fontSize: 24, marginBottom: SPACING.lg },
    row: { flexDirection: 'row', gap: SPACING.lg },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Profile</Text>
      <View style={styles.row}>
        <Button
          title="Parent"
          onPress={() => navigation.navigate('ParentalGate', { target: 'Parent' })}
          accessibilityLabel="Elternprofil"
        />
        <Button
          title="Admin"
          onPress={() => navigation.navigate('ParentalGate', { target: 'Admin' })}
          accessibilityLabel="Adminbereich"
        />
        <Button
          title="Manage Profiles"
          onPress={() => navigation.navigate('ProfileManager')}
          accessibilityLabel="Profile verwalten"
        />
      </View>
    </View>
  );
}
