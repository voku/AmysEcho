import React, { useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadProfiles, setActiveProfileId, Profile } from '../storage';

export default function ProfileManagerScreen({ navigation }: any) {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      loadProfiles().then(setProfiles);
    }, []),
  );

  const handleSelect = async (id: string) => {
    await setActiveProfileId(id);
    navigation.navigate('Recognition', { profileId: id });
  };

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
      <Button title="New Profile" onPress={() => navigation.navigate('Onboarding')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, marginBottom: 20, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  name: { fontSize: 18 },
});
