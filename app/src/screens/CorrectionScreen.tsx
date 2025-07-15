import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CorrectionScreen({ navigation }: any) {
  const [visible, setVisible] = useState(true);

  const handleSelect = async (choice: string) => {
    await AsyncStorage.setItem(`correction-${Date.now()}`, choice);
    setVisible(false);
    navigation.goBack();
  };

  const handleClose = () => {
    setVisible(false);
    navigation.goBack();
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Which sign was this?</Text>
          <View style={styles.grid}>
            {['1', '2', '3', '4'].map((c) => (
              <TouchableOpacity
                key={c}
                style={styles.choice}
                onPress={() => handleSelect(c)}
              >
                <Text style={styles.choiceText}>{`Choice ${c}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  title: { fontSize: 20, marginBottom: 20, textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  choice: {
    width: '48%',
    padding: 20,
    marginBottom: 10,
    backgroundColor: '#eee',
    borderRadius: 10,
    alignItems: 'center',
  },
  choiceText: { fontSize: 18 },
});
