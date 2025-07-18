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
import { Alert } from 'react-native';
import {
  loadOpenAIApiKey,
  saveOpenAIApiKey,
  saveCustomModelUri,
} from '../storage';
import * as FileSystem from 'expo-file-system';
import { database } from '../../db';
import { Symbol as DBSymbol } from '../../db/models';

export default function AdminScreen({ navigation }: any) {
  const [symbols, setSymbols] = useState<DBSymbol[]>([]);
  const [editing, setEditing] = useState<DBSymbol | null>(null);
  const [label, setLabel] = useState('');
  const [id, setId] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');

  React.useEffect(() => {
    const sub = database
      .get<DBSymbol>('symbols')
      .query()
      .observe()
      .subscribe(setSymbols);
    loadOpenAIApiKey().then((k) => {
      if (k) setApiKey(k);
    });
    return () => sub.unsubscribe();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setId('');
    setLabel('');
    setModalVisible(true);
  };

  const openEdit = (sym: DBSymbol) => {
    setEditing(sym);
    setId(sym.id);
    setLabel(sym.name);
    setModalVisible(true);
  };

  const handleSave = async () => {
    await database.write(async () => {
      const collection = database.get<DBSymbol>('symbols');
      if (editing) {
        await editing.update((s) => {
          s.name = label;
        });
      } else {
        await collection.create((s) => {
          if (id) (s as any)._raw.id = id;
          s.name = label;
          s.category = 'custom';
          s.iconName = '';
          s.videoAssetPath = '';
          (s as any).dgsVideoAssetPath = '';
          s.priority = 1;
          s.isActive = true;
          s.healthScore = 100;
          s.color = '#FFFFFF';
          s.emoji = '❓';
          s.createdAt = new Date();
        });
      }
    });
    setModalVisible(false);
  };

  const handleSaveApiKey = async () => {
    await saveOpenAIApiKey(apiKey);
  };

  const handleDownloadModel = async () => {
    try {
      const uri = FileSystem.documentDirectory + 'custom_model.tflite';
      const res = await FileSystem.downloadAsync(
        'http://localhost:5000/latest-model',
        uri,
        { headers: { Authorization: 'Bearer secret' } },
      );
      await saveCustomModelUri(res.uri);
      Alert.alert('Model downloaded');
    } catch (e) {
      console.error(e);
      Alert.alert('Download failed');
    }
  };

  const handleDelete = (sym: DBSymbol) => {
    Alert.alert('Symbol löschen', `"${sym.name}" wirklich entfernen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'OK',
        onPress: async () => {
          await database.write(async () => {
            await sym.destroyPermanently();
          });
        },
      },
    ]);
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
            <Text>{item.name}</Text>
            <Button
              title="Bearbeiten"
              onPress={() => openEdit(item)}
              accessibilityLabel={`Bearbeite ${item.name}`}
            />
            <Button
              title="Löschen"
              onPress={() => handleDelete(item)}
              accessibilityLabel={`Lösche ${item.name}`}
            />
          </View>
        )}
      />
      <TextInput
        style={styles.apiInput}
        placeholder="OpenAI API Key"
        value={apiKey}
        onChangeText={setApiKey}
        accessibilityLabel="OpenAI API Key"
      />
      <Button
        title="Save API Key"
        onPress={handleSaveApiKey}
        accessibilityLabel="OpenAI API-Schlüssel speichern"
      />
      <Button
        title="Download Latest Model"
        onPress={handleDownloadModel}
        accessibilityLabel="Neueste Modellversion herunterladen"
      />
      <Button title="Add Symbol" onPress={openAdd} accessibilityLabel="Symbol hinzufügen" />
      <Button
        title="Training"
        onPress={() => navigation.navigate('Training')}
        accessibilityLabel="Trainingsmodus öffnen"
      />
      <Button title="Back" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modal}>
          <TextInput
            style={styles.input}
            placeholder="ID"
            value={id}
            onChangeText={setId}
            accessibilityLabel="Symbol ID"
          />
          <TextInput
            style={styles.input}
            placeholder="Label"
            value={label}
            onChangeText={setLabel}
            accessibilityLabel="Symbol Label"
          />
          <Button title="Save" onPress={handleSave} accessibilityLabel="Symbol speichern" />
          <Button title="Cancel" onPress={() => setModalVisible(false)} accessibilityLabel="Abbrechen" />
        </View>
      </Modal>
    </View>
  );
}
