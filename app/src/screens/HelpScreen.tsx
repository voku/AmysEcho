import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { COLORS, SPACING } from '../constants/ui';
import { loadProfile, Profile } from '../storage';
import BottomNav from '../components/BottomNav';

export default function HelpScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wie du Amy helfen kannst</Text>
      <Text style={styles.text}>
        Wenn Amy Schwierigkeiten hat, verstanden zu werden, kannst du Folgendes tun:
      </Text>
      <Text style={styles.text}>
        • Ermutige sie, die Geste erneut und vielleicht deutlicher zu zeigen.
      </Text>
      <Text style={styles.text}>
        • Wenn die App ein Korrekturfenster zeigt, wähle das richtige Symbol aus.
      </Text>
      <Text style={styles.text}>
        • Wenn die App wiederholt falsch erkennt, sieh dir den Bereich "Training" an, um neue Gesten hinzuzufügen oder bestehende zu verfeinern.
      </Text>
      <Text style={styles.text}>
        • Achte darauf, dass Amy in einem gut beleuchteten Bereich ist und ihre Hände für die Kamera klar sichtbar sind.
      </Text>
      <Button title="Zurück" onPress={() => navigation.goBack()} />
      {profile && <BottomNav active="parent" profileId={profile.id} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
    color: COLORS.text,
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: SPACING.sm,
    color: COLORS.textMuted,
  },
});