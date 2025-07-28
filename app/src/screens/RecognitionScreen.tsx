import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, Animated, Easing, SafeAreaView, Switch, Dimensions, TouchableOpacity } from 'react-native';
import CorrectionPanel from '../components/CorrectionPanel';
import SymbolVideoPlayer from '../components/SymbolVideoPlayer';
import { logCorrection, loadProfile, Profile } from '../storage';
import { mlService } from '../services';
import { playSymbolAudio } from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { database } from "../../db";
import { Correction, GestureDefinition } from "../../db/models";
import { dialogEngine, LLMSuggestionResponse } from '../services';
import { incrementUsage } from '../services';
import { gestureModel, GestureModelEntry } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import {getSymbolLabelForGesture} from "../components/gestureMap";

const { width, height } = Dimensions.get('window');

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
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState<GestureModelEntry | null>(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [weakGesture, setWeakGesture] = useState<GestureDefinition | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile().then(setProfile);
    const fetchWeakGesture = async () => {
      const gesture = await adaptiveLearningService.getWeakGesture();
      setWeakGesture(gesture);
    };
    fetchWeakGesture();
  }, []);

  const startFeedbackAnimation = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    symbolScaleAnim.setValue(0);
    Animated.spring(symbolScaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, symbolScaleAnim]);

  const handleLowConfidence = () => {
    setShowCorrection(true);
    startFeedbackAnimation();
  };

  const handleRecognize = () => {
    mlService.classifyGesture(async (result: any) => {
      if (result && result.label !== 'uncertain') {
        const recognizedSymbolLabel = getSymbolLabelForGesture(result.label) || result.label;
        const entry = gestureModel.gestures.find((g) => g.id === result.label) || {
          id: result.label,
          label: recognizedSymbolLabel,
          videoUri: undefined, // Ensure this is set correctly from your model data
          dgsVideoUri: undefined, // Ensure this is set correctly from your model data
        };

        setLastRecognizedGesture(entry);
        setStatus(recognizedSymbolLabel);
        startFeedbackAnimation();

        playSymbolAudio(entry);

        if (useDgs && entry.dgsVideoUri) {
          setShowVideoPlayer(true);
        } else if (entry.videoUri) {
          // Fallback to general video if DGS not used or available
          setShowVideoPlayer(true);
        }

        if (profile) {
          incrementUsage(entry, profile.id);
        }
        const adv = await dialogEngine.getLLMSuggestions({
          input: recognizedSymbolLabel,
          context: [],
          language: 'de',
          age: 4,
        });
        setSuggestions(adv);
      } else if (result && result.label === 'uncertain') {
        setStatus('I didn\'t understand. Please try again.');
        startFeedbackAnimation();
      }
    });
  };

  const handleSelect = async (choice: string) => {
    if (!lastRecognizedGesture) return;
    await database.write(async () => {
      const collection = database.get<Correction>('corrections');
      await collection.create(r => {
        r.predictedGesture = lastRecognizedGesture.id;
        r.actualGesture = choice;
        r.confidence = 0; // Confidence of correction is 1, but original was low
        r.landmarks = []; // Not capturing landmarks for correction for now
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

  const handleVideoEnd = useCallback(() => {
    setShowVideoPlayer(false);
  }, []);

  const handleWeakGestureBannerPress = () => {
    if (weakGesture) {
      navigation.navigate('Training', { gestureLabel: weakGesture.name });
      setWeakGesture(null); // Dismiss banner after tap
    }
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
      fontSize: largeText ? 48 : 40,
      fontWeight: 'bold',
      marginBottom: 20,
      textAlign: 'center',
      color: highContrast ? '#fff' : '#000',
    },
    symbolDisplay: {
      fontSize: largeText ? 120 : 100,
      marginBottom: 20,
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
    videoPlayerContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: width,
      height: height,
      backgroundColor: 'black',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    weakGestureBanner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: '#FFD700', // Gold color for a gentle alert
      padding: 10,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999, // Below video player
    },
    weakGestureBannerText: {
      color: '#333',
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {weakGesture && (
        <TouchableOpacity onPress={handleWeakGestureBannerPress} style={styles.weakGestureBanner}>
          <Text style={styles.weakGestureBannerText}>
            Let's try this one again: {weakGesture.name}
          </Text>
        </TouchableOpacity>
      )}
      {showVideoPlayer && lastRecognizedGesture ? (
        <View style={styles.videoPlayerContainer}>
          <SymbolVideoPlayer
            entry={lastRecognizedGesture}
            paused={!showVideoPlayer}
            useDgs={useDgs}
            onEnd={handleVideoEnd}
          />
        </View>
      ) : (
        <>
          <Animated.Text style={[styles.status, { opacity: fadeAnim }]}>
            {status}
          </Animated.Text>
          {lastRecognizedGesture && lastRecognizedGesture.label !== 'uncertain' && (
            <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}>
              {lastRecognizedGesture.label} {/* Assuming label can be an emoji/text symbol */}
            </Animated.Text>
          )}
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
          <Button
            title="Analytics"
            onPress={() => navigation.navigate('Dashboard')}
            accessibilityLabel="Zur Statistik"
          />
          <Button
            title="Help Me"
            onPress={() => navigation.navigate('Help')}
            accessibilityLabel="Hilfe anfordern"
          />
        </>
      )}
    </SafeAreaView>
  );
}

