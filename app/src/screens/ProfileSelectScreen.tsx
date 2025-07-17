import React from 'react';
import { View, Button, StyleSheet, Text } from 'react-native';

export default function ProfileSelectScreen({ navigation }: any) {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: { fontSize: 24, marginBottom: 20 },
    row: { flexDirection: 'row', gap: 20 },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Profile</Text>
      <View style={styles.row}>
        <Button title="Parent" onPress={() => navigation.navigate('Parent')} />
        <Button title="Admin" onPress={() => navigation.navigate('Admin')} />
        <Button title="Neues Profil" onPress={() => navigation.navigate('Onboarding')} />
      </View>
    </View>
  );
}
