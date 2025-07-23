import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Animated, Easing, SafeAreaView, Switch } from 'react-native';
import CorrectionPanel from '../components/CorrectionPanel';
import { logCorrection, loadProfile, Profile } from '../storage';
import { mlService } from '../services';
import { playSymbolAudio } from '../services';
import { playSymbolVideo } from '../services';
import { database } from "../../db";
import { Correction } from "../../db/models";
import { dialogEngine, LLMSuggestionResponse } from '../services/dialogEngine';
import { incrementUsage } from '../services';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import {getSymbolLabelForGesture} from "../components/gestureMap";

export default function RecognitionScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("I'm listening...");
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<LLMSuggestionResponse>({
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

  const handleRecognize = () => {
   mlService.classifyGesture(async (result: any) => {
      if (result && result.confidence > 0.85) {
        const recognizedSymbolLabel = getSymbolLabelForGesture(result.label);

          setStatus(`I think: ${result.label}`);
          startFeedbackAnimation();
          setLastLabel(result.label);
          const entry = gestureModel.gestures.find((g) => g.id === result.label) || {
            id: result.label,
            label: result.label,
          };
          playSymbolAudio(entry);
          if (profile) {
            incrementUsage(entry, profile.id);
          }
          const adv = await dialogEngine.getLLMSuggestions({
            input: result.label,
            context: [],
            language: 'de',
            age: 4,
          });
          setSuggestions(adv);
      }
    });
  };

  const handleSelect = async (choice: string) => {
    if (!lastLabel) return;
    await database.write(async () => {
      const collection = database.get<Correction>('corrections');
      await collection.create(r => {
        r.predictedGesture = lastLabel;
        r.actualGesture = choice;
        r.confidence = 0;
        r.landmarks = [];
        r.timestamp = Date.now();
        r.isSynced = false;
      });
    });
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
        <Switch
          value={useDgs}
          onValueChange={setUseDgs}
          accessibilityLabel="DGS-Video verwenden"
        />
      </View>
      <Button
        title="Simulate recognition"
        onPress={handleRecognize}
        accessibilityLabel="Erkennung simulieren"
      />
      <Button
        title="Simulate low confidence"
        onPress={handleLowConfidence}
        accessibilityLabel="Niedrige Sicherheit simulieren"
      />
      {lastLabel && (
        <Button
          title="Play video"
          onPress={handlePlayVideo}
          accessibilityLabel="Video abspielen"
        />
      )}
      <CorrectionPanel
        visible={showCorrection}
        onSelect={handleSelect}
        onClose={() => setShowCorrection(false)}
        onAddNew={handleAddNew}
      />
      <Button
        title="Analytics"
        onPress={() => navigation.navigate('Dashboard')}
        accessibilityLabel="Zur Statistik"
      />
    </SafeAreaView>
  );
}

