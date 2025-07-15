import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import CorrectionPanel from '../components/CorrectionPanel';
import { logCorrection } from '../storage';
import { classifyGesture } from '../services/mlService';
import { playSymbolAudio } from '../services/audioService';
import { getAdaptiveSuggestion } from '../services/dialogService';
import { gestureModel } from '../model';

export default function RecognitionScreen({ navigation }: any) {
  const [status, setStatus] = useState("I'm listening...");
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleLowConfidence = () => {
    setShowCorrection(true);
  };

  const handleRecognize = async () => {
    const result = await classifyGesture(null);
    setStatus(`I think: ${result.label}`);
    await playSymbolAudio({ id: result.label, label: result.label });
    const adv = await getAdaptiveSuggestion(result.label);
    setSuggestions(adv);
  };

  const handleSelect = async (choice: string) => {
    await logCorrection(choice);
    setShowCorrection(false);
    setStatus('Thanks!');
  };

  const handleAddNew = () => {
    setShowCorrection(false);
    navigation.navigate('Training');
  };

  return (
    <View style={styles.container}>
      {/* Placeholder for camera & ML integration */}
      <Text style={styles.status}>{status}</Text>
      {suggestions.map((s, i) => (
        <Text key={i} style={styles.suggestion}>{s}</Text>
      ))}
      <Button title="Simulate recognition" onPress={handleRecognize} />
      <Button title="Simulate low confidence" onPress={handleLowConfidence} />
      <CorrectionPanel
        visible={showCorrection}
        onSelect={handleSelect}
        onClose={() => setShowCorrection(false)}
        onAddNew={handleAddNew}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  status: { fontSize: 20, marginBottom: 20 },
  suggestion: { fontSize: 16, marginBottom: 10, color: '#666' },
});
