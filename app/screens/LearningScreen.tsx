import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, Pressable, AppState, StyleSheet, Switch } from 'react-native';
import withObservables from '@nozbe/with-observables';
import { switchMap } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';
import { useIsFocused } from '@react-navigation/native';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { runOnJS } from 'react-native-reanimated';
import { database } from '../db';
import { Profile, Symbol } from '../db/models';
import { ttsService } from '../services/ttsService';
import { feedbackService } from '../services/feedbackService';
import { usageTracker } from '../services/usageTracker';
import { SymbolButton } from '../components/SymbolButton';
import { SymbolVideoPlayer } from '../components/SymbolVideoPlayer';
import { dialogEngine } from '../services/dialogEngine';
import { getSymbolLabelForGesture } from '../components/gestureMap';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type RootStackParamList = { Learning: { profileId: string }, Admin: { profileId: string } };
type Props = NativeStackScreenProps<RootStackParamList, 'Learning'>;

// LLM Hint: Use a status enum for async operations instead of multiple booleans (e.g., isLoading, isError).
// This creates a clear state machine ('idle' -> 'loading' -> 'success'/'error') which is easier to manage.
type SuggestionStatus = 'idle' | 'loading' | 'success' | 'error';

type GesturePrediction = { label: string; confidence: number };

const enhance = withObservables<Props, { profile: Profile, vocabulary: Symbol[] }>(['route'], ({ route }) => ({
  profile: database.get<Profile>('profiles').findAndObserve(route.params.profileId),
  vocabulary: database.get<Profile>('profiles').findAndObserve(route.params.profileId).pipe(
    switchMap(p => p.activeVocabularySet.observe()),
    switchMap(activeSet => activeSet ? database.get<Symbol>('symbols').query(
        { on: 'vocabulary_set_symbols', where: { vocabulary_set_id: activeSet.id } }
    ).observe() : new BehaviorSubject<Symbol[]>([]))
  ),
}));

