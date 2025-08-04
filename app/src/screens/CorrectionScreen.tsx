import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { logCorrection } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';

export default function CorrectionScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { suggestions } = route.params;

  const handleSelect = async (choice: string) => {
    await logCorrection(choice);
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: highContrast ? '#000' : '#fff',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: 20,
      color: highContrast ? '#fff' : '#000',
    },
    buttonRow: {
      width: '80%',
      flexWrap: 'wrap',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Which sign was this?</Text>
      <View style={styles.buttonRow}>
        {suggestions.map((s: string) => (
          <Button
            key={s}
            title={s}
            onPress={() => handleSelect(s)}
            accessibilityLabel={s}
          />
        ))}
      </View>
    </View>
  );
}
