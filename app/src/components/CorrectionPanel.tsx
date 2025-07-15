import React from 'react';
import { Modal, View, Button, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  onSelect: (choice: string) => void;
  onClose: () => void;
}

export default function CorrectionPanel({ visible, onSelect, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.row}>
            <Button title="Choice 1" onPress={() => onSelect('1')} />
            <Button title="Choice 2" onPress={() => onSelect('2')} />
          </View>
          <View style={styles.row}>
            <Button title="Choice 3" onPress={() => onSelect('3')} />
            <Button title="Choice 4" onPress={() => onSelect('4')} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
});
