import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, Pressable, AppState, StyleSheet, Switch } from 'react-native';
import withObservables from '@nozbe/with-observables';
import { switchMap } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';
import type { Observable } from 'rxjs';
import { useIsFocused } from '@react-navigation/native';
import {Camera, useCameraDevices} from 'react-native-vision-camera';
import { database } from '../../db';
import { playSymbolAudio } from '../services/audioService';
import { incrementUsage } from '../services/usageTracker';
import { dialogEngine, LLMSuggestionResponse } from '../services/dialogEngine';
import { SymbolButton } from '../components/SymbolButton';
import SymbolVideoPlayer from '../components/SymbolVideoPlayer';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
// LLM Hint: Use a status enum for async operations instead of multiple booleans.
// This creates a clear state machine ('idle' -> 'loading' -> 'success'/'error').
type SuggestionStatus = 'idle' | 'loading' | 'success' | 'error';
import { getSymbolLabelForGesture } from '../components/gestureMap';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices } from '../context/AppServicesProvider';
import { Profile, Symbol } from '../../db/models';
import MaintenanceBanner from "../components/MaintenanceBanner";
import { useTensorflowModel } from '../hooks/useTensorflowModel';
import {recordInteraction} from "../services/adaptiveLearningService";
type Props = NativeStackScreenProps<RootStackParamList, 'Learning'>;

const enhance = withObservables<
  Props,
  { profile: Observable<Profile>; vocabulary: Observable<Symbol[]> }
>(['route'], ({ route }) => ({
  profile: database.get<Profile>('profiles').findAndObserve(route.params.profileId),
  vocabulary: database
    .get<Profile>('profiles')
    .findAndObserve(route.params.profileId)
    .pipe(
      switchMap(p => p.activeVocabularySet.observe()),
      switchMap(activeSet =>
        activeSet
          ? // @ts-ignore WatermelonDB join clause
            database
              .get<Symbol>('symbols')
              .query({ on: 'vocabulary_set_symbols', where: { vocabulary_set_id: (activeSet as any).id } } as any)
              .observe()
          : new BehaviorSubject<Symbol[]>([]),
      ),
    ),
}));

