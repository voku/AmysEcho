import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { loadBackendApiToken, saveBackendApiToken, loadActiveProfileId } from '../storage';
import { Paths } from 'expo-file-system';
import { makeDirectoryAsync, moveAsync, writeAsStringAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { database } from '../../db';
import { useServices } from '../context/ServicesContext';
import { CUSTOM_AUDIO_DIR, getCustomAudioPath } from '../constants/audioPaths';
import { Symbol as DBSymbol } from '../../db/models';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { logger } from '../utils/logger';
import { fetchMlpModel } from '../services/dgsModelClient';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES, type RootStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

import ScreenBackground from '../components/ScreenBackground';
import { useAccessibility } from '../components/AccessibilityContext';
import PrimaryButton from '../components/PrimaryButton';
import SettingsOptionCard, {
  type SettingsOptionCardProps,
} from '../components/settings/SettingsOptionCard';

const SYMBOL_EXPORT_PATH = `${Paths.document.uri || ''}symbols-export.json`;

type Navigation = StackNavigationProp<RootStackParamList>;

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: SPACING['2xl'] },
  header: { marginBottom: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', color: COLORS.text, marginBottom: SPACING.sm },
  titleLarge: { fontSize: 28 },
  titleHC: { color: COLORS.highContrastText },
  introCard: {
    backgroundColor: COLORS.surface,
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineMuted,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  introCardHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
    shadowOpacity: 0,
    elevation: 0,
  },
  introText: { color: COLORS.text, fontSize: 14, textAlign: 'center' },
  introTextLarge: { fontSize: 16 },
  introTextHC: { color: COLORS.highContrastText },
  addSymbolAction: {
    marginTop: SPACING.lg,
  },
  addSymbolButton: {
    alignSelf: 'stretch',
  },
  section: { marginBottom: SPACING.xl },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.md },
  sectionTitleLarge: { fontSize: 20 },
  sectionTitleHC: { color: COLORS.highContrastText },
  optionGroupSpacing: {
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  symbolName: { flex: 1, marginRight: SPACING.sm, color: COLORS.text, fontSize: 16 },
  symbolNameLarge: { fontSize: 18 },
  symbolNameHC: { color: COLORS.highContrastText },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  rowActionButtonWrapper: { marginLeft: SPACING.xs },
  rowActionButton: {
    borderRadius: DEFAULT_RADIUS,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.actionSecondaryBackground,
  },
  rowActionButtonPressed: { backgroundColor: COLORS.actionSecondaryPressed },
  rowActionButtonHC: { backgroundColor: COLORS.highContrastBackground },
  rowActionButtonPressedHC: { backgroundColor: COLORS.highContrastPressed },
  rowActionText: { color: COLORS.actionSecondaryText, fontWeight: '600', fontSize: 14 },
  rowActionTextLarge: { fontSize: 16 },
  rowActionTextHC: { color: COLORS.highContrastText },
  footer: { paddingTop: SPACING.lg },
  emptyState: { textAlign: 'center', color: COLORS.textSecondary, marginVertical: SPACING.lg, fontSize: 16 },
  emptyStateLarge: { fontSize: 18 },
  emptyStateHC: { color: COLORS.highContrastText },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.64)',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineMuted,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  modalContentHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
    shadowOpacity: 0,
    elevation: 0,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  inputLabelLarge: {
    fontSize: 16,
  },
  inputLabelHC: {
    color: COLORS.highContrastText,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: SPACING.sm,
    borderRadius: DEFAULT_RADIUS,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  inputHC: {
    borderColor: COLORS.highContrastText,
    backgroundColor: COLORS.highContrastBackground,
    color: COLORS.highContrastText,
  },
  modalButtonRow: { marginBottom: SPACING.sm },
  modalInfo: { marginBottom: SPACING.md, color: COLORS.textSecondary, fontSize: 14 },
  modalInfoLarge: { fontSize: 16 },
  modalInfoHC: { color: COLORS.highContrastText },
  modalStatus: { marginBottom: SPACING.md, color: COLORS.textSecondary, fontSize: 14 },
  modalStatusLarge: { fontSize: 16 },
  modalStatusHC: { color: COLORS.highContrastText },
});

