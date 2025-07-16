import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function AdminScreen({ navigation }: any) {
  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, marginBottom: 20 },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Panel</Text>
      <Button title="Back" onPress={() => navigation.goBack()} />
    </View>
  );
}
