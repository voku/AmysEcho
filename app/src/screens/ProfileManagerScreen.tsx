import React, { useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadProfiles, setActiveProfileId, loadProfile, Profile } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';

export default function ProfileManagerScreen({ navigation }: any) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { largeText, highContrast, update } = useAccessibility();

  useFocusEffect(
    React.useCallback(() => {
      loadProfiles().then(setProfiles);
    }, []),
  );

  const handleSelect = async (id: string) => {
    await setActiveProfileId(id);
    const profile = await loadProfile(id);
    if (profile) {
      update({
        largeText: !!profile.largeText,
        highContrast: !!profile.highContrast,
      });
    }
    navigation.navigate('Recognition', { profileId: id });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: highContrast ? '#000' : '#fdfdfd' },
    title: { fontSize: largeText ? 28 : 24, marginBottom: 20, textAlign: 'center', color: highContrast ? '#fff' : '#000' },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    name: { fontSize: largeText ? 22 : 18, color: highContrast ? '#fff' : '#000' },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profiles</Text>
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Button title="Select" onPress={() => handleSelect(item.id)} />
          </View>
        )}
      />
      <Button
        title="New Profile"
        onPress={() => navigation.navigate('Onboarding')}
        accessibilityLabel="Neues Profil anlegen"
      />
    </View>
  );
}

