import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
      backgroundColor: 'transparent',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: 16,
      color: highContrast ? '#fff' : '#333',
    },
    buttonRow: {
      width: '80%',
      flexWrap: 'wrap',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 16,
    },
    choiceButton: {
      width: '48%',
      backgroundColor: '#3B82F6',
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 8,
    },
    choiceButtonHC: {
      backgroundColor: '#000',
      borderWidth: 1,
      borderColor: '#fff',
    },
    choiceButtonText: {
      color: '#fff',
      fontSize: largeText ? 20 : 16,
      fontWeight: 'bold',
    },
  });

  const gradientColors = highContrast ? (['#000', '#000'] as const) : (['#EFF6FF', '#F3F4F6'] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Which sign was this?</Text>
        <View style={styles.buttonRow}>
          {suggestions.map((s: string) => (
            <Pressable
              key={s}
              style={[styles.choiceButton, highContrast && styles.choiceButtonHC]}
              onPress={() => handleSelect(s)}
              accessibilityRole="button"
              accessibilityLabel={s}
            >
              <Text style={styles.choiceButtonText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
