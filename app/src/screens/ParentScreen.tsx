import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Switch } from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { useServices } from '../context/ServicesContext';
import { COLORS, SPACING } from '../constants/ui';

export default function ParentScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  useServices();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [useDgs, setUseDgs] = useState(false);

  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, marginBottom: SPACING.lg },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
      width: '80%',
    },
    toggleLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Elternbereich</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Kamera aktiv</Text>
        <Switch
          value={isCameraActive}
          onValueChange={(value) => setIsCameraActive(value)}
          accessibilityLabel="Kamera umschalten"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>DGS-Video anzeigen</Text>
        <Switch
          value={useDgs}
          onValueChange={setUseDgs}
          accessibilityLabel="DGS-Video zeigen"
        />
      </View>
      <Button
        title="Profilverwaltung"
        onPress={() => navigation.navigate('ProfileManager')}
        accessibilityLabel="Profilverwaltung"
      />
      <Button
        title="Zugangsprüfung"
        onPress={() => navigation.navigate('ParentalGate', { target: 'Parent' })}
        accessibilityLabel="Zugangsprüfung"
      />
      <Button
        title="Verwaltung"
        onPress={() => navigation.navigate('Admin')}
        accessibilityLabel="Verwaltung"
      />
      <Button
        title="Analysen"
        onPress={() => navigation.navigate('Dashboard')}
        accessibilityLabel="Analysen ansehen"
      />
      <Button
        title="Übungsplaner"
        onPress={() => navigation.navigate('PracticeScheduler')}
        accessibilityLabel="Übungsplaner"
      />
      <Button
        title="Lernfortschritt"
        onPress={() => navigation.navigate('CaregiverReport')}
        accessibilityLabel="Lernfortschritt ansehen"
      />
      <Button
        title="Fortschritt"
        onPress={() => navigation.navigate('Progress')}
        accessibilityLabel="Fortschritt ansehen"
      />
      <Button
        title="Hilfe"
        onPress={() => navigation.navigate('Help')}
        accessibilityLabel="Hilfe erhalten"
      />
      <Button
        title="Geringe Sicherheit simulieren"
        onPress={() => navigation.navigate('Recognition', { simulateLowConfidence: true })}
        accessibilityLabel="Geringe Sicherheit simulieren"
      />
      <Button
        title="Menü"
        onPress={() => navigation.navigate('Parent')}
        accessibilityLabel="Menü öffnen"
      />
      <Button
        title="Erkennen"
        onPress={() => navigation.navigate('Recognition')}
        accessibilityLabel="Zum Erkennungsmodus"
      />
      <Button title="Zurück" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
    </View>
  );
}
