import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Animated, Easing, SafeAreaView, Switch } from 'react-native';
import CorrectionPanel from '../components/CorrectionPanel';
import { logCorrection, loadProfile, Profile } from '../storage';
import { classifyGesture } from '../services/mlService';
import { playSymbolAudio } from '../services/audioService';
import { playSymbolVideo } from '../services/videoService';
import { getLLMSuggestions, LLMSuggestions } from '../services/dialogService';
import { incrementUsage } from '../services/usageTracker';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';

export default function RecognitionScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("I'm listening...");
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<LLMSuggestions>({
    nextWords: [],
    caregiverPhrases: [],
  });
  const [useDgs, setUseDgs] = useState(false);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

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
    const entry = gestureModel.gestures.find((g) => g.id === result.label) || {
      id: result.label,
      label: result.label,
    };
    await playSymbolAudio(entry);
    if (profile) {
      await incrementUsage(entry, profile.id);
    }
    const adv = await getLLMSuggestions(result.label);
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
    const entry =
      gestureModel.gestures.find((g) => g.id === lastLabel) || {
        id: lastLabel,
        label: lastLabel,
      };
    await playSymbolVideo(entry, useDgs);
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Placeholder for camera & ML integration */}
      <Animated.Text style={[styles.status, { opacity: fadeAnim }]}>
        {status}
      </Animated.Text>
      {suggestions.nextWords.length > 0 && (
        <View>
          <Text style={styles.suggestion}>Next words:</Text>
          {suggestions.nextWords.map((s, i) => (
            <Text key={i} style={styles.suggestion}>{s}</Text>
          ))}
        </View>
      )}
      {suggestions.caregiverPhrases.length > 0 && (
        <View>
          <Text style={styles.suggestion}>Caregiver:</Text>
          {suggestions.caregiverPhrases.map((s, i) => (
            <Text key={i} style={styles.suggestion}>{s}</Text>
          ))}
        </View>
      )}
      <View style={styles.toggleRow}>
        <Text style={styles.suggestion}>Use DGS Video</Text>
        <Switch value={useDgs} onValueChange={setUseDgs} />
      </View>
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

