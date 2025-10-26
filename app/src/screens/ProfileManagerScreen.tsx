import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Switch } from 'react-native';
import { useFocusEffect, type RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadProfiles, setActiveProfileId as persistActiveProfileId, loadProfile, Profile } from '../storage';
import { Profile as DBProfile } from '../../db/models';
import { useAccessibility } from '../components/AccessibilityContext';
import { database } from '../../db';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { logger } from '../utils/logger';
import SoundSelector from '../components/SoundSelector';
import BottomNav from '../components/BottomNav';
import ThemeSelector from '../components/ThemeSelector';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';
import GestureHistoryViewer from '../components/GestureHistoryViewer';
import ProfileAnalytics from '../components/ProfileAnalytics';
import CollapsibleSettingsSection from '../components/settings/CollapsibleSettingsSection';
import SettingsOptionCard from '../components/settings/SettingsOptionCard';
import { gestureHistoryService } from '../services/gestureHistoryService';
import ScreenBackground from '../components/ScreenBackground';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES, type RootStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

type Navigation = StackNavigationProp<RootStackParamList>;
type ProfileManagerRoute = RouteProp<
  RootStackParamList,
  typeof ROOT_STACK_ROUTES.ProfileManager
>;

export default function ProfileManagerScreen({
  navigation,
  route,
}: {
  navigation: Navigation;
  route: ProfileManagerRoute;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isTrustedDevice, setIsTrustedDevice] = useState(false);
  const [gestureSizeTolerance, setGestureSizeTolerance] = useState(0.3);
  const [selectedSuccessSound, setSelectedSuccessSound] = useState('success');
  const { largeText, highContrast, update } = useAccessibility();
  const [localLargeText, setLocalLargeText] = useState(largeText);
  const [localHighContrast, setLocalHighContrast] = useState(highContrast);
  const [showGestureHistory, setShowGestureHistory] = useState(false);
  const [showProfileAnalytics, setShowProfileAnalytics] = useState(false);
  const [gestureHistory, setGestureHistory] = useState<any[]>([]);
  const [profileStats, setProfileStats] = useState<any>(null);
  const profileId = route?.params?.profileId;

  useFocusEffect(
    React.useCallback(() => {
      loadProfiles().then(setProfiles);
      AsyncStorage.getItem('activeProfileId').then(setActiveProfileId).catch((error) => {
        logger.warn('Failed to load active profile id:', error);
      });
      checkTrustedDevice();
      loadSuccessSoundPreference();
      loadGestureHistory();
      loadProfileAnalytics();
    }, []),
  );

  const loadSuccessSoundPreference = async () => {
    try {
      const sound = await AsyncStorage.getItem('selectedSuccessSound');
      if (sound) {
        setSelectedSuccessSound(sound);
      }
    } catch (error) {
      logger.warn('Failed to load success sound preference:', error);
    }
  };

  const loadGestureHistory = async () => {
    try {
      // Load recent gesture history for the active profile
      const activeProfileId = await AsyncStorage.getItem('activeProfileId');
      if (activeProfileId) {
        const history = gestureHistoryService.getRecentGestures(20); // Last 20 gestures
        setGestureHistory(history);
      }
    } catch (error) {
      logger.warn('Failed to load gesture history:', error);
    }
  };

  const loadProfileAnalytics = async () => {
    try {
      const activeProfileId = await AsyncStorage.getItem('activeProfileId');
      if (activeProfileId) {
        // Get overall statistics
        const historyStats = gestureHistoryService.getStats();
        const stats = {
          totalGestures: historyStats.totalGestures,
          uniqueGestures: new Set(gestureHistoryService.getRecentHistory().map((h) => h.label))
            .size,
          averageConfidence: historyStats.successRate,
          mostUsedGesture: historyStats.mostUsedGesture,
          recentActivity: historyStats.recentActivity,
        };
        setProfileStats(stats);
      }
    } catch (error) {
      logger.warn('Failed to load profile analytics:', error);
    }
  };

  const handleSoundSelect = async (soundId: string) => {
    try {
      setSelectedSuccessSound(soundId);
      await AsyncStorage.setItem('selectedSuccessSound', soundId);

      // Update the active profile with the selected sound
      const activeProfileId = await AsyncStorage.getItem('activeProfileId');
      if (activeProfileId) {
        const profile = await loadProfile(activeProfileId);
        if (profile) {
          // Update profile in database
          await database.write(async () => {
            const dbProfile = await database.get<DBProfile>('profiles').find(activeProfileId);
            await dbProfile.update((p) => {
              (p as any).successSound = soundId;
            });
          });
        }
      }

      Alert.alert('Ton gespeichert', 'Dein neuer Erfolgston wurde gespeichert!');
    } catch (error) {
      logger.error('Failed to save success sound:', error);
      Alert.alert('Fehler', 'Ton konnte nicht gespeichert werden.');
    }
  };

  const checkTrustedDevice = async () => {
    try {
      const deviceId = await AsyncStorage.getItem('trustedDeviceId');
      setIsTrustedDevice(!!deviceId);

      // Check gesture size tolerance
      const toleranceStr = await AsyncStorage.getItem('gestureSizeTolerance');
      if (toleranceStr) {
        setGestureSizeTolerance(parseFloat(toleranceStr));
      }
    } catch (error) {
      logger.warn('Failed to check device settings:', error);
    }
  };

  const setupTrustedDevice = async () => {
    try {
      // Generate a simple device identifier
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('trustedDeviceId', deviceId);
      await AsyncStorage.setItem('trustedDeviceSetup', Date.now().toString());
      setIsTrustedDevice(true);

      Alert.alert(
        'Vertrauenswürdiges Gerät eingerichtet',
        'Dieses Gerät ist jetzt als vertrauenswürdig markiert. Amy kann es ohne zusätzliche Sicherheitseinstellungen verwenden.',
        [{ text: 'OK' }],
      );
    } catch (error) {
      logger.error('Failed to setup trusted device:', error);
      Alert.alert('Fehler', 'Vertrauenswürdiges Gerät konnte nicht eingerichtet werden.');
    }
  };

  const removeTrustedDevice = async () => {
    Alert.alert(
      'Vertrauenswürdiges Gerät entfernen',
      'Möchtest du die Vertrauensstellung dieses Geräts wirklich entfernen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('trustedDeviceId');
              await AsyncStorage.removeItem('trustedDeviceSetup');
              setIsTrustedDevice(false);
              Alert.alert('Erledigt', 'Vertrauenswürdiges Gerät wurde entfernt.');
            } catch (error) {
              logger.error('Failed to remove trusted device:', error);
            }
          },
        },
      ],
    );
  };

  const saveGestureSizeTolerance = async (tolerance: number) => {
    try {
      await AsyncStorage.setItem('gestureSizeTolerance', tolerance.toString());
      setGestureSizeTolerance(tolerance);
      Alert.alert(
        'Gespeichert',
        `Gestengrößen-Toleranz auf ${Math.round(tolerance * 100)}% gesetzt.`,
      );
    } catch (error) {
      logger.error('Failed to save gesture size tolerance:', error);
    }
  };

  const handleSelect = async (id: string) => {
    setActiveProfileId(id);
    await persistActiveProfileId(id);
    const profile = await loadProfile(id);
    if (profile) {
      update({
        largeText: !!profile.largeText,
        highContrast: !!profile.highContrast,
      });
      setLocalLargeText(!!profile.largeText);
      setLocalHighContrast(!!profile.highContrast);
    }
    navigation.navigate(
      ROOT_STACK_ROUTES.App,
      {
        screen: APP_TAB_ROUTES.Recognition,
        params: { profileId: id },
      },
      { pop: true },
    );
  };

  const toggleLargeText = async (enabled: boolean) => {
    setLocalLargeText(enabled);
    update({ largeText: enabled });
    // Update active profile
    const activeProfileId = await AsyncStorage.getItem('activeProfileId');
    if (activeProfileId) {
      await database.write(async () => {
        const dbProfile = await database.get<DBProfile>('profiles').find(activeProfileId);
        await dbProfile.update((p) => {
          (p as any).largeText = enabled;
        });
      });
    }
  };

  const toggleHighContrast = async (enabled: boolean) => {
    setLocalHighContrast(enabled);
    update({ highContrast: enabled });
    // Update active profile
    const activeProfileId = await AsyncStorage.getItem('activeProfileId');
    if (activeProfileId) {
      await database.write(async () => {
        const dbProfile = await database.get<DBProfile>('profiles').find(activeProfileId);
        await dbProfile.update((p) => {
          (p as any).highContrast = enabled;
        });
      });
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Profil löschen',
      'Möchtest du dieses Profil wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          onPress: async () => {
            await database.write(async () => {
              const profileToDelete = await database.get<DBProfile>('profiles').find(id);
              await profileToDelete.destroyPermanently();
            });
            setProfiles((prev) => prev.filter((p) => p.id !== id));
            if (id === activeProfileId) {
              setActiveProfileId(null);
            }
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    screen: { flex: 1 },
    container: {
      flex: 1,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.xl,
    },
    content: {
      flexGrow: 1,
      gap: SPACING.xl,
    },
    title: {
      fontSize: largeText ? 30 : 26,
      fontWeight: '700',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    section: {
      gap: SPACING.md,
    },
    sectionHeader: {
      gap: SPACING.xs,
    },
    sectionTitle: {
      fontSize: largeText ? 22 : 20,
      fontWeight: '700',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    sectionSubtitle: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      lineHeight: largeText ? 24 : 22,
    },
    cardStack: {
      gap: SPACING.md,
    },
    emptyState: {
      borderRadius: DEFAULT_RADIUS,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.outlineMuted,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surfaceMuted,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
    },
    emptyStateText: {
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
      lineHeight: largeText ? 24 : 22,
    },
    profileActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    profileActiveBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: DEFAULT_RADIUS,
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.actionSecondaryBackground,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.actionSecondaryBackground,
    },
    profileActiveBadgeText: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.actionSecondaryText,
      fontSize: largeText ? 14 : 12,
      fontWeight: '600',
    },
    profileActionButton: {
      borderRadius: DEFAULT_RADIUS,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.outline,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surfaceMuted,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
    },
    profileActionButtonDanger: {
      borderColor: COLORS.error,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(220, 91, 87, 0.12)',
    },
    profileActionButtonPressedDanger: {
      backgroundColor: highContrast ? COLORS.highContrastPressed : 'rgba(220, 91, 87, 0.2)',
    },
    profileActionButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 16 : 14,
      fontWeight: '600',
    },
    profileActionButtonTextDanger: {
      color: COLORS.error,
    },
    cardActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    cardActionButton: {
      borderRadius: DEFAULT_RADIUS,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.outline,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surfaceMuted,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    cardActionButtonPressed: {
      backgroundColor: highContrast ? COLORS.highContrastPressed : COLORS.pressed,
    },
    cardActionButtonDanger: {
      borderColor: COLORS.error,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(220, 91, 87, 0.12)',
    },
    cardActionButtonPressedDanger: {
      backgroundColor: highContrast ? COLORS.highContrastPressed : 'rgba(220, 91, 87, 0.2)',
    },
    cardActionButtonActive: {
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    cardActionButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 16 : 14,
      fontWeight: '600',
    },
    cardActionButtonTextDanger: {
      color: COLORS.error,
    },
    cardActionButtonTextActive: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.highContrastText,
    },
    surfaceCard: {
      borderRadius: DEFAULT_RADIUS,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.outline,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    surfaceCardTitle: {
      fontSize: largeText ? 20 : 18,
      fontWeight: '600',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    surfaceCardText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      lineHeight: largeText ? 24 : 22,
    },
    toleranceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    toggleLabel: {
      flex: 1,
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    statsSummary: {
      gap: SPACING.xs,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.md,
      zIndex: 1000,
    },
  });

  return (
    <View style={styles.screen}>
      <ScreenBackground scrollable style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Elternbereich</Text>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile verwalten</Text>
            <Text style={styles.sectionSubtitle}>
              Wähle das aktive Profil und passe Amys Erfahrung an eure Betreuungssituation an.
            </Text>
          </View>

          <View style={styles.cardStack}>
            {profiles.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Noch kein Profil angelegt. Leg gleich los und erstelle das erste Profil.
                </Text>
              </View>
            ) : (
              profiles.map((item) => (
                <SettingsOptionCard
                  key={item.id}
                  title={item.name}
                  subtitle="Tippe, um dieses Profil zu aktivieren und sofort mit Amy zu starten."
                  onPress={() => {
                    void childHaptic();
                    void handleSelect(item.id);
                  }}
                  accessibilityLabel={`Profil ${item.name} aktivieren`}
                  accessibilityHint="Öffnet die Gestenerkennung mit diesem Profil"
                  playHaptic
                  trailing={(
                    <View style={styles.profileActions}>
                      {item.id === activeProfileId ? (
                        <View style={styles.profileActiveBadge}>
                          <Text style={styles.profileActiveBadgeText}>Aktiv</Text>
                        </View>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          void childHaptic();
                          handleDelete(item.id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Profil ${item.name} löschen`}
                        style={({ pressed }) => [
                          childFriendlyStyles.minTouchTarget,
                          styles.profileActionButton,
                          styles.profileActionButtonDanger,
                          pressed && styles.profileActionButtonPressedDanger,
                        ]}
                      >
                        <Text
                          style={[styles.profileActionButtonText, styles.profileActionButtonTextDanger]}
                        >
                          Löschen
                        </Text>
                      </Pressable>
                    </View>
                  )}
                />
              ))
            )}

            <SettingsOptionCard
              title="Neues Profil"
              subtitle="Lege ein weiteres Kind oder eine neue Trainingsvariante an."
              onPress={() => {
                void childHaptic();
                navigation.navigate(ROOT_STACK_ROUTES.Onboarding, undefined, { pop: true });
              }}
              accessibilityLabel="Neues Profil anlegen"
              accessibilityHint="Starte die Einrichtung für ein neues Profil"
              playHaptic
            />
          </View>
        </View>

        <CollapsibleSettingsSection
          title="Fortgeschrittene Betreuungstools – Sicherheit & Anpassung"
          highContrast={highContrast}
          largeText={largeText}
        >
          <View style={styles.cardStack}>
            <View style={styles.surfaceCard}>
              <Text style={styles.surfaceCardTitle}>Vertrauenswürdiges Gerät</Text>
              <Text style={styles.surfaceCardText}>
                {isTrustedDevice
                  ? 'Dieses Gerät ist freigegeben. Entferne die Freigabe, wenn du wechseln möchtest.'
                  : 'Markiere dieses Gerät als vertrauenswürdig, damit Amy ohne zusätzliche Prüfung startet.'}
              </Text>
              <View style={styles.cardActionRow}>
                <Pressable
                  onPress={() => {
                    void childHaptic();
                    isTrustedDevice ? removeTrustedDevice() : setupTrustedDevice();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isTrustedDevice
                      ? 'Vertrauenswürdiges Gerät entfernen'
                      : 'Gerät als vertrauenswürdig einrichten'
                  }
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.cardActionButton,
                    isTrustedDevice && styles.cardActionButtonDanger,
                    pressed &&
                      (isTrustedDevice
                        ? styles.cardActionButtonPressedDanger
                        : styles.cardActionButtonPressed),
                  ]}
                >
                  <Text
                    style={[
                      styles.cardActionButtonText,
                      isTrustedDevice && styles.cardActionButtonTextDanger,
                    ]}
                  >
                    {isTrustedDevice ? 'Freigabe entfernen' : 'Jetzt einrichten'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.surfaceCardTitle}>Gestengrößen-Toleranz</Text>
              <Text style={styles.surfaceCardText}>
                Aktuell: {Math.round(gestureSizeTolerance * 100)}% – steuert, wie variabel Gesten sein dürfen.
              </Text>
              <View style={styles.toleranceRow}>
                {[0.1, 0.2, 0.3, 0.4, 0.5].map((tolerance) => {
                  const isActive = Math.abs(gestureSizeTolerance - tolerance) < 0.001;
                  const label = `${Math.round(tolerance * 100)}%`;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => {
                        void childHaptic();
                        saveGestureSizeTolerance(tolerance);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Toleranz auf ${label} setzen`}
                      accessibilityState={{ selected: isActive }}
                      style={({ pressed }) => [
                        childFriendlyStyles.minTouchTarget,
                        styles.cardActionButton,
                        isActive && styles.cardActionButtonActive,
                        pressed && styles.cardActionButtonPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cardActionButtonText,
                          isActive && styles.cardActionButtonTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.surfaceCardTitle}>Erfolgston</Text>
              <Text style={styles.surfaceCardText}>
                Wähle den Klang, den Amy nach einer erkannten Geste abspielt.
              </Text>
              <SoundSelector selectedSound={selectedSuccessSound} onSoundSelect={handleSoundSelect} />
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.surfaceCardTitle}>Barrierefreiheit</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Großer Text</Text>
                <Switch
                  value={localLargeText}
                  onValueChange={toggleLargeText}
                  accessibilityLabel="Großen Text ein-/ausschalten"
                  accessibilityHint="Macht Text und Symbole größer für bessere Lesbarkeit"
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Hoher Kontrast</Text>
                <Switch
                  value={localHighContrast}
                  onValueChange={toggleHighContrast}
                  accessibilityLabel="Hohen Kontrast ein-/ausschalten"
                  accessibilityHint="Erhöht den Kontrast für bessere Sichtbarkeit"
                />
              </View>
            </View>

            <View style={styles.surfaceCard}>
              <Text style={styles.surfaceCardTitle}>Thema & Farben</Text>
              <ThemeSelector />
            </View>
          </View>
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection
          title="Fortgeschrittene Betreuungstools – Verlauf & Analysen"
          highContrast={highContrast}
          largeText={largeText}
        >
          <View style={styles.cardStack}>
            <SettingsOptionCard
              title="Gestenverlauf ansehen"
              subtitle="Zeigt die letzten Gesten und ihre Sicherheit an."
              onPress={() => {
                void childHaptic();
                setShowGestureHistory(true);
              }}
              accessibilityLabel="Gestenverlauf anzeigen"
              accessibilityHint="Öffnet die Liste der letzten Gesten"
              playHaptic
            />
            <SettingsOptionCard
              title="Analyse öffnen"
              subtitle="Erhalte Trends zu Erfolgen, Nutzung und Sicherheit."
              onPress={() => {
                void childHaptic();
                setShowProfileAnalytics(true);
              }}
              accessibilityLabel="Leistungsanalyse anzeigen"
              accessibilityHint="Öffnet die statistische Auswertung"
              playHaptic
            />
            {profileStats ? (
              <View style={styles.surfaceCard}>
                <Text style={styles.surfaceCardTitle}>Aktueller Überblick</Text>
                <View style={styles.statsSummary}>
                  <Text style={styles.surfaceCardText}>
                    Gesamt: {profileStats.totalGestures} Gesten
                  </Text>
                  <Text style={styles.surfaceCardText}>
                    Einzigartig: {profileStats.uniqueGestures} Gesten
                  </Text>
                  <Text style={styles.surfaceCardText}>
                    Ø Sicherheit: {Math.round(profileStats.averageConfidence * 100)}%
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </CollapsibleSettingsSection>

        {/* Gesture History Overlay */}
        {showGestureHistory && (
          <View style={styles.overlay}>
            <GestureHistoryViewer
              gestureHistory={gestureHistory}
              onClose={() => setShowGestureHistory(false)}
              onGestureSelect={(gesture) => {
                // Could navigate to practice this specific gesture
                setShowGestureHistory(false);
                navigation.navigate(ROOT_STACK_ROUTES.Recording, {
                  gestureId: gesture.id,
                  gestureLabel: gesture.label,
                });
              }}
            />
          </View>
        )}

        {/* Profile Analytics Overlay */}
        {showProfileAnalytics && profileStats && (
          <View style={styles.overlay}>
            <ProfileAnalytics
              stats={profileStats}
              onClose={() => setShowProfileAnalytics(false)}
              onViewDetails={() => {
                // Could show more detailed analytics
                setShowProfileAnalytics(false);
              }}
            />
          </View>
        )}
      </ScreenBackground>
      {profileId && <BottomNav active="parent" profileId={profileId} />}
    </View>
  );
}