const LearningScreen = ({ profile, vocabulary, navigation }: { profile: Profile, vocabulary: Symbol[], navigation: Props['navigation'] }) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol | null>(null);
  const [videoPaused, setVideoPaused] = useState(false);
  const [adaptiveSuggestions, setAdaptiveSuggestions] = useState<Symbol[]>([]);
  const [llmSuggestions, setLlmSuggestions] = useState<{ nextWords: string[]; caregiverPhrases: string[] } | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');

  const { model } = useTensorflowModel(require('../assets/models/gestures.tflite'));
  const device = useCameraDevice('front');
  const isFocused = useIsFocused();
  const appState = AppState.currentState;
  const canRunCamera = device != null && isCameraActive && isFocused && appState === 'active';

  const handlePress = async (symbol: Symbol) => {
    setSelectedSymbol(symbol);
    setVideoPaused(false);
    ttsService.speak(symbol.name);
    await usageTracker.incrementUsage(symbol, profile.id);

    // LLM Hint: This is how to use the status state machine for an async operation.
    setSuggestionStatus('loading');
    try {
      const [adaptive, llm] = await Promise.all([
        dialogEngine.getAdaptiveSuggestions(vocabulary, profile.id),
        dialogEngine.getLLMSuggestions({ input: symbol.name, context: symbol.contextTags, language: 'de', age: 4 }),
      ]);
      setAdaptiveSuggestions(adaptive);
      setLlmSuggestions(llm);
      setSuggestionStatus('success');
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestionStatus('error');
    }
  };

  const handleGesture = (prediction: GesturePrediction) => {
    if (lastGesture !== null) return;
    
    const recognizedSymbolLabel = getSymbolLabelForGesture(prediction.label);
    if (recognizedSymbolLabel) {
      const foundSymbol = vocabulary.find(s => s.name === recognizedSymbolLabel);
      if (foundSymbol) {
        runOnJS(handlePress)(foundSymbol);
        runOnJS(feedbackService.triggerSuccess)();
        runOnJS(setLastGesture)(prediction.label);
        setTimeout(() => runOnJS(setLastGesture)(null), 2000); // Cooldown
      }
    }
  };

  const frameProcessor = useFrameProcessor(frame => {
    'worklet';
    if (!model.value) return;
    try {
        const data = model.value.runSync(frame) as any[];
        if (data?.length > 0) {
            const best = data.reduce((p, c) => (p.confidence > c.confidence) ? p : c);
            if (best?.confidence > 0.8) { // Confidence threshold
                handleGesture(best);
            }
        }
    } catch (e) {
        console.error("Frame processor error", e);
    }
  }, [model, vocabulary, lastGesture]);

  if (!profile || !vocabulary) {
    return <View style={styles.container}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {canRunCamera && <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} frameProcessor={frameProcessor} frameProcessorFps={5}/>} 
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{profile.name}'s Vokabular</Text>
        <Pressable onPress={() => navigation.navigate('Admin', { profileId: profile.id })}>
          <Text style={styles.adminButton}>⚙️</Text>
        </Pressable>
      </View>
      
      <FlatList 
        data={vocabulary} 
        renderItem={({ item }) => <SymbolButton symbol={item} onPress={handlePress} />} 
        keyExtractor={item => item.id} 
        numColumns={2} 
        contentContainerStyle={styles.list} 
      />

      {selectedSymbol && (
        <View style={styles.selectedSymbolContainer}>
          <Text style={styles.selectedSymbolLabel}>{selectedSymbol.name}</Text>
          <SymbolVideoPlayer videoAssetPath={selectedSymbol.videoAssetPath} paused={videoPaused} onEnd={() => setVideoPaused(true)} />
          <Pressable style={styles.repeatButton} onPress={() => handlePress(selectedSymbol)}>
            <Text style={styles.buttonText}>🔁 Wiederholen</Text>
          </Pressable>
          <View style={styles.suggestionsContainer}>
            {suggestionStatus === 'loading' && <ActivityIndicator style={{ marginVertical: 10 }} />}
            {suggestionStatus === 'error' && <Text style={{ color: 'red' }}>Fehler beim Laden der Vorschläge.</Text>}
            {suggestionStatus === 'success' && (
              <>
                {adaptiveSuggestions.length > 0 && <Text style={styles.suggestionsTitle}>Vielleicht auch?</Text>}
                <View style={styles.suggestionsList}>
                    {adaptiveSuggestions.map(s => <SymbolButton key={s.id} symbol={s} onPress={handlePress} />)}
                </View>
                {llmSuggestions && llmSuggestions.nextWords.length > 0 && <Text style={styles.suggestionsTitle}>Ideen (KI)</Text>}
                {/* LLM Hint: Render the llmSuggestions.nextWords and caregiverPhrases here */}
              </>
            )}
          </View>
        </View>
      )}

      <View style={styles.cameraToggle}>
        <Text>Gesten erkennen</Text>
        <Switch
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={isCameraActive ? "#f5dd4b" : "#f4f3f4"}
            onValueChange={() => setIsCameraActive(previousState => !previousState)}
            value={isCameraActive}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  adminButton: { fontSize: 24 },
  list: { alignItems: 'center', paddingTop: 10, paddingBottom: 200 },
  cameraToggle: { position: 'absolute', bottom: 30, alignSelf: 'center', padding: 15, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 20, elevation: 5, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedSymbolContainer: { position: 'absolute', bottom: 100, left: 10, right: 10, alignItems: 'center', padding: 10, backgroundColor: 'white', borderRadius: 15, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  selectedSymbolLabel: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  repeatButton: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#e0e0e0', borderRadius: 10 },
  buttonText: { fontWeight: 'bold' },
  suggestionsContainer: { marginTop: 15, width: '100%' },
  suggestionsTitle: { fontWeight: 'bold', fontSize: 16, textAlign: 'center', marginBottom: 5 },
  suggestionsList: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }
});

export default enhance(LearningScreen);
