import React, { useState } from 'react';
import { View, Text, Switch, Button, StyleSheet, SafeAreaView } from 'react-native';
import { saveProfile, Profile } from '../storage';
import {
  availableVocabularySets,
  setActiveVocabularySet,
} from '../model';

export default function OnboardingScreen({ navigation }: any) {
  const [consentDataUpload, setConsentDataUpload] = useState(false);
  const [consentHelpMeGetSmarter, setConsentHelpMeGetSmarter] = useState(false);
  const [vocabSet, setVocabSet] = useState('basic');
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const handleContinue = async () => {
    const profile: Profile = {
      id: 'default',
      consentDataUpload,
      consentHelpMeGetSmarter,
      vocabularySetId: vocabSet,
      largeText,
      highContrast,
    };
    await saveProfile(profile);
    setActiveVocabularySet(vocabSet);
    navigation.replace('Recognition');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: highContrast ? '#000' : '#fdfdfd',
    },
    heart: { fontSize: largeText ? 80 : 64, textAlign: 'center', marginBottom: 20, color: highContrast ? '#fff' : '#000' },
    title: { fontSize: largeText ? 32 : 24, textAlign: 'center', marginBottom: 20, color: highContrast ? '#fff' : '#000' },
    toggleRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    label: { fontSize: largeText ? 22 : 18, color: highContrast ? '#fff' : '#000' },
    switch: { transform: [{ scaleX: 1.5 }, { scaleY: 1.5 }] },
    setRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginBottom: 20 },
  });

  return (
    <SafeAreaView style={styles.container}>
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
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Large text</Text>
        <Switch
          value={largeText}
          onValueChange={setLargeText}
          style={styles.switch}
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>High contrast</Text>
        <Switch
          value={highContrast}
          onValueChange={setHighContrast}
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
    </SafeAreaView>
  );
}

