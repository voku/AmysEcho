import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Switch } from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { useServices } from '../context/AppServicesProvider';
import { COLORS, SPACING } from '../constants/ui';

export default function ParentScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { mlService } = useServices();
  const [isCameraActive, setIsCameraActive] = useState(mlService.isCameraActive);
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
      <Text style={styles.title}>Parent Screen</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Camera Active</Text>
        <Switch
          value={isCameraActive}
          onValueChange={(value) => {
            setIsCameraActive(value);
            mlService.setCameraActive(value);
          }}
          accessibilityLabel="Toggle camera"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Show DGS Video</Text>
        <Switch
          value={useDgs}
          onValueChange={setUseDgs}
          accessibilityLabel="DGS-Video zeigen"
        />
      </View>
      <Button
        title="Profile Manager"
        onPress={() => navigation.navigate('ProfileManager')}
        accessibilityLabel="Profilverwaltung"
      />
      <Button
        title="Parental Gate"
        onPress={() => navigation.navigate('ParentalGate', { target: 'Parent' })}
        accessibilityLabel="Zugangsprüfung"
      />
      <Button
        title="Admin"
        onPress={() => navigation.navigate('Admin')}
        accessibilityLabel="Verwaltung"
      />
      <Button
        title="Analytics"
        onPress={() => navigation.navigate('Dashboard')}
        accessibilityLabel="View analytics"
      />
      <Button
        title="Help"
        onPress={() => navigation.navigate('Help')}
        accessibilityLabel="Get help"
      />
      <Button
        title="Simulate Low Confidence"
        onPress={() => navigation.navigate('Recognition', { simulateLowConfidence: true })}
        accessibilityLabel="Simulate low confidence"
      />
      <Button
        title="Menu"
        onPress={() => navigation.navigate('Parent')}
        accessibilityLabel="Menü öffnen"
      />
      <Button
        title="Recognition"
        onPress={() => navigation.navigate('Recognition')}
        accessibilityLabel="Zum Erkennungsmodus"
      />
      <Button title="Back" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
    </View>
  );
}
