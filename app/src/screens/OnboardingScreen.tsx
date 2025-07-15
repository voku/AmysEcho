import React, { useState } from 'react';
import { View, Text, Switch, Button, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function OnboardingScreen({ navigation }: any) {
  const [consentDataUpload, setConsentDataUpload] = useState(false);
  const [consentHelpMeGetSmarter, setConsentHelpMeGetSmarter] = useState(false);

  const handleContinue = async () => {
    await AsyncStorage.setItem(
      'profile',
      JSON.stringify({
        consentDataUpload,
        consentHelpMeGetSmarter,
      }),
    );
    navigation.replace('Recognition');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Amy's Echo</Text>
      <View style={styles.row}>
        <Text>Allow data upload</Text>
        <Switch
          value={consentDataUpload}
          onValueChange={setConsentDataUpload}
        />
      </View>
      <View style={styles.row}>
        <Text>Help me get smarter</Text>
        <Switch
          value={consentHelpMeGetSmarter}
          onValueChange={setConsentHelpMeGetSmarter}
        />
      </View>
      <Button title="Continue" onPress={handleContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
});
