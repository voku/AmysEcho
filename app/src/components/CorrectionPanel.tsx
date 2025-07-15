import React from 'react';
import { Modal, View, Button, StyleSheet } from 'react-native';
import { gestureModel } from '../model';

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
  const options = gestureModel.gestures.slice(0, 4);
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
            {options.slice(0, 2).map((g) => (
              <Button key={g.id} title={g.label} onPress={() => onSelect(g.id)} />
            ))}
          </View>
          <View style={styles.row}>
            {options.slice(2, 4).map((g) => (
              <Button key={g.id} title={g.label} onPress={() => onSelect(g.id)} />
            ))}
          </View>
          <View style={styles.row}>
            <Button title="None of these" onPress={onAddNew} />
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
