import React, { useState, useRef } from 'react';
import { View, Text, Button, StyleSheet, Animated, Easing, SafeAreaView } from 'react-native';
import CorrectionPanel from '../components/CorrectionPanel';
import { logCorrection } from '../storage';
import { classifyGesture } from '../services/mlService';
import { playSymbolAudio } from '../services/audioService';
import { playSymbolVideo } from '../services/videoService';
import { getAdaptiveSuggestion } from '../services/dialogService';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';

export default function RecognitionScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [status, setStatus] = useState("I'm listening...");
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const startFeedbackAnimation = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handleLowConfidence = () => {
    setShowCorrection(true);
    startFeedbackAnimation();
  };

  const handleRecognize = async () => {
    const result = await classifyGesture(null);
    setStatus(`I think: ${result.label}`);
    startFeedbackAnimation();
    setLastLabel(result.label);
    await playSymbolAudio({ id: result.label, label: result.label });
    const adv = await getAdaptiveSuggestion(result.label);
    setSuggestions(adv);
  };

  const handleSelect = async (choice: string) => {
    await logCorrection(choice);
    setShowCorrection(false);
    setStatus('Thanks!');
    startFeedbackAnimation();
  };

  const handleAddNew = () => {
    setShowCorrection(false);
    navigation.navigate('Training');
  };

  const handlePlayVideo = async () => {
    if (!lastLabel) return;
    await playSymbolVideo({ id: lastLabel, label: lastLabel });
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: highContrast ? '#000' : '#fdfdfd',
    },
    status: {
      fontSize: largeText ? 24 : 20,
      marginBottom: 20,
      textAlign: 'center',
      color: highContrast ? '#fff' : '#000',
    },
    suggestion: {
      fontSize: largeText ? 20 : 16,
      marginBottom: 10,
      color: highContrast ? '#fff' : '#666',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Placeholder for camera & ML integration */}
      <Animated.Text style={[styles.status, { opacity: fadeAnim }]}>
        {status}
      </Animated.Text>
      {suggestions.map((s, i) => (
        <Text key={i} style={styles.suggestion}>{s}</Text>
      ))}
      <Button title="Simulate recognition" onPress={handleRecognize} />
      <Button title="Simulate low confidence" onPress={handleLowConfidence} />
      {lastLabel && (
        <Button title="Play video" onPress={handlePlayVideo} />
      )}
      <CorrectionPanel
        visible={showCorrection}
        onSelect={handleSelect}
        onClose={() => setShowCorrection(false)}
        onAddNew={handleAddNew}
      />
      <Button title="Analytics" onPress={() => navigation.navigate('Dashboard')} />
    </SafeAreaView>
  );
}

