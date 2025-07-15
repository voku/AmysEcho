import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { saveTrainingSample } from '../storage';

export default function TrainingScreen({ navigation }: any) {
  const [count, setCount] = useState(0);

  const handleRecord = async () => {
    await saveTrainingSample('example-gesture', null);
    setCount((c) => c + 1);
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Training Mode</Text>
      {count < 5 ? (
        <Button
          title={`Record Sample ${count + 1} / 5`}
          onPress={handleRecord}
        />
      ) : (
        <Button title="Finish" onPress={handleFinish} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, marginBottom: 20 },
});
