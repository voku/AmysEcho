import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { saveTrainingSample } from '../storage';
import { gestureModel } from '../model';

export default function TrainingScreen({ navigation }: any) {
  const [gestureId, setGestureId] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const handleRecord = async () => {
    if (!gestureId) return;
    await saveTrainingSample(gestureId, null);
    setCount((c) => c + 1);
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Training Mode</Text>
      {!gestureId ? (
        gestureModel.gestures.map((g) => (
          <Button key={g.id} title={g.label} onPress={() => setGestureId(g.id)} />
        ))
      ) : count < 5 ? (
        <Button
          title={`Record Sample ${count + 1} / 5 for ${gestureId}`}
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
