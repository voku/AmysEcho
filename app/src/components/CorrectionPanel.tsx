import React, { useRef, useEffect } from 'react';
import { Modal, View, Button, StyleSheet, Animated, Easing } from 'react-native';
import { gestureModel } from '../model';
import { useAccessibility } from './AccessibilityContext';

interface Props {
  visible: boolean;
  onSelect: (choice: string) => void;
  onClose: () => void;
  onAddNew: () => void;
}

export default function CorrectionPanel({
  visible,
  onSelect,
  onClose,
  onAddNew,
}: Props) {
  const { highContrast } = useAccessibility();
  const options = gestureModel.gestures.slice(0, 4);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible]);
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    panel: {
      backgroundColor: highContrast ? '#222' : '#fff',
      padding: 20,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.row}>
            {options.slice(0, 2).map((g) => (
              <Button
                key={g.id}
                title={g.label}
                onPress={() => onSelect(g.id)}
                accessibilityLabel={`Korrektur ${g.label}`}
              />
            ))}
          </View>
          <View style={styles.row}>
            {options.slice(2, 4).map((g) => (
              <Button
                key={g.id}
                title={g.label}
                onPress={() => onSelect(g.id)}
                accessibilityLabel={`Korrektur ${g.label}`}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Button
              title="None of these"
              onPress={onAddNew}
              accessibilityLabel="Keine dieser Optionen"
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
