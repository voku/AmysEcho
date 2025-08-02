import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Animated,
  Easing,
  SafeAreaView,
  Switch,
  Dimensions,
  TouchableOpacity,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import CorrectionPanel from '../components/CorrectionPanel';
import SymbolVideoPlayer from '../components/SymbolVideoPlayer';
import { logCorrection, loadProfile, Profile } from '../storage';
import { playSymbolAudio } from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { database } from '../../db';
import { Correction, GestureDefinition } from '../../db/models';
import { dialogEngine, LLMSuggestionResponse } from '../services';
import { incrementUsage } from '../services';
import { gestureModel, GestureModelEntry } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { getSymbolLabelForGesture } from '../components/gestureMap';
import { useServices } from '../context/AppServicesProvider';
import { useGestureClassifier } from '../services';
import BottomNav from '../components/BottomNav';

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
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(useCameraPermission().hasPermission);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;

  const { requestPermission } = useCameraPermission();
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back') ?? devices.find(d => d.position === 'front') ?? devices[0];
  const isFocused = useIsFocused();
  const appState = AppState.currentState;

  const canUseCamera =
    permissionStatus && device != null && isFocused && isCameraActive && appState === 'active';

  const handleRequestPermission = useCallback(async () => {
    console.log('Requesting camera permission...');
    const result = await requestPermission();
    console.log('Permission result:', result);
    setPermissionStatus(result);
  }, [requestPermission]);

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

  const onGestureResult = useCallback(async (result: any) => {
    if (isProcessing) return;

    if (result && result.label && result.label !== 'uncertain' && result.confidence > 0.7) {
      setIsProcessing(true);

      const recognizedSymbolLabel = getSymbolLabelForGesture(result.label) || result.label;
      const entry =
        gestureModel.gestures.find((g) => g.id === result.label) || {
          id: result.label,
          label: recognizedSymbolLabel,
          videoUri: undefined,
          dgsVideoUri: undefined,
        };

      setLastRecognizedGesture(entry);
      setStatus(recognizedSymbolLabel);
      startFeedbackAnimation();

      try {
        playSymbolAudio(entry);
      } catch (error) {
        console.warn('Audio playback failed:', error);
      }

      if (useDgs && entry.dgsVideoUri) {
        setShowVideoPlayer(true);
      } else if (entry.videoUri) {
        setShowVideoPlayer(true);
      }

      if (profile) {
        try {
          incrementUsage(entry, profile.id);
        } catch (error) {
          console.warn('Usage tracking failed:', error);
        }
      }

      try {
        const adv = await dialogEngine.getLLMSuggestions({
          input: recognizedSymbolLabel,
          context: [],
          language: 'de',
          age: 4,
        });
        setSuggestions(adv);
      } catch (error) {
        console.warn('Failed to get LLM suggestions:', error);
      }

      setTimeout(() => {
        setIsProcessing(false);
        setStatus("I'm listening...");
      }, 3000);
    } else if (result && result.label === 'uncertain') {
      setStatus("I didn't understand. Please try again.");
      startFeedbackAnimation();
      setTimeout(() => setStatus("I'm listening..."), 2000);
    }
  }, [isProcessing, useDgs, profile, startFeedbackAnimation]);

  const frameProcessor = useGestureClassifier(onGestureResult, isProcessing);

  const handleSelect = async (choice: string) => {
    if (!lastRecognizedGesture) return;
    try {
      await database.write(async () => {
        const collection = database.get<Correction>('corrections');
        await collection.create((r) => {
          r.predictedGesture = lastRecognizedGesture.id;
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
      setTimeout(() => setStatus("I'm listening..."), 2000);
    } catch (error) {
      console.error('Failed to save correction:', error);
    }
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
      setWeakGesture(null);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    cameraContainer: {
      flex: 1,
      position: 'relative',
    },
    camera: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    status: {
      fontSize: largeText ? 48 : 40,
      fontWeight: 'bold',
      marginBottom: 20,
      textAlign: 'center',
      color: '#fff',
      textShadowColor: 'rgba(0, 0, 0, 0.8)',
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    },
    symbolDisplay: {
      fontSize: largeText ? 120 : 100,
      marginBottom: 20,
      textShadowColor: 'rgba(0, 0, 0, 0.8)',
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    },
    controls: {
      position: 'absolute',
      bottom: 100,
      left: 20,
      right: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 15,
      padding: 15,
    },
    suggestion: {
      fontSize: largeText ? 18 : 14,
      marginBottom: 5,
      color: highContrast ? '#000' : '#666',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    toggleLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? '#000' : '#333',
    },
    cameraToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 15,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 10,
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
      backgroundColor: '#FFD700',
      padding: 10,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
    },
    weakGestureBannerText: {
      color: '#333',
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    permissionText: {
      fontSize: largeText ? 20 : 18,
      textAlign: 'center',
      marginBottom: 20,
      color: highContrast ? '#fff' : '#333',
    },
  });

  if (!permissionStatus) {
    const gradientColors = highContrast ? (['#000', '#000'] as const) : (['#EFF6FF', '#F3F4F6'] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>
              Amy's Echo needs camera access to recognize gestures.
            </Text>
            <Button title="Grant Camera Permission" onPress={handleRequestPermission} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!device) {
    const gradientColors = highContrast ? (['#000', '#000'] as const) : (['#EFF6FF', '#F3F4F6'] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>No camera available on this device.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const gradientColors = highContrast ? (['#000', '#000'] as const) : (['#EFF6FF', '#F3F4F6'] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
      {weakGesture && (
        <TouchableOpacity
          onPress={handleWeakGestureBannerPress}
          style={styles.weakGestureBanner}
        >
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
        <View style={styles.cameraContainer}>
          {canUseCamera && (
            <Camera
              style={styles.camera}
              device={device}
              isActive={true}
              frameProcessor={frameProcessor}
            />
          )}

          <View style={styles.overlay}>
            <Animated.Text style={[styles.status, { opacity: fadeAnim }]}>{status}</Animated.Text>

            {lastRecognizedGesture && lastRecognizedGesture.label !== 'uncertain' && (
              <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}>{lastRecognizedGesture.label}</Animated.Text>
            )}
          </View>

          <View style={styles.controls}>
            <View style={styles.cameraToggle}>
              <Text style={styles.toggleLabel}>Camera Active</Text>
              <Switch
                value={isCameraActive}
                onValueChange={setIsCameraActive}
                accessibilityLabel="Toggle camera"
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Use DGS Video</Text>
              <Switch
                value={useDgs}
                onValueChange={(isChecked) => {
                  if (isChecked) {
                    navigation.navigate('Dgs');
                  } else {
                    setUseDgs(false);
                  }
                }}
                accessibilityLabel="DGS-Video verwenden"
              />
            </View>

            {suggestions.nextWords.length > 0 && (
              <View>
                <Text style={styles.suggestion}>
                  Next words: {suggestions.nextWords.join(', ')}
                </Text>
              </View>
            )}

            {suggestions.caregiverPhrases.length > 0 && (
              <View>
                <Text style={styles.suggestion}>
                  Caregiver: {suggestions.caregiverPhrases.join(', ')}
                </Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              <Button
                title="Simulate"
                onPress={handleLowConfidence}
                accessibilityLabel="Simulate low confidence"
              />
              <Button
                title="Menu"
                onPress={() => navigation.navigate('ProfileSelect')}
                accessibilityLabel="Menü öffnen"
              />
              <Button
                title="Analytics"
                onPress={() => navigation.navigate('Dashboard')}
                accessibilityLabel="View analytics"
              />
              <Button
                title="Help"
                onPress={() => navigation.navigate('Help')}
                accessibilityLabel="Get help"
              />
            </View>
          </View>
        </View>
      )}

      {showCorrection && (
        <CorrectionPanel
          onSelect={handleSelect}
          onAddNew={handleAddNew}
          onCancel={() => setShowCorrection(false)}
        />
      )}

      {profile && <BottomNav active="recognition" profileId={profile.id} />}
    </SafeAreaView>
    </LinearGradient>
  );
}

