import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { saveTrainingSample } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';

function captureDummyLandmarks() {
  return Array.from({ length: 21 }, () => [
    Math.random(),
    Math.random(),
    Math.random(),
  ]);
}

export default function TrainingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [gestureId, setGestureId] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const handleRecord = async () => {
    if (!gestureId) return;
    const landmarks = captureDummyLandmarks();
    await saveTrainingSample(gestureId, landmarks);
    setCount((c) => c + 1);
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: highContrast ? '#000' : '#fff',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: 20,
      color: highContrast ? '#fff' : '#000',
    },
  });

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
