import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function TrainingScreen({ navigation }: any) {
  const handleDone = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Training Mode</Text>
      {/* TODO: capture gesture samples */}
      <Button title="Finish" onPress={handleDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, marginBottom: 20 },
});
