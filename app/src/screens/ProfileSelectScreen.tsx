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
        <Button
          title="Parent"
          onPress={() => navigation.navigate('Parent')}
          accessibilityLabel="Elternprofil"
        />
        <Button
          title="Admin"
          onPress={() => navigation.navigate('Admin')}
          accessibilityLabel="Adminbereich"
        />
        <Button
          title="Neues Profil"
          onPress={() => navigation.navigate('Onboarding')}
          accessibilityLabel="Neues Profil anlegen"
        />
      </View>
    </View>
  );
}
