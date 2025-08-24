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
  loadBackendApiToken,
  saveBackendApiToken,
  saveCustomModelUri,
  loadActiveProfileId,
} from '../storage';
import * as FileSystem from 'expo-file-system';
import { API_URL } from '../constants';
import { database } from '../../db';
import { useServices } from '../context/ServicesContext';
import { CUSTOM_GESTURE_MODEL_PATH } from '../constants/modelPaths';
import { CUSTOM_AUDIO_DIR, getCustomAudioPath } from '../constants/audioPaths';
import { Symbol as DBSymbol } from '../../db/models';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { logger } from '../utils/logger';
import { getLocalCentroidSummary } from '../services/localCentroids';

import { usePerformance } from '../context/PerformanceContext';

const SYMBOL_EXPORT_PATH = `${FileSystem.documentDirectory || ''}symbols-export.json`;

export default function AdminScreen({ navigation }: any) {
  const { audioService, backupService, gdprService } = useServices();
  const { isLowPerformanceMode, toggleLowPerformanceMode } = usePerformance();
  const [symbols, setSymbols] = useState<DBSymbol[]>([]);
  const [editing, setEditing] = useState<DBSymbol | null>(null);
  const [label, setLabel] = useState('');
  const [id, setId] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [backendToken, setBackendToken] = useState('');
  const [audioUri, setAudioUri] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [category, setCategory] = useState('');
  const [centroidSummary, setCentroidSummary] = useState<Record<string, number>>({});
  const [loadingSummary, setLoadingSummary] = useState(false);

  React.useEffect(() => {
    const sub = database
      .get<DBSymbol>('symbols')
      .query()
      .observe()
      .subscribe(setSymbols);
    loadOpenAIApiKey().then((k) => {
      if (k) setApiKey(k);
    });
    loadBackendApiToken().then((t) => {
      if (t) setBackendToken(t);
    });
    refreshCentroidSummary();
    return () => sub.unsubscribe();
  }, []);

  const refreshCentroidSummary = async () => {
    setLoadingSummary(true);
    try {
      const summary = await getLocalCentroidSummary();
      setCentroidSummary(summary);
    } catch (e) {
      logger.warn('Failed to refresh local centroid summary', e);
      Alert.alert('Centroid summary failed');
    } finally {
      setLoadingSummary(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setId('');
    setLabel('');
    setAudioUri('');
    setCategory('');
    setModalVisible(true);
  };

  const openEdit = (sym: DBSymbol) => {
    setEditing(sym);
    setId(sym.id);
    setLabel(sym.name);
    setAudioUri((sym as any).audioUri || '');
    setCategory(sym.category);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const targetId = id || editing?.id;
    let finalUri = audioUri;

    if (audioUri && targetId) {
      const dest = getCustomAudioPath(targetId);
      if (audioUri !== dest) {
        await FileSystem.makeDirectoryAsync(CUSTOM_AUDIO_DIR, { intermediates: true });
        try {
          await FileSystem.moveAsync({ from: audioUri, to: dest });
          finalUri = dest;
        } catch (e) {
          logger.error('move failed', e);
        }
      }
    }

    await database.write(async () => {
      const collection = database.get<DBSymbol>('symbols');
      if (editing) {
        await editing.update((s) => {
          s.name = label;
          s.category = category || 'custom';
          (s as any).audioUri = finalUri;
        });
      } else {
        await collection.create((s) => {
          if (id) (s as any)._raw.id = id;
          s.name = label;
          s.category = category || 'custom';
          s.iconName = '';
          s.videoAssetPath = '';
          (s as any).dgsVideoAssetPath = '';
          s.priority = 1;
          s.isActive = true;
          s.healthScore = 100;
          s.color = COLORS.surface;
          s.emoji = '❓';
          (s as any).audioUri = finalUri;
          s.createdAt = new Date();
        });
      }
    });
    setModalVisible(false);
  };

  const handleSaveApiKey = async () => {
    await saveOpenAIApiKey(apiKey);
  };

  const handleSaveBackendToken = async () => {
    await saveBackendApiToken(backendToken);
  };

  const handleDownloadModel = async () => {
    try {
      const uri = CUSTOM_GESTURE_MODEL_PATH;
      const token = await loadBackendApiToken();
      const res = await FileSystem.downloadAsync(
        `${API_URL}/latest-model`,
        uri,
        { headers: { Authorization: `Bearer ${token || ''}` } },
      );
      await saveCustomModelUri(res.uri);
      Alert.alert('Model downloaded');
    } catch (e) {
      logger.error('Model download failed', e);
      Alert.alert('Download failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleRecordAudio = async () => {
    if (!isRecording) {
      try {
        await audioService.startRecording();
        setIsRecording(true);
      } catch {
        Alert.alert('Recording failed');
      }
    } else {
      try {
        const uri = await audioService.stopRecording();
        if (uri) setAudioUri(uri);
      } catch {
        Alert.alert('Stop failed');
      }
      setIsRecording(false);
    }
  };

  const handleExportSymbols = async () => {
    try {
      const data = symbols.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        audioUri: (s as any).audioUri || null,
      }));
      await FileSystem.writeAsStringAsync(
        SYMBOL_EXPORT_PATH,
        JSON.stringify(data, null, 2),
      );
      Alert.alert('Export complete', `Saved to ${SYMBOL_EXPORT_PATH}`);
    } catch (e) {
      logger.error('export failed', e);
      Alert.alert('Export failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleImportSymbols = async () => {
    try {
      const content = await FileSystem.readAsStringAsync(SYMBOL_EXPORT_PATH);
      const items = JSON.parse(content);
      await database.write(async () => {
        const collection = database.get<DBSymbol>('symbols');
        for (const item of items) {
          const existing = await collection.find(item.id).catch(() => null);
          if (existing) {
            await existing.update((s) => {
              s.name = item.name;
              s.category = item.category || 'custom';
              (s as any).audioUri = item.audioUri || '';
            });
          } else {
            await collection.create((s) => {
              (s as any)._raw.id = item.id;
              s.name = item.name;
              s.category = item.category || 'custom';
              s.iconName = '';
              s.videoAssetPath = '';
              (s as any).dgsVideoAssetPath = '';
              s.priority = 1;
              s.isActive = true;
              s.healthScore = 100;
              s.color = COLORS.surface;
              s.emoji = '❓';
              (s as any).audioUri = item.audioUri || '';
              s.createdAt = new Date();
            });
          }
        }
      });
      Alert.alert('Import complete');
    } catch (e) {
      logger.error('import failed', e);
      Alert.alert('Import failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleBackupGestures = async () => {
    try {
      const path = await backupService.backupProtectedGestures();
      if (path) {
        Alert.alert('Backup complete', `Saved to ${path}`);
      } else {
        Alert.alert('No data to backup');
      }
    } catch (e) {
      Alert.alert('Backup failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleExportGestures = async () => {
    try {
      const path = await backupService.exportProtectedGestures();
      if (path) {
        Alert.alert('Export complete', `Saved to ${path}`);
      } else {
        Alert.alert('No data to export');
      }
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleRestoreGestures = async () => {
    try {
      const ok = await backupService.restoreProtectedGestures();
      if (ok) {
        Alert.alert('Restore complete');
      } else {
        Alert.alert('No backup found');
      }
    } catch (e) {
      Alert.alert('Restore failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleExportProfile = async () => {
    try {
      const profileId = await loadActiveProfileId();
      if (!profileId) {
        Alert.alert('No active profile');
        return;
      }
      const data = await gdprService.exportProfile(profileId);
      if (!data) {
        Alert.alert('Export failed');
        return;
      }
      const path = `${FileSystem.documentDirectory || ''}profile-export.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
      Alert.alert('Profile export complete', `Saved to ${path}`);
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message || 'Unknown error');
    }
  };

  const handleDeleteProfile = async () => {
    try {
      const profileId = await loadActiveProfileId();
      if (!profileId) {
        Alert.alert('No active profile');
        return;
      }
      const ok = await gdprService.deleteProfile(profileId);
      if (ok) {
        Alert.alert('Profile deleted');
      } else {
        Alert.alert('Delete failed');
      }
    } catch (e) {
      Alert.alert('Delete failed', (e as Error).message || 'Unknown error');
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
    container: { flex: 1, padding: SPACING.lg },
    title: { fontSize: 24, marginBottom: SPACING.lg, textAlign: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
    modal: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
    input: { borderWidth: 1, padding: SPACING.sm, marginBottom: SPACING.md, borderRadius: RADIUS },
    apiInput: { borderWidth: 1, padding: SPACING.sm, marginVertical: SPACING.md, borderRadius: RADIUS },
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
      <TextInput
        style={styles.apiInput}
        placeholder="Backend API Token"
        value={backendToken}
        onChangeText={setBackendToken}
        accessibilityLabel="Backend API Token"
      />
      <Button
        title="Save Backend Token"
        onPress={handleSaveBackendToken}
        accessibilityLabel="Backend-Token speichern"
      />
      <Button
        title="Download Latest Model"
        onPress={handleDownloadModel}
        accessibilityLabel="Neueste Modellversion herunterladen"
      />
      <Button
        title="Export Symbols"
        onPress={handleExportSymbols}
        accessibilityLabel="Symbole exportieren"
      />
      <Button
        title="Import Symbols"
        onPress={handleImportSymbols}
        accessibilityLabel="Symbole importieren"
      />
      <Button
        title="Gesten exportieren"
        onPress={handleExportGestures}
        accessibilityLabel="Gesten exportieren"
      />
      <Button
        title="Gesten sichern"
        onPress={handleBackupGestures}
        accessibilityLabel="Gesten sichern"
      />
      <Button
        title="Gesten wiederherstellen"
        onPress={handleRestoreGestures}
        accessibilityLabel="Gesten wiederherstellen"
      />
      <Button
        title="Export Profile"
        onPress={handleExportProfile}
        accessibilityLabel="Profil exportieren"
      />
      <Button
        title="Delete Profile"
        onPress={handleDeleteProfile}
        accessibilityLabel="Profil löschen"
      />
      <Button title="Add Symbol" onPress={openAdd} accessibilityLabel="Symbol hinzufügen" />
      <Button
        title="Training"
        onPress={() => navigation.navigate('Training')}
        accessibilityLabel="Trainingsmodus öffnen"
      />
      <Button
        title="Correction"
        onPress={() => navigation.navigate('Correction')}
        accessibilityLabel="Korrekturmodus öffnen"
      />
      <Button
        title="Dashboard"
        onPress={() => navigation.navigate('Dashboard')}
        accessibilityLabel="Analytics-Dashboard öffnen"
      />
      <Button
        title="Practice Schedules"
        onPress={() => navigation.navigate('PracticeSchedule')}
        accessibilityLabel="Practice Schedules öffnen"
      />
      <Button title="Back" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />

      <View style={{ marginTop: SPACING.lg }}>
        <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Centroid Summary</Text>
        <Button
          title={loadingSummary ? 'Loading…' : 'Refresh Summary'}
          onPress={refreshCentroidSummary}
          disabled={loadingSummary}
        />
        {Object.keys(centroidSummary).length === 0 ? (
          <Text style={{ marginTop: 8 }}>No data yet.</Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            {Object.entries(centroidSummary).map(([label, count]) => (
              <Text key={label}>{label}: {count}</Text>
            ))}
          </View>
        )}
      </View>

      <View style={{ marginTop: SPACING.lg }}>
        <Text>Low Performance Mode: {isLowPerformanceMode ? 'On' : 'Off'}</Text>
        <Button
          title="Toggle Low Performance Mode"
          onPress={toggleLowPerformanceMode}
          accessibilityLabel="Toggle Low Performance Mode"
        />
      </View>

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
          <TextInput
            style={styles.input}
            placeholder="Category"
            value={category}
            onChangeText={setCategory}
            accessibilityLabel="Symbolkategorie"
          />
          <Button
            title={isRecording ? 'Stop Recording' : 'Record Audio'}
            onPress={handleRecordAudio}
            accessibilityLabel="Audioaufnahme"
          />
          {audioUri ? <Text>Audio saved</Text> : null}
          <Button title="Save" onPress={handleSave} accessibilityLabel="Symbol speichern" />
          <Button title="Cancel" onPress={() => setModalVisible(false)} accessibilityLabel="Abbrechen" />
        </View>
      </Modal>
    </View>
  );
}
