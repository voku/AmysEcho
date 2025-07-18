import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function ParentScreen({ navigation }: any) {
  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, marginBottom: 20 },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Parent Screen</Text>
      <Button
        title="Learning"
        onPress={() => navigation.navigate('Learning')}
        accessibilityLabel="Zum Lernmodus"
      />
      <Button
        title="Recognition"
        onPress={() => navigation.navigate('Recognition')}
        accessibilityLabel="Zum Erkennungsmodus"
      />
      <Button title="Back" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
    </View>
  );
}
