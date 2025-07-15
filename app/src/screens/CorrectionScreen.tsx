import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { logCorrection } from '../storage';

export default function CorrectionScreen({ navigation }: any) {
  const handleSelect = async (choice: string) => {
    await logCorrection(choice);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Which sign was this?</Text>
      <View style={styles.buttonRow}>
        <Button title="Choice 1" onPress={() => handleSelect('1')} />
        <Button title="Choice 2" onPress={() => handleSelect('2')} />
        <Button title="Choice 3" onPress={() => handleSelect('3')} />
        <Button title="Choice 4" onPress={() => handleSelect('4')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, marginBottom: 20 },
  buttonRow: { width: '80%', flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'space-between' },
});
