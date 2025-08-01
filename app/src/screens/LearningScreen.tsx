import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, Pressable, AppState, StyleSheet, Switch, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import withObservables from '@nozbe/with-observables';
import { switchMap } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';
import type { Observable } from 'rxjs';
import { useIsFocused } from '@react-navigation/native';
import {Camera, useCameraDevices} from 'react-native-vision-camera';
import { database } from '../../db';
import { playSymbolAudio } from '../services';
import { incrementUsage } from '../services';
import { dialogEngine, LLMSuggestionResponse } from '../services';
import { SymbolButton } from '../components/SymbolButton';
import SymbolVideoPlayer from '../components/SymbolVideoPlayer';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
// LLM Hint: Use a status enum for async operations instead of multiple booleans.
// This creates a clear state machine ('idle' -> 'loading' -> 'success'/'error').
type SuggestionStatus = 'idle' | 'loading' | 'success' | 'error';
import { getSymbolLabelForGesture } from '../components/gestureMap';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useGestureClassifier } from '../services';
import { Profile, Symbol } from '../../db/models';
import MaintenanceBanner from "../components/MaintenanceBanner";
import {recordInteraction} from "../services/adaptiveLearningService";
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';
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
  const { highContrast } = useAccessibility();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol | null>(null);
  const [videoPaused, setVideoPaused] = useState(false);
  const [showDgsVideo, setShowDgsVideo] = useState(false);
  const [adaptiveSuggestions, setAdaptiveSuggestions] = useState<Symbol[]>([]);
  const [llmSuggestions, setLlmSuggestions] = useState<LLMSuggestionResponse | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const [showMaintenance, setShowMaintenance] = useState(false);

  const devices = useCameraDevices();
  const device = devices.back ?? devices.front ?? devices[0];
  const isFocused = useIsFocused();
  const appState = AppState.currentState;
  const canRunCamera = device != null && isCameraActive && isFocused && appState === 'active';

  const handlePress = async (symbol: Symbol) => {
    setSelectedSymbol(symbol);
    setVideoPaused(false);
    await playSymbolAudio({ id: symbol.id, label: symbol.name, audioUri: (symbol as any).audioUri });
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

  const onGestureResult = (result: any) => {
    if (result && result.confidence > 0.85 && result.label !== lastGesture) {
      const recognizedSymbolLabel = getSymbolLabelForGesture(result.label);
      const foundSymbol = vocabulary.find(s => s.name === recognizedSymbolLabel);
      if (foundSymbol) {
        handlePress(foundSymbol);
        setLastGesture(result.label);
        setTimeout(() => setLastGesture(null), 2000);
      }
    }
  };

  const frameProcessor = useGestureClassifier(onGestureResult, false);

  const styles = createStyles(highContrast);

  if (!profile || !vocabulary) {
    const gradientColors = highContrast ? (['#000', '#000'] as const) : (['#EFF6FF', '#F3F4F6'] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <ActivityIndicator size="large" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const gradientColors = highContrast ? (['#000', '#000'] as const) : (['#EFF6FF', '#F3F4F6'] as const);

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
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
                  : undefined
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
            navigation.navigate('Training', { profileId: profile.id });
          }}
        />
      )}
      <BottomNav active="symbols" profileId={profile.id} />
    </SafeAreaView>
    </LinearGradient>
  );
};

const createStyles = (highContrast: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: highContrast ? '#fff' : '#000' },
    adminButton: { fontSize: 24 },
    list: { alignItems: 'center', paddingTop: 10, paddingBottom: 200 },
    cameraToggle: { position: 'absolute', bottom: 100, alignSelf: 'center', padding: 15, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 20, elevation: 5, flexDirection: 'row', alignItems: 'center', gap: 10 },
    selectedSymbolContainer: { position: 'absolute', bottom: 150, left: 10, right: 10, alignItems: 'center', padding: 10, backgroundColor: 'white', borderRadius: 15, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    selectedSymbolLabel: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: highContrast ? '#fff' : '#000' },
    repeatButton: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#e0e0e0', borderRadius: 10 },
    buttonText: { fontWeight: 'bold' },
    suggestionsContainer: { marginTop: 15, width: '100%' },
    suggestionsTitle: { fontWeight: 'bold', fontSize: 16, textAlign: 'center', marginBottom: 5, color: highContrast ? '#fff' : '#000' },
    suggestionsList: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
    nextWordsText: { textAlign: 'center', marginBottom: 4, color: highContrast ? '#fff' : '#000' },
    caregiverPhrase: { textAlign: 'center', color: highContrast ? '#fff' : '#000' },
    toggleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  });

const EnhancedLearningScreen = enhance(LearningScreen);
export default EnhancedLearningScreen as React.ComponentType<any>;
