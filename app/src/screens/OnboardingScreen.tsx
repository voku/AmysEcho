import React, { useState } from 'react';
import { View, Text, Switch, Button, StyleSheet, SafeAreaView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createProfile } from '../storage';
import {
  availableVocabularySets,
  setActiveVocabularySet,
} from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';

export default function OnboardingScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [consentDataUpload, setConsentDataUpload] = useState(false);
  const [consentHelpMeGetSmarter, setConsentHelpMeGetSmarter] = useState(false);
  const [vocabSet, setVocabSet] = useState('basic');
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const { update } = useAccessibility();

  const handleContinue = async () => {
    const profile = await createProfile({
      name: name || 'Amy',
      consentDataUpload,
      consentHelpMeGetSmarter,
      vocabularySetId: vocabSet,
      largeText,
      highContrast,
    });
    setActiveVocabularySet(vocabSet);
    update({ largeText, highContrast });
    navigation.replace('Recognition', { profileId: profile.id });
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
      backgroundColor: 'transparent',
    },
    input: {
      borderWidth: 1,
      padding: SPACING.sm,
      marginBottom: SPACING.lg,
      width: '100%',
      backgroundColor: COLORS.surface,
      borderRadius: RADIUS,
    },
    heart: { fontSize: largeText ? 80 : 64, textAlign: 'center', marginBottom: SPACING.lg, color: highContrast ? COLORS.highContrastText : COLORS.text },
    title: { fontSize: largeText ? 32 : 24, textAlign: 'center', marginBottom: SPACING.lg, color: highContrast ? COLORS.highContrastText : COLORS.text },
    toggleRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.lg,
    },
    label: { fontSize: largeText ? 22 : 18, color: highContrast ? COLORS.highContrastText : COLORS.text },
    switch: { transform: [{ scaleX: 1.5 }, { scaleY: 1.5 }] },
    setRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginBottom: SPACING.lg },
  });

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
    <SafeAreaView style={styles.container}>
      <Text style={styles.heart}>❤️</Text>
      <Text style={styles.title}>Welcome to Amy's Echo</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
        accessibilityLabel="Profilname"
      />
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Allow data upload</Text>
        <Switch
          value={consentDataUpload}
          onValueChange={setConsentDataUpload}
          style={styles.switch}
          accessibilityLabel="Datenupload erlauben"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Help me get smarter</Text>
        <Switch
          value={consentHelpMeGetSmarter}
          onValueChange={setConsentHelpMeGetSmarter}
          style={styles.switch}
          accessibilityLabel="Lernfunktion aktivieren"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Large text</Text>
        <Switch
          value={largeText}
          onValueChange={setLargeText}
          style={styles.switch}
          accessibilityLabel="Große Schrift"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>High contrast</Text>
        <Switch
          value={highContrast}
          onValueChange={setHighContrast}
          style={styles.switch}
          accessibilityLabel="Hoher Kontrast"
        />
      </View>
      <View style={styles.setRow}>
        {availableVocabularySets.map((s) => (
          <Button
            key={s.id}
            title={s.label}
            onPress={() => setVocabSet(s.id)}
            color={vocabSet === s.id ? COLORS.primaryAccent : undefined}
            accessibilityLabel={`Vokabular ${s.label} auswählen`}
          />
        ))}
      </View>
      <Button
        title="Continue"
        onPress={handleContinue}
        accessibilityLabel="Einrichtung abschließen"
      />
    </SafeAreaView>
    </LinearGradient>
  );
}