export default function AdminScreen({ navigation }: { navigation: Navigation }) {
  const { audioService, backupService, gdprService } = useServices();
  const { highContrast, largeText } = useAccessibility();
  const [symbols, setSymbols] = useState<DBSymbol[]>([]);
  const [editing, setEditing] = useState<DBSymbol | null>(null);
  const [label, setLabel] = useState('');
  const [id, setId] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
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

  const renderSettingsOption = (
    key: string,
    title: string,
    onPress: () => void,
    accessibilityLabel: string,
    subtitle?: string,
    tone: 'default' | 'danger' = 'default',
  ) => {
    const subtitleProps: Partial<Pick<SettingsOptionCardProps, 'subtitle' | 'accessibilityHint'>> =
      subtitle !== undefined ? { subtitle, accessibilityHint: subtitle } : {};

    return (
      <View key={key} style={styles.optionGroupSpacing}>
        <SettingsOptionCard
          title={title}
          onPress={onPress}
          accessibilityLabel={accessibilityLabel}
          tone={tone}
          {...subtitleProps}
        />
      </View>
    );
  };

  const renderRowActionButton = (
    title: string,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <View key={title} style={styles.rowActionButtonWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.rowActionButton,
          highContrast && styles.rowActionButtonHC,
          pressed && (highContrast ? styles.rowActionButtonPressedHC : styles.rowActionButtonPressed),
        ]}
      >
        <Text
          style={[
            styles.rowActionText,
            largeText && styles.rowActionTextLarge,
            highContrast && styles.rowActionTextHC,
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  );

  const listHeader = (
    <View style={styles.header}>
      <Text
        style={[
          styles.title,
          largeText && styles.titleLarge,
          highContrast && styles.titleHC,
        ]}
      >
        Adminbereich
      </Text>
      <View style={[styles.introCard, highContrast && styles.introCardHC]}>
        <Text
          style={[
            styles.introText,
            largeText && styles.introTextLarge,
            highContrast && styles.introTextHC,
          ]}
        >
          Koordiniere hier Exporte, Backups und technische Einstellungen für Amy. Die Aktionen sind in Abschnitte gegliedert, damit du schneller findest, was du brauchst.
        </Text>
      </View>

      <View style={styles.addSymbolAction}>
        <PrimaryButton
          label="Symbol hinzufügen"
          onPress={openAdd}
          accessibilityLabel="Neues Symbol hinzufügen"
          style={styles.addSymbolButton}
        />
      </View>
    </View>
  );

  type SettingsAction = {
    title: string;
    subtitle?: string;
    onPress: () => void;
    accessibilityLabel: string;
    tone?: 'default' | 'danger';
  };

  const managementButtons: SettingsAction[] = [
    {
      title: 'Neuestes Modell herunterladen',
      subtitle: 'Aktualisiert das Erkennungsmodell auf diesem Gerät',
      onPress: handleDownloadModel,
      accessibilityLabel: 'Neueste Modellversion herunterladen',
    },
    {
      title: 'Symbole exportieren',
      subtitle: 'Sichert alle benutzerdefinierten Symbole als JSON',
      onPress: handleExportSymbols,
      accessibilityLabel: 'Symbole exportieren',
    },
    {
      title: 'Symbole importieren',
      subtitle: 'Lädt ein zuvor gespeichertes Symbol-Set wieder ein',
      onPress: handleImportSymbols,
      accessibilityLabel: 'Symbole importieren',
    },
    {
      title: 'Gesten exportieren',
      subtitle: 'Exportiert geschützte Gesten für andere Geräte',
      onPress: handleExportGestures,
      accessibilityLabel: 'Gesten exportieren',
    },
    {
      title: 'Gesten sichern',
      subtitle: 'Legt eine verschlüsselte Sicherung ab',
      onPress: handleBackupGestures,
      accessibilityLabel: 'Gesten sichern',
    },
    {
      title: 'Gesten wiederherstellen',
      subtitle: 'Stellt zuvor gesicherte Gesten wieder her',
      onPress: handleRestoreGestures,
      accessibilityLabel: 'Gesten wiederherstellen',
    },
    {
      title: 'Profil exportieren',
      subtitle: 'Erstellt einen Datenschutz-Export des aktiven Profils',
      onPress: handleExportProfile,
      accessibilityLabel: 'Profil exportieren',
    },
    {
      title: 'Profil löschen',
      subtitle: 'Entfernt das aktive Profil dauerhaft',
      onPress: handleDeleteProfile,
      accessibilityLabel: 'Profil löschen',
      tone: 'danger' as const,
    },
  ];

  const navigationButtons: SettingsAction[] = [
    {
      title: 'Training',
      subtitle: 'Wechsel zum Trainingsbereich, um neue Gesten aufzunehmen',
      onPress: () => {
        navigation.navigate(
          ROOT_STACK_ROUTES.App,
          { screen: APP_TAB_ROUTES.Lernen },
          { pop: true },
        );
      },
      accessibilityLabel: 'Trainingsmodus öffnen',
    },
    {
      title: 'Dashboard',
      subtitle: 'Öffnet Analysen und Verlauf',
      onPress: () =>
        navigation.navigate(ROOT_STACK_ROUTES.Dashboard, undefined, { pop: true }),
      accessibilityLabel: 'Analytics-Dashboard öffnen',
    },
    {
      title: 'Zurück',
      subtitle: 'Kehrt zur vorherigen Ansicht zurück',
      onPress: () => navigation.goBack(),
      accessibilityLabel: 'Zurück',
    },
  ];

  const listFooter = (
    <View style={styles.footer}>
      <View style={styles.section}>
        <Text
          style={[
            styles.sectionTitle,
            largeText && styles.sectionTitleLarge,
            highContrast && styles.sectionTitleHC,
          ]}
        >
          API-Zugänge
        </Text>
        <View style={styles.inputGroup}>
          <Text
            style={[
              styles.inputLabel,
              largeText && styles.inputLabelLarge,
              highContrast && styles.inputLabelHC,
            ]}
          >
            Backend-API-Token
          </Text>
          <TextInput
            style={[styles.input, highContrast && styles.inputHC]}
            placeholder="token-1234"
            placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
            value={backendToken}
            onChangeText={setBackendToken}
            accessibilityLabel="Backend-API-Token"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {renderSettingsOption(
          'save-backend-token',
          'Backend-Token speichern',
          handleSaveBackendToken,
          'Backend-Token speichern',
          'Speichert das Token für serverseitige Aufgaben',
        )}
      </View>

      <View style={styles.section}>
        <Text
          style={[
            styles.sectionTitle,
            largeText && styles.sectionTitleLarge,
            highContrast && styles.sectionTitleHC,
          ]}
        >
          Verwaltung & Sicherung
        </Text>
        {managementButtons.map(({ title, onPress, accessibilityLabel, subtitle, tone }) =>
          renderSettingsOption(title, title, onPress, accessibilityLabel, subtitle, tone ?? 'default'),
        )}
      </View>

      <View style={styles.section}>
        <Text
          style={[
            styles.sectionTitle,
            largeText && styles.sectionTitleLarge,
            highContrast && styles.sectionTitleHC,
          ]}
        >
          Navigation
        </Text>
        {navigationButtons.map(({ title, onPress, accessibilityLabel, subtitle, tone }) =>
          renderSettingsOption(title, title, onPress, accessibilityLabel, subtitle, tone ?? 'default'),
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
            <Text
              style={[
                styles.symbolName,
                largeText && styles.symbolNameLarge,
                highContrast && styles.symbolNameHC,
              ]}
            >
              {item.name}
            </Text>
            <View style={styles.rowActions}>
              {renderRowActionButton(
                'Bearbeiten',
                () => openEdit(item),
                `Bearbeite ${item.name}`,
              )}
              {renderRowActionButton(
                'Löschen',
                () => handleDelete(item),
                `Lösche ${item.name}`,
              )}
            </View>
          </View>
        )}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <Text
            style={[
              styles.emptyState,
              largeText && styles.emptyStateLarge,
              highContrast && styles.emptyStateHC,
            ]}
          >
            Noch keine Symbole
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, highContrast && styles.modalContentHC]}>
            <Text
              style={[
                styles.sectionTitle,
                largeText && styles.sectionTitleLarge,
                highContrast && styles.sectionTitleHC,
              ]}
            >
              {editing ? 'Symbol bearbeiten' : 'Neues Symbol'}
            </Text>
            <Text
              style={[
                styles.modalInfo,
                largeText && styles.modalInfoLarge,
                highContrast && styles.modalInfoHC,
              ]}
            >
              ID, Bezeichnung und Kategorie helfen Amy, das Symbol richtig zuzuordnen. Optional kannst du eine Audioaufnahme hinzufügen.
            </Text>
            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  largeText && styles.inputLabelLarge,
                  highContrast && styles.inputLabelHC,
                ]}
              >
                Symbol-ID
              </Text>
              <TextInput
                style={[styles.input, highContrast && styles.inputHC]}
                placeholder="z. B. trinken-wasser"
                placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
                value={id}
                onChangeText={setId}
                accessibilityLabel="Symbol-ID"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  largeText && styles.inputLabelLarge,
                  highContrast && styles.inputLabelHC,
                ]}
              >
                Bezeichnung
              </Text>
              <TextInput
                style={[styles.input, highContrast && styles.inputHC]}
                placeholder="Titel für das Symbol"
                placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
                value={label}
                onChangeText={setLabel}
                accessibilityLabel="Symbolbezeichnung"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  largeText && styles.inputLabelLarge,
                  highContrast && styles.inputLabelHC,
                ]}
              >
                Kategorie
              </Text>
              <TextInput
                style={[styles.input, highContrast && styles.inputHC]}
                placeholder="Ordne das Symbol einer Kategorie zu"
                placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
                value={category}
                onChangeText={setCategory}
                accessibilityLabel="Symbolkategorie"
              />
            </View>
            <View style={styles.modalButtonRow}>
              {renderRowActionButton(
                isRecording ? 'Aufnahme stoppen' : 'Audio aufnehmen',
                handleRecordAudio,
                'Audioaufnahme',
              )}
            </View>
            {audioUri ? (
              <Text
                style={[
                  styles.modalStatus,
                  largeText && styles.modalStatusLarge,
                  highContrast && styles.modalStatusHC,
                ]}
              >
                Audio gespeichert
              </Text>
            ) : null}
            <View style={styles.modalButtonRow}>
              {renderRowActionButton('Speichern', handleSave, 'Symbol speichern')}
            </View>
            <View style={styles.modalButtonRow}>
              {renderRowActionButton(
                'Abbrechen',
                () => setModalVisible(false),
                'Abbrechen',
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScreenBackground>
  );
}
