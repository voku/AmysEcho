import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import CorrectionPanel from '../components/CorrectionPanel';
import { logCorrection } from '../storage';

export default function RecognitionScreen() {
  const [status, setStatus] = useState("I'm listening...");
  const [showCorrection, setShowCorrection] = useState(false);

  const handleLowConfidence = () => {
    setShowCorrection(true);
  };

  const handleSelect = async (choice: string) => {
    await logCorrection(choice);
    setShowCorrection(false);
    setStatus('Thanks!');
  };

  return (
    <View style={styles.container}>
      {/* Placeholder for camera & ML integration */}
      <Text style={styles.status}>{status}</Text>
      <Button title="Simulate low confidence" onPress={handleLowConfidence} />
      <CorrectionPanel
        visible={showCorrection}
        onSelect={handleSelect}
        onClose={() => setShowCorrection(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  status: { fontSize: 20, marginBottom: 20 },
});
