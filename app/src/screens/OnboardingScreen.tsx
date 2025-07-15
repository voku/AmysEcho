import React, { useState } from 'react';
import { View, Text, Switch, Button, StyleSheet } from 'react-native';
import { saveProfile, Profile } from '../storage';
import {
  availableVocabularySets,
  setActiveVocabularySet,
} from '../model';

export default function OnboardingScreen({ navigation }: any) {
  const [consentDataUpload, setConsentDataUpload] = useState(false);
  const [consentHelpMeGetSmarter, setConsentHelpMeGetSmarter] = useState(false);
  const [vocabSet, setVocabSet] = useState('basic');

  const handleContinue = async () => {
    const profile: Profile = {
      id: 'default',
      consentDataUpload,
      consentHelpMeGetSmarter,
      vocabularySetId: vocabSet,
    };
    await saveProfile(profile);
    setActiveVocabularySet(vocabSet);
    navigation.replace('Recognition');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heart}>❤️</Text>
      <Text style={styles.title}>Welcome to Amy's Echo</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Allow data upload</Text>
        <Switch
          value={consentDataUpload}
          onValueChange={setConsentDataUpload}
          style={styles.switch}
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Help me get smarter</Text>
        <Switch
          value={consentHelpMeGetSmarter}
          onValueChange={setConsentHelpMeGetSmarter}
          style={styles.switch}
        />
      </View>
      <View style={styles.setRow}>
        {availableVocabularySets.map((s) => (
          <Button
            key={s.id}
            title={s.label}
            onPress={() => setVocabSet(s.id)}
            color={vocabSet === s.id ? '#007aff' : undefined}
          />
        ))}
      </View>
      <Button title="Continue" onPress={handleContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  heart: { fontSize: 64, textAlign: 'center', marginBottom: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 20 },
  toggleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  label: { fontSize: 18 },
  switch: { transform: [{ scaleX: 1.5 }, { scaleY: 1.5 }] },
  setRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginBottom: 20 },
});
