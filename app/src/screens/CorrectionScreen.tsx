import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { logCorrection } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';

export default function CorrectionScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
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
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Which sign was this?</Text>
      <View style={styles.buttonRow}>
        <Button title="Choice 1" onPress={() => handleSelect('1')} />
        <Button title="Choice 2" onPress={() => handleSelect('2')} />
        <Button title="Choice 3" onPress={() => handleSelect('3')} />
        <Button title="Choice 4" onPress={() => handleSelect('4')} />
      </View>
    </View>
  );
}
