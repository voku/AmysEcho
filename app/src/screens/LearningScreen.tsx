import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Switch } from 'react-native';
import { GestureModelEntry, gestureModel } from '../model';
import { playSymbolAudio } from '../services/audioService';
import { incrementUsage } from '../services/usageTracker';
import { loadProfile, Profile } from '../storage';
import SymbolVideoPlayer from '../components/SymbolVideoPlayer';
import { getLLMSuggestions, LLMSuggestions } from '../services/dialogService';

export default function LearningScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [playing, setPlaying] = useState<GestureModelEntry | null>(null);
  const [videoPaused, setVideoPaused] = useState(true);
  const [useDgs, setUseDgs] = useState(false);
  const [suggestions, setSuggestions] = useState<LLMSuggestions | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const handlePress = async (entry: GestureModelEntry) => {
    await playSymbolAudio(entry);
    if (profile) {
      await incrementUsage(entry, profile.id);
    }
    setPlaying(entry);
    setVideoPaused(false);
    const adv = await getLLMSuggestions(entry.label);
    setSuggestions(adv);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, alignItems: 'center' },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    suggestion: { marginTop: 10, textAlign: 'center' },
  });

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text>Use DGS Video</Text>
        <Switch value={useDgs} onValueChange={setUseDgs} />
      </View>
      <FlatList
        data={gestureModel.gestures}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ margin: 10 }}>
            <Button title={item.label} onPress={() => handlePress(item)} />
          </View>
        )}
      />
      {playing && (
        <SymbolVideoPlayer
          entry={playing}
          paused={videoPaused}
          useDgs={useDgs}
          onEnd={() => setVideoPaused(true)}
        />
      )}
      {suggestions && suggestions.nextWords.length > 0 && (
        <View>
          <Text style={styles.suggestion}>Next words:</Text>
          {suggestions.nextWords.map((s, i) => (
            <Text key={i} style={styles.suggestion}>{s}</Text>
          ))}
        </View>
      )}
      {suggestions && suggestions.caregiverPhrases.length > 0 && (
        <View>
          <Text style={styles.suggestion}>Caregiver:</Text>
          {suggestions.caregiverPhrases.map((s, i) => (
            <Text key={i} style={styles.suggestion}>{s}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

