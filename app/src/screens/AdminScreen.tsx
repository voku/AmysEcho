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
  loadActiveProfileId,
} from '../storage';
import { Paths } from 'expo-file-system';
import { makeDirectoryAsync, moveAsync, writeAsStringAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { database } from '../../db';
import { useServices } from '../context/ServicesContext';
import { CUSTOM_AUDIO_DIR, getCustomAudioPath } from '../constants/audioPaths';
import { Symbol as DBSymbol } from '../../db/models';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { logger } from '../utils/logger';
import { fetchMlpModel } from '../services/dgsModelClient';

import { usePerformance } from '../context/PerformanceContext';
import ScreenBackground from '../components/ScreenBackground';
import { popToExistingRoute } from '../navigation/navigationHelpers';

const SYMBOL_EXPORT_PATH = `${Paths.document.uri || ''}symbols-export.json`;

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
    return () => sub.unsubscribe();
  }, []);

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
      if (!dest || !CUSTOM_AUDIO_DIR) {
        logger.warn('Benutzerdefinierte Audiodateien können ohne Dokumentverzeichnis nicht gespeichert werden.');
        Alert.alert(
          'Speichern fehlgeschlagen',
          'Es steht kein Speicherort für benutzerdefinierte Audiodateien zur Verfügung.',
        );
        return;
      }
      if (audioUri !== dest) {
        await makeDirectoryAsync(CUSTOM_AUDIO_DIR, { intermediates: true });
        try {
          await moveAsync({ from: audioUri, to: dest });
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
      const profileId = await loadActiveProfileId().catch(() => null);
      const model = await fetchMlpModel(profileId ?? undefined);
      if (model) {
        Alert.alert('Modell heruntergeladen');
        return;
      }
      Alert.alert('Download fehlgeschlagen', 'Kein Modell verfügbar.');
    } catch (e) {
      logger.error('Model download failed', e);
      Alert.alert('Download fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleRecordAudio = async () => {
    if (!isRecording) {
      try {
        await audioService.startRecording();
        setIsRecording(true);
      } catch {
        Alert.alert('Aufnahme fehlgeschlagen');
      }
    } else {
      try {
        const uri = await audioService.stopRecording();
        if (uri) setAudioUri(uri);
      } catch {
        Alert.alert('Stopp fehlgeschlagen');
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
      await writeAsStringAsync(
        SYMBOL_EXPORT_PATH,
        JSON.stringify(data, null, 2),
      );
      Alert.alert('Export abgeschlossen', `In ${SYMBOL_EXPORT_PATH} gespeichert`);
    } catch (e) {
      logger.error('export failed', e);
      Alert.alert('Export fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleImportSymbols = async () => {
    try {
      const content = await readAsStringAsync(SYMBOL_EXPORT_PATH);
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
      Alert.alert('Import abgeschlossen');
    } catch (e) {
      logger.error('import failed', e);
      Alert.alert('Import fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleBackupGestures = async () => {
    try {
      const path = await backupService.backupProtectedGestures();
      if (path) {
        Alert.alert('Sicherung abgeschlossen', `In ${path} gespeichert`);
      } else {
        Alert.alert('Keine Daten zum Sichern');
      }
    } catch (e) {
      Alert.alert('Sicherung fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleExportGestures = async () => {
    try {
      const path = await backupService.exportProtectedGestures();
      if (path) {
        Alert.alert('Export abgeschlossen', `In ${path} gespeichert`);
      } else {
        Alert.alert('Keine Daten zum Exportieren');
      }
    } catch (e) {
      Alert.alert('Export fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleRestoreGestures = async () => {
    try {
      const ok = await backupService.restoreProtectedGestures();
      if (ok) {
        Alert.alert('Wiederherstellung abgeschlossen');
      } else {
        Alert.alert('Keine Sicherung gefunden');
      }
    } catch (e) {
      Alert.alert('Wiederherstellung fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleExportProfile = async () => {
    try {
      const profileId = await loadActiveProfileId();
      if (!profileId) {
        Alert.alert('Kein aktives Profil');
        return;
      }
      const data = await gdprService.exportProfile(profileId);
      if (!data) {
        Alert.alert('Export fehlgeschlagen');
        return;
      }
      const path = `${Paths.document.uri || ''}profile-export.json`;
      await writeAsStringAsync(path, JSON.stringify(data, null, 2));
      Alert.alert('Profilexport abgeschlossen', `In ${path} gespeichert`);
    } catch (e) {
      Alert.alert('Export fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
    }
  };

  const handleDeleteProfile = async () => {
    try {
      const profileId = await loadActiveProfileId();
      if (!profileId) {
        Alert.alert('Kein aktives Profil');
        return;
      }
      const ok = await gdprService.deleteProfile(profileId);
      if (ok) {
        Alert.alert('Profil gelöscht');
      } else {
        Alert.alert('Löschen fehlgeschlagen');
      }
    } catch (e) {
      Alert.alert('Löschen fehlgeschlagen', (e as Error).message || 'Unbekannter Fehler');
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
    container: { flex: 1 },
    header: { marginBottom: SPACING.md },
    title: { fontSize: 24, textAlign: 'center' },
    listContent: { paddingBottom: SPACING['2xl'] },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.xs,
    },
    symbolName: { flex: 1, marginRight: SPACING.sm },
    rowActions: { flexDirection: 'row', alignItems: 'center' },
    rowButtonWrapper: { marginLeft: SPACING.xs },
    footer: { paddingTop: SPACING.sm },
    section: { marginBottom: SPACING.lg },
    buttonWrapper: { marginBottom: SPACING.sm },
    performanceLabel: { fontWeight: '600', color: COLORS.text, marginBottom: SPACING.xs },
    emptyState: { textAlign: 'center', color: COLORS.textSecondary, marginVertical: SPACING.lg },
    modal: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
    input: { borderWidth: 1, padding: SPACING.sm, marginBottom: SPACING.md, borderRadius: DEFAULT_RADIUS },
    apiInput: { borderWidth: 1, padding: SPACING.sm, marginBottom: SPACING.md, borderRadius: DEFAULT_RADIUS },
  });

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.title}>Adminbereich</Text>
    </View>
  );

  const managementButtons = [
    {
      title: 'Neuestes Modell herunterladen',
      onPress: handleDownloadModel,
      accessibilityLabel: 'Neueste Modellversion herunterladen',
    },
    {
      title: 'Symbole exportieren',
      onPress: handleExportSymbols,
      accessibilityLabel: 'Symbole exportieren',
    },
    {
      title: 'Symbole importieren',
      onPress: handleImportSymbols,
      accessibilityLabel: 'Symbole importieren',
    },
    {
      title: 'Gesten exportieren',
      onPress: handleExportGestures,
      accessibilityLabel: 'Gesten exportieren',
    },
    {
      title: 'Gesten sichern',
      onPress: handleBackupGestures,
      accessibilityLabel: 'Gesten sichern',
    },
    {
      title: 'Gesten wiederherstellen',
      onPress: handleRestoreGestures,
      accessibilityLabel: 'Gesten wiederherstellen',
    },
    {
      title: 'Profil exportieren',
      onPress: handleExportProfile,
      accessibilityLabel: 'Profil exportieren',
    },
    {
      title: 'Profil löschen',
      onPress: handleDeleteProfile,
      accessibilityLabel: 'Profil löschen',
    },
    {
      title: 'Symbol hinzufügen',
      onPress: openAdd,
      accessibilityLabel: 'Symbol hinzufügen',
    },
  ];

  const navigationButtons = [
    {
      title: 'Training',
      onPress: () => {
        popToExistingRoute(navigation, 'App');
        navigation.navigate('App', { screen: 'Lernen' });
      },
      accessibilityLabel: 'Trainingsmodus öffnen',
    },
    {
      title: 'Dashboard',
      onPress: () => navigation.navigate('Dashboard'),
      accessibilityLabel: 'Analytics-Dashboard öffnen',
    },
    {
      title: 'Zurück',
      onPress: () => navigation.goBack(),
      accessibilityLabel: 'Zurück',
    },
  ];

  const renderActionButton = (
    title: string,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <View key={title} style={styles.buttonWrapper}>
      <Button title={title} onPress={onPress} accessibilityLabel={accessibilityLabel} />
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      <View style={styles.section}>
        <TextInput
          style={styles.apiInput}
          placeholder="OpenAI API-Schlüssel"
          value={apiKey}
          onChangeText={setApiKey}
          accessibilityLabel="OpenAI API-Schlüssel"
        />
        {renderActionButton('API-Schlüssel speichern', handleSaveApiKey, 'OpenAI API-Schlüssel speichern')}
        <TextInput
          style={styles.apiInput}
          placeholder="Backend-API-Token"
          value={backendToken}
          onChangeText={setBackendToken}
          accessibilityLabel="Backend-API-Token"
        />
        {renderActionButton('Backend-Token speichern', handleSaveBackendToken, 'Backend-Token speichern')}
      </View>

      <View style={styles.section}>
        {managementButtons.map(({ title, onPress, accessibilityLabel }) =>
          renderActionButton(title, onPress, accessibilityLabel),
        )}
      </View>

      <View style={styles.section}>
        {navigationButtons.map(({ title, onPress, accessibilityLabel }) =>
          renderActionButton(title, onPress, accessibilityLabel),
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.performanceLabel}>
          Niedriger Leistungsmodus: {isLowPerformanceMode ? 'An' : 'Aus'}
        </Text>
        {renderActionButton(
          'Niedrigen Leistungsmodus umschalten',
          toggleLowPerformanceMode,
          'Niedrigen Leistungsmodus umschalten',
        )}
      </View>
    </View>
  );

  return (
    <ScreenBackground style={styles.container}>
      <FlatList
        testID="admin-symbol-list"
        data={symbols}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.symbolName}>{item.name}</Text>
            <View style={styles.rowActions}>
              <View style={styles.rowButtonWrapper}>
                <Button
                  title="Bearbeiten"
                  onPress={() => openEdit(item)}
                  accessibilityLabel={`Bearbeite ${item.name}`}
                />
              </View>
              <View style={styles.rowButtonWrapper}>
                <Button
                  title="Löschen"
                  onPress={() => handleDelete(item)}
                  accessibilityLabel={`Lösche ${item.name}`}
                />
              </View>
            </View>
          </View>
        )}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={<Text style={styles.emptyState}>Noch keine Symbole</Text>}
        contentContainerStyle={styles.listContent}
      />

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modal}>
          <TextInput
            style={styles.input}
            placeholder="ID"
            value={id}
            onChangeText={setId}
            accessibilityLabel="Symbol-ID"
          />
          <TextInput
            style={styles.input}
            placeholder="Bezeichnung"
            value={label}
            onChangeText={setLabel}
            accessibilityLabel="Symbolbezeichnung"
          />
          <TextInput
            style={styles.input}
            placeholder="Kategorie"
            value={category}
            onChangeText={setCategory}
            accessibilityLabel="Symbolkategorie"
          />
          <Button
            title={isRecording ? 'Aufnahme stoppen' : 'Audio aufnehmen'}
            onPress={handleRecordAudio}
            accessibilityLabel="Audioaufnahme"
          />
          {audioUri ? <Text>Audio gespeichert</Text> : null}
          <Button title="Speichern" onPress={handleSave} accessibilityLabel="Symbol speichern" />
          <Button title="Abbrechen" onPress={() => setModalVisible(false)} accessibilityLabel="Abbrechen" />
        </View>
      </Modal>
    </ScreenBackground>
  );
}
