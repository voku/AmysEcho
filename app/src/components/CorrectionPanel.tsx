import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useAccessibility } from './AccessibilityContext';

interface CorrectionPanelProps {
  onSelect: (choice: string) => void;
  onAddNew: () => void;
  onCancel: () => void;
}

const CORRECTION_OPTIONS = [
  { id: 'hello', label: '👋 Hello', description: 'Greeting' },
  { id: 'thank_you', label: '🙏 Thank You', description: 'Gratitude' },
  { id: 'please', label: '🥺 Please', description: 'Request' },
  { id: 'more', label: '➕ More', description: 'Want more' },
  { id: 'finished', label: '✅ Finished', description: 'All done' },
  { id: 'water', label: '💧 Water', description: 'Drink' },
  { id: 'eat', label: '🍽️ Eat', description: 'Food' },
  { id: 'play', label: '🎮 Play', description: 'Fun time' },
  { id: 'help', label: '🆘 Help', description: 'Need assistance' },
  { id: 'yes', label: '✅ Yes', description: 'Agree' },
  { id: 'no', label: '❌ No', description: 'Disagree' },
];

export default function CorrectionPanel({ onSelect, onAddNew, onCancel }: CorrectionPanelProps) {
  const { largeText, highContrast } = useAccessibility();

  const styles = StyleSheet.create({
    modal: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    container: {
      backgroundColor: highContrast ? '#000' : '#fff',
      borderRadius: 20,
      padding: 20,
      margin: 20,
      maxWidth: '90%',
      maxHeight: '80%',
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? '#fff' : 'transparent',
    },
    title: {
      fontSize: largeText ? 28 : 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 20,
      color: highContrast ? '#fff' : '#333',
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    optionButton: {
      width: '48%',
      backgroundColor: highContrast ? '#333' : '#f0f0f0',
      borderRadius: 15,
      padding: 15,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? '#fff' : 'transparent',
    },
    optionButtonPressed: {
      backgroundColor: highContrast ? '#555' : '#e0e0e0',
    },
    optionLabel: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 5,
      color: highContrast ? '#fff' : '#333',
    },
    optionDescription: {
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
      color: highContrast ? '#ccc' : '#666',
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 20,
    },
    actionButton: {
      backgroundColor: '#007AFF',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 10,
      minWidth: 100,
    },
    actionButtonSecondary: {
      backgroundColor: highContrast ? '#666' : '#8E8E93',
    },
    actionButtonText: {
      color: '#fff',
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modal}>
        <View style={styles.container}>
          <Text style={styles.title}>What did Amy sign?</Text>

          <View style={styles.optionsGrid}>
            {CORRECTION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.optionButton}
                onPress={() => onSelect(option.id)}
                accessibilityLabel={`Select ${option.label}`}
                accessibilityHint={option.description}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={onCancel}
              accessibilityLabel="Cancel correction"
            >
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={onAddNew}
              accessibilityLabel="Add new gesture"
            >
              <Text style={styles.actionButtonText}>Add New</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
