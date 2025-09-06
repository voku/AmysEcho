import React from 'react';
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Button, StyleSheet } from 'react-native';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { loadProfile, Profile } from '../storage';

export default function CaregiverReportScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileId = route?.params?.profileId;

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.lg,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    label: {
      fontSize: largeText ? 20 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lernfortschritt</Text>
      <FlatList
        data={gestureModel.gestures}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.label}>{item.label}</Text>
            <Button title="Details" onPress={() => navigation.navigate('ProgressChart', { gestureId: item.id })} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.label}>Keine Gesten verfügbar</Text>}
      />
      <Button title="Zurück" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
      {profile && <BottomNav active="parent" profileId={profile.id} />}
    </View>
  );
}
