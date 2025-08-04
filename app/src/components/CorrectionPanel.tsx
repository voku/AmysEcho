import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useAccessibility } from './AccessibilityContext';

interface CorrectionPanelProps {
  onSelect: (choiceId: string) => void;
  onAddNew: () => void;
  onCancel: () => void;
  suggestions: { id: string; label: string }[];
}

export default function CorrectionPanel({ onSelect, onAddNew, onCancel, suggestions }: CorrectionPanelProps) {
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
      borderRadius: 16,
      padding: 16,
      margin: 16,
      maxWidth: '90%',
      maxHeight: '80%',
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? '#fff' : 'transparent',
    },
    title: {
      fontSize: largeText ? 28 : 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 16,
      color: highContrast ? '#fff' : '#333',
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    optionButton: {
      width: '48%',
      backgroundColor: highContrast ? '#333' : '#F3F4F6',
      borderRadius: 8,
      padding: 16,
      marginBottom: 8,
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
      marginBottom: 8,
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
      marginTop: 16,
    },
    actionButton: {
      backgroundColor: '#3B82F6',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderRadius: 8,
      minWidth: 104,
    },
    actionButtonSecondary: {
      backgroundColor: highContrast ? '#666' : '#6B7280',
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
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.optionButton}
                onPress={() => onSelect(s.id)}
                accessibilityLabel={`Select ${s.label}`}
              >
                <Text style={styles.optionLabel}>{s.label}</Text>
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
