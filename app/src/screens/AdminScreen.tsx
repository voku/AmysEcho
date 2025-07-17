import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
} from 'react-native';
import { gestureModel, GestureModelEntry } from '../model';
import { loadOpenAIApiKey, saveOpenAIApiKey } from '../storage';

export default function AdminScreen({ navigation }: any) {
  const [symbols, setSymbols] = useState<GestureModelEntry[]>([
    ...gestureModel.gestures,
  ]);
  const [editing, setEditing] = useState<GestureModelEntry | null>(null);
  const [label, setLabel] = useState('');
  const [id, setId] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');

  React.useEffect(() => {
    loadOpenAIApiKey().then((k) => {
      if (k) setApiKey(k);
    });
  }, []);

  const openAdd = () => {
    setEditing(null);
    setId('');
    setLabel('');
    setModalVisible(true);
  };

  const openEdit = (sym: GestureModelEntry) => {
    setEditing(sym);
    setId(sym.id);
    setLabel(sym.label);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (editing) {
      setSymbols((prev) =>
        prev.map((s) => (s.id === editing.id ? { id, label } : s)),
      );
    } else {
      const newSym = { id: id || Date.now().toString(), label };
      setSymbols((prev) => [...prev, newSym]);
    }
    setModalVisible(false);
  };

  const handleSaveApiKey = async () => {
    await saveOpenAIApiKey(apiKey);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 24, marginBottom: 20, textAlign: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    modal: { flex: 1, justifyContent: 'center', padding: 20 },
    input: { borderWidth: 1, padding: 8, marginBottom: 12 },
    apiInput: { borderWidth: 1, padding: 8, marginVertical: 12 },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Panel</Text>
      <FlatList
        data={symbols}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text>{item.label}</Text>
            <Button title="Edit" onPress={() => openEdit(item)} />
          </View>
        )}
      />
      <TextInput
        style={styles.apiInput}
        placeholder="OpenAI API Key"
        value={apiKey}
        onChangeText={setApiKey}
      />
      <Button title="Save API Key" onPress={handleSaveApiKey} />
      <Button title="Add Symbol" onPress={openAdd} />
      <Button title="Training" onPress={() => navigation.navigate('Training')} />
      <Button title="Back" onPress={() => navigation.goBack()} />

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modal}>
          <TextInput
            style={styles.input}
            placeholder="ID"
            value={id}
            onChangeText={setId}
          />
          <TextInput
            style={styles.input}
            placeholder="Label"
            value={label}
            onChangeText={setLabel}
          />
          <Button title="Save" onPress={handleSave} />
          <Button title="Cancel" onPress={() => setModalVisible(false)} />
        </View>
      </Modal>
    </View>
  );
}
