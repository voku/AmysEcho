import React, { useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadProfiles, setActiveProfileId, loadProfile, Profile } from '../storage';
import { Profile as DBProfile } from '../../db/models';
import { useAccessibility } from '../components/AccessibilityContext';
import { database } from '../../db';
import { COLORS, SPACING } from '../constants/ui';

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

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Profil löschen',
      'Möchtest du dieses Profil wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          onPress: async () => {
            await database.write(async () => {
              const profileToDelete = await database.get<DBProfile>('profiles').find(id);
              await profileToDelete.destroyPermanently();
            });
            setProfiles(profiles.filter(p => p.id !== id));
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    container: { flex: 1, padding: SPACING.lg, backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface },
    title: { fontSize: largeText ? 28 : 24, marginBottom: SPACING.lg, textAlign: 'center', color: highContrast ? COLORS.highContrastText : COLORS.text },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
    name: { fontSize: largeText ? 22 : 18, color: highContrast ? COLORS.highContrastText : COLORS.text },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Button
              title="Auswählen"
              onPress={() => handleSelect(item.id)}
              accessibilityLabel={`Profil ${item.name} auswählen`}
            />
            <Button
              title="Löschen"
              onPress={() => handleDelete(item.id)}
              accessibilityLabel={`Profil ${item.name} löschen`}
            />
          </View>
        )}
      />
      <Button
        title="Neues Profil"
        onPress={() => navigation.navigate('Onboarding')}
        accessibilityLabel="Neues Profil anlegen"
      />
    </View>
  );
}

