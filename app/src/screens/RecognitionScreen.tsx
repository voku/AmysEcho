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
  Pressable,
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
import { loadProfile, Profile } from '../storage';
import { playSymbolAudio } from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { database } from '../../db';
import { Correction, GestureDefinition } from '../../db/models';
import { dialogEngine, LLMSuggestionResponse } from '../services';
import { incrementUsage } from '../services';
import { gestureModel, GestureModelEntry } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { getSymbolLabelForGesture } from '../components/gestureMap';
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
  const [showHelp, setShowHelp] = useState(false);
  const [correctionOptions, setCorrectionOptions] = useState<{ id: string; label: string }[]>([]);
  const [pendingGesture, setPendingGesture] = useState<string | null>(null);
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

  const handleHelpPress = () => {
    setShowCorrection(true);
    setShowHelp(false);
    startFeedbackAnimation();
  };

  const handleCancelCorrection = () => {
    setShowCorrection(false);
    setShowHelp(false);
    setIsProcessing(false);
    setStatus("I'm listening...");
  };

  const onGestureResult = useCallback(async (result: any) => {
    if (isProcessing) return;

    if (
      result &&
      result.label &&
      result.label !== 'uncertain' &&
      !result.requiresConfirmation
    ) {
      setIsProcessing(true);

      const recognizedSymbolLabel =
        getSymbolLabelForGesture(result.label) || result.label;
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
    } else if (result && result.requiresConfirmation) {
      setIsProcessing(true);
      setPendingGesture(result.label);
      const opts =
        result.suggestions && result.suggestions.length > 0
          ? result.suggestions
          : [result.label];
      const mapped = opts.map((id: string) => ({
        id,
        label: getSymbolLabelForGesture(id) || id,
      }));
      setCorrectionOptions(mapped);
      setLastRecognizedGesture(null);
      setStatus("Can you help me?");
      setShowHelp(true);
      startFeedbackAnimation();
    }
  }, [isProcessing, useDgs, profile, startFeedbackAnimation]);

  const frameProcessor = useGestureClassifier(onGestureResult, isProcessing);

  const handleSelect = async (choiceId: string) => {
    try {
      await database.write(async () => {
        const collection = database.get<Correction>('corrections');
        await collection.create((r) => {
          r.predictedGesture = pendingGesture || 'unknown';
          r.actualGesture = choiceId;
          r.confidence = 0;
          r.landmarks = [];
          r.timestamp = Date.now();
          r.isSynced = false;
        });
      });

      const entry =
        gestureModel.gestures.find((g) => g.id === choiceId) || {
          id: choiceId,
          label: getSymbolLabelForGesture(choiceId) || choiceId,
          videoUri: undefined,
          dgsVideoUri: undefined,
        };

      setShowCorrection(false);
      setShowHelp(false);
      setLastRecognizedGesture(entry);
      setStatus(entry.label);
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
          input: entry.label,
          context: [],
          language: 'de',
          age: 4,
        });
        setSuggestions(adv);
      } catch (error) {
        console.warn('Failed to get LLM suggestions:', error);
      }

      setPendingGesture(null);
      setTimeout(() => {
        setIsProcessing(false);
        setStatus("I'm listening...");
      }, 3000);
    } catch (error) {
      console.error('Failed to save correction:', error);
      setIsProcessing(false);
    }
  };

  const handleAddNew = () => {
    setShowCorrection(false);
    setShowHelp(false);
    setIsProcessing(false);
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
      bottom: 96,
      left: 16,
      right: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 16,
      padding: 16,
    },
    suggestion: {
      fontSize: largeText ? 18 : 14,
      marginBottom: 8,
      color: highContrast ? '#000' : '#666',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    toggleLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? '#000' : '#333',
    },
    cameraToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 8,
    },
    helpButton: {
      flex: 1,
      backgroundColor: '#3B82F6',
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    helpButtonText: {
      color: '#fff',
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
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
      padding: 16,
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
      padding: 16,
    },
    permissionText: {
      fontSize: largeText ? 20 : 18,
      textAlign: 'center',
      marginBottom: 16,
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
        <Pressable
          onPress={handleWeakGestureBannerPress}
          style={styles.weakGestureBanner}
          accessibilityRole="button"
          accessibilityLabel="Practice weak gesture again"
        >
          <Text style={styles.weakGestureBannerText}>
            Let's try this one again: {weakGesture.name}
          </Text>
        </Pressable>
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
            <Animated.Text style={[styles.status]}>{status}</Animated.Text>

            {lastRecognizedGesture && lastRecognizedGesture.label !== 'uncertain' && (
              <Animated.Text style={[styles.symbolDisplay, { transform: [{ scale: symbolScaleAnim }] }]}>{lastRecognizedGesture.label}</Animated.Text>
            )}
          </View>

          <View style={styles.controls}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show DGS Video</Text>
              <Switch
                value={useDgs}
                onValueChange={setUseDgs}
                accessibilityLabel="Toggle DGS video"
              />
            </View>

            {showHelp && (
              <View style={styles.buttonRow}>
                <Pressable
                  style={styles.helpButton}
                  onPress={handleHelpPress}
                  accessibilityRole="button"
                  accessibilityLabel="Open correction panel"
                >
                  <Text style={styles.helpButtonText}>Help Me</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      {showCorrection && (
        <CorrectionPanel
          onSelect={handleSelect}
          onAddNew={handleAddNew}
          onCancel={handleCancelCorrection}
          suggestions={correctionOptions}
        />
      )}

      {profile && <BottomNav active="recognition" profileId={profile.id} />}
    </SafeAreaView>
    </LinearGradient>
  );
}