const LearningScreen = ({ profile, vocabulary, navigation }: { profile: Profile, vocabulary: Symbol[], navigation: Props['navigation'] }) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol | null>(null);
  const [videoPaused, setVideoPaused] = useState(false);
  const [showDgsVideo, setShowDgsVideo] = useState(false);
  const [adaptiveSuggestions, setAdaptiveSuggestions] = useState<Symbol[]>([]);
  const [llmSuggestions, setLlmSuggestions] = useState<LLMSuggestionResponse | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const [showMaintenance, setShowMaintenance] = useState(false);

  const { mlService } = useServices();
  const landmarkModel = useTensorflowModel(
    require('../../assets/models/hand_landmarker.tflite'),
  );
  const gestureModel = useTensorflowModel(
    require('../../assets/models/gesture_classifier.tflite'),
    true,
  );

  useEffect(() => {
    if (landmarkModel && gestureModel) {
      mlService
        .loadModels(landmarkModel, gestureModel)
        .catch(e => console.error('Model load error', e));
    }
  }, [landmarkModel, gestureModel]);

  // Gesture models are loaded by the mlService
  const devices = useCameraDevices('wide-angle-camera');
  const device = devices.back;
  const isFocused = useIsFocused();
  const appState = AppState.currentState;
  const canRunCamera = device != null && isCameraActive && isFocused && appState === 'active';

  const handlePress = async (symbol: Symbol) => {
    setSelectedSymbol(symbol);
    setVideoPaused(false);
    await playSymbolAudio({ id: symbol.id, label: symbol.name });
    await incrementUsage(symbol, profile.id);
    const trigger = await recordInteraction(symbol.id, true);
    if (trigger) setShowMaintenance(true);

    // LLM Hint: This is how to use the status state machine for an async operation.
    setSuggestionStatus('loading');
    try {
      const [adaptive, llm] = await Promise.all([
        dialogEngine.getAdaptiveSuggestions(vocabulary, profile.id, symbol),
        dialogEngine.getLLMSuggestions({
          input: symbol.name,
          context: symbol.contextTags,
          language: 'de',
          age: 4,
        }),
      ]);
      setAdaptiveSuggestions(adaptive as Symbol[]);
      setLlmSuggestions(llm);
      setSuggestionStatus('success');
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
      setSuggestionStatus('error');
    }
  };

  const frameProcessor = mlService.classifyGesture((result: any) => {
    if (result && result.confidence > 0.85 && result.label !== lastGesture) {
      const recognizedSymbolLabel = getSymbolLabelForGesture(result.label);
      const foundSymbol = vocabulary.find(s => s.name === recognizedSymbolLabel);
      if (foundSymbol) {
        handlePress(foundSymbol);
        setLastGesture(result.label);
        setTimeout(() => setLastGesture(null), 2000);
      }
    }
  });

  if (!profile || !vocabulary) {
    return <View style={styles.container}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {canRunCamera && <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} frameProcessor={frameProcessor} frameProcessorFps={5}/>} 
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{profile.name}'s Vokabular</Text>
        <Pressable
          onPress={() => navigation.navigate('Admin', { profileId: profile.id })}
          accessibilityLabel="Admin Einstellungen"
        >
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
          <View style={styles.toggleContainer}>
            <Text>DGS Video anzeigen</Text>
            <Switch
              value={showDgsVideo}
              onValueChange={setShowDgsVideo}
              accessibilityLabel="DGS-Video anzeigen"
            />
          </View>
          {showDgsVideo ? (
            <DgsVideoPlayer
              videoSource={
                selectedSymbol.dgsVideoAssetPath
                  ? { uri: selectedSymbol.dgsVideoAssetPath }
                  : require(`../assets/videos/dgs/${selectedSymbol.id}.mp4`)
              }
              shouldPlay={!videoPaused}
            />
          ) : (
            <SymbolVideoPlayer
              entry={{
                id: selectedSymbol.id,
                label: selectedSymbol.name,
                videoUri: selectedSymbol.videoAssetPath,
                dgsVideoUri: selectedSymbol.dgsVideoAssetPath,
              }}
              paused={videoPaused}
              useDgs={false}
              onEnd={() => setVideoPaused(true)}
            />
          )}
          <Pressable
            style={styles.repeatButton}
            onPress={() => handlePress(selectedSymbol)}
            accessibilityLabel="Zeige Symbol erneut"
          >
            <Text style={styles.buttonText}>🔁 Wiederholen</Text>
          </Pressable>
          <View style={styles.suggestionsContainer}>
            {suggestionStatus === 'loading' && <ActivityIndicator style={{ marginVertical: 10 }} />}
            {suggestionStatus === 'error' && <Text style={{ color: 'red' }}>Fehler beim Laden der Vorschläge.</Text>}
            {suggestionStatus === 'success' && (
              <>
                {adaptiveSuggestions.length > 0 && (
                  <>
                    <Text style={styles.suggestionsTitle}>Vielleicht auch?</Text>
                    <View style={styles.suggestionsList}>
                      {adaptiveSuggestions.map(s => (
                        <SymbolButton key={s.id} symbol={s} onPress={handlePress} />
                      ))}
                    </View>
                  </>
                )}
                {llmSuggestions && llmSuggestions.nextWords.length > 0 && (
                  <>
                    <Text style={styles.suggestionsTitle}>Ideen (KI)</Text>
                    <Text style={styles.nextWordsText}>{llmSuggestions.nextWords.join(', ')}</Text>
                    {llmSuggestions.caregiverPhrases.map((p, idx) => (
                      <Text key={idx} style={styles.caregiverPhrase}>{p}</Text>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        </View>
      )}

      <View style={styles.cameraToggle}>
        <Text>Gesten erkennen</Text>
        <Switch
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={isCameraActive ? '#f5dd4b' : '#f4f3f4'}
            onValueChange={() => setIsCameraActive(prev => !prev)}
            value={isCameraActive}
            accessibilityLabel="Gestenerkennung"
        />
      </View>
      {showMaintenance && (
        <MaintenanceBanner
          onPractice={() => {
            setShowMaintenance(false);
            navigation.navigate('Training');
          }}
        />
      )}
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
  suggestionsList: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  nextWordsText: { textAlign: 'center', marginBottom: 4 },
  caregiverPhrase: { textAlign: 'center' },
  toggleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
});

const EnhancedLearningScreen = enhance(LearningScreen);
export default EnhancedLearningScreen as React.ComponentType<any>;
