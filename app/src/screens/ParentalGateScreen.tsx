import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { SPACING, RADIUS } from '../constants/ui';

export default function ParentalGateScreen({ route, navigation }: any) {
  const { target } = route.params as { target: string };
  const [problem, setProblem] = useState('');
  const [answer, setAnswer] = useState('');
  const [solution, setSolution] = useState<number>(0);

  useEffect(() => {
    const a = Math.floor(Math.random() * 10) + 2; // 2..11
    const b = Math.floor(Math.random() * 10) + 2;
    setProblem(`${a} × ${b} = ?`);
    setSolution(a * b);
  }, []);

  const handleCheck = () => {
    if (parseInt(answer, 10) === solution) {
      navigation.replace(target);
    } else {
      setAnswer('');
      const a = Math.floor(Math.random() * 10) + 2;
      const b = Math.floor(Math.random() * 10) + 2;
      setProblem(`${a} × ${b} = ?`);
      setSolution(a * b);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
    title: { fontSize: 24, marginBottom: SPACING.lg },
    input: { borderWidth: 1, width: 120, padding: SPACING.sm, textAlign: 'center', marginBottom: SPACING.lg, borderRadius: RADIUS },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{problem}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={answer}
        onChangeText={setAnswer}
        accessibilityLabel="Antwort auf Elternprüfung"
      />
      <Button title="OK" onPress={handleCheck} accessibilityLabel="Antwort bestätigen" />
      <Button title="Zurück" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
    </View>
  );
}
