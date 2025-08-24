import React, { useEffect, useState } from 'react';
import { View, Button, StyleSheet, Text } from 'react-native';
import { SPACING } from '../constants/ui';
import { loadProfile, Profile } from '../storage';

export default function ProfileSelectScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: { fontSize: 24, marginBottom: SPACING.lg },
    row: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.lg },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Was möchtest du tun?</Text>
      <View style={styles.row}>
        <Button
          title="Zuhören"
          onPress={() => profile && navigation.navigate('Recognition', { profileId: profile.id })}
          accessibilityLabel="Zum Erkennungsmodus"
          disabled={!profile}
        />
        <Button
          title="Lernen"
          onPress={() => navigation.navigate('Training', { gestureLabel: undefined })}
          accessibilityLabel="Zum Lernmodus"
        />
      </View>
      <View style={styles.row}>
        <Button
          title="Eltern"
          onPress={() => navigation.navigate('ParentalGate', { target: 'Parent' })}
          accessibilityLabel="Elternprofil"
        />
        <Button
          title="Admin"
          onPress={() => navigation.navigate('ParentalGate', { target: 'Admin' })}
          accessibilityLabel="Adminbereich"
        />
        <Button
          title="Profile verwalten"
          onPress={() => navigation.navigate('ProfileManager')}
          accessibilityLabel="Profile verwalten"
        />
      </View>
    </View>
  );
}
