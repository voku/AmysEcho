import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadProfiles, setActiveProfileId, loadProfile, Profile } from '../storage';
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
import { gestureHistoryService } from '../services/gestureHistoryService';
import ScreenBackground from '../components/ScreenBackground';

export default function ProfileManagerScreen({ navigation, route }: any) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
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
    await setActiveProfileId(id);
    const profile = await loadProfile(id);
    if (profile) {
      update({
        largeText: !!profile.largeText,
        highContrast: !!profile.highContrast,
      });
      setLocalLargeText(!!profile.largeText);
      setLocalHighContrast(!!profile.highContrast);
    }
    navigation.navigate('Recognition', { profileId: id });
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
            setProfiles(profiles.filter((p) => p.id !== id));
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    screen: { flex: 1 },
    container: { flex: 1, padding: SPACING.lg, backgroundColor: 'transparent' },
    title: {
      fontSize: largeText ? 28 : 24,
      marginBottom: SPACING.lg,
      textAlign: 'center',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
    name: {
      fontSize: largeText ? 22 : 18,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    trustedDeviceSection: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      padding: SPACING.md,
      borderRadius: 8,
      marginBottom: SPACING.lg,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    sectionTitle: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      marginBottom: SPACING.sm,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    trustedDeviceInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    trustedDeviceSetup: {
      alignItems: 'center',
    },
    trustedDeviceText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.sm,
      textAlign: 'center',
    },
    protectionInfo: {
      alignItems: 'center',
    },
    protectionDescription: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },

    accessibilityRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    accessibilityLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.sm,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 80,
      alignItems: 'center',
      marginHorizontal: SPACING.xs,
    },
    buttonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonText: {
      color: COLORS.highContrastText,
      fontSize: 14,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 16,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: SPACING.sm,
    },
    toleranceButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: SPACING.sm,
    },
    statsSummary: {
      marginTop: SPACING.sm,
      padding: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : 'rgba(0, 0, 0, 0.05)',
      borderRadius: DEFAULT_RADIUS,
    },
    statsText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: SPACING.xs,
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
      <ScreenBackground style={styles.container}>
        <Text style={styles.title}>Profile</Text>

        {/* Trusted Device Section */}
        <View style={styles.trustedDeviceSection}>
          <Text style={styles.sectionTitle}>Vertrauenswürdiges Gerät</Text>
          {isTrustedDevice ? (
            <View style={styles.trustedDeviceInfo}>
              <Text style={styles.trustedDeviceText}>✅ Dieses Gerät ist vertrauenswürdig</Text>
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void childHaptic();
                  removeTrustedDevice();
                }}
                accessibilityRole="button"
                accessibilityLabel="Vertrauenswürdiges Gerät entfernen"
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  Entfernen
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.trustedDeviceSetup}>
              <Text style={styles.trustedDeviceText}>
                Richte dieses Gerät als vertrauenswürdig ein für einfacheren Zugriff
              </Text>
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void childHaptic();
                  setupTrustedDevice();
                }}
                accessibilityRole="button"
                accessibilityLabel="Gerät als vertrauenswürdig einrichten"
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  Als vertrauenswürdig einrichten
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Gesture Size Tolerance Section */}
        <View style={styles.trustedDeviceSection}>
          <Text style={styles.sectionTitle}>Gestengrößen-Toleranz</Text>
          <View style={styles.protectionInfo}>
            <Text style={styles.trustedDeviceText}>
              Aktuell: {Math.round(gestureSizeTolerance * 100)}%
            </Text>
            <Text style={styles.protectionDescription}>
              Wie viel Größenunterschied bei Gesten erlaubt ist
            </Text>
            <View style={styles.toleranceButtons}>
              {[0.1, 0.2, 0.3, 0.4, 0.5].map((tolerance) => (
                <Pressable
                  key={tolerance}
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.button,
                    highContrast && styles.buttonHC,
                    pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                  ]}
                  onPress={() => {
                    void childHaptic();
                    saveGestureSizeTolerance(tolerance);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Toleranz auf ${Math.round(tolerance * 100)}% setzen`}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      largeText && styles.buttonTextLarge,
                      highContrast && styles.buttonTextHC,
                    ]}
                  >
                    {`${Math.round(tolerance * 100)}%`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Success Sound Selection Section */}
        <SoundSelector selectedSound={selectedSuccessSound} onSoundSelect={handleSoundSelect} />

        {/* Accessibility Settings Section */}
        <View style={styles.trustedDeviceSection}>
          <Text style={styles.sectionTitle}>Barrierefreiheit</Text>
          <View style={styles.accessibilityRow}>
            <Text style={styles.accessibilityLabel}>Großer Text</Text>
            <Switch
              value={localLargeText}
              onValueChange={toggleLargeText}
              accessibilityLabel="Großen Text ein-/ausschalten"
              accessibilityHint="Macht Text und Symbole größer für bessere Lesbarkeit"
            />
          </View>
          <View style={styles.accessibilityRow}>
            <Text style={styles.accessibilityLabel}>Hoher Kontrast</Text>
            <Switch
              value={localHighContrast}
              onValueChange={toggleHighContrast}
              accessibilityLabel="Hohen Kontrast ein-/ausschalten"
              accessibilityHint="Erhöht den Kontrast für bessere Sichtbarkeit"
            />
          </View>
        </View>

        {/* Theme Selection Section */}
        <ThemeSelector />

        {/* Gesture History Section */}
        <View style={styles.trustedDeviceSection}>
          <Text style={styles.sectionTitle}>Gestenverlauf</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                childFriendlyStyles.minTouchTarget,
                styles.button,
                highContrast && styles.buttonHC,
                pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
              ]}
              onPress={() => {
                void childHaptic();
                setShowGestureHistory(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Gestenverlauf anzeigen"
            >
              <Text
                style={[
                  styles.buttonText,
                  largeText && styles.buttonTextLarge,
                  highContrast && styles.buttonTextHC,
                ]}
              >
                📚 Verlauf anzeigen
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                childFriendlyStyles.minTouchTarget,
                styles.button,
                highContrast && styles.buttonHC,
                pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
              ]}
              onPress={() => {
                void childHaptic();
                setShowProfileAnalytics(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Leistungsanalyse anzeigen"
            >
              <Text
                style={[
                  styles.buttonText,
                  largeText && styles.buttonTextLarge,
                  highContrast && styles.buttonTextHC,
                ]}
              >
                📊 Analyse
              </Text>
            </Pressable>
          </View>
          {profileStats && (
            <View style={styles.statsSummary}>
              <Text style={styles.statsText}>Gesamt: {profileStats.totalGestures} Gesten</Text>
              <Text style={styles.statsText}>
                Einzigartig: {profileStats.uniqueGestures} Gesten
              </Text>
              <Text style={styles.statsText}>
                Ø Sicherheit: {Math.round(profileStats.averageConfidence * 100)}%
              </Text>
            </View>
          )}
        </View>

        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void childHaptic();
                  handleSelect(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Profil ${item.name} auswählen`}
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  Auswählen
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void childHaptic();
                  handleDelete(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Profil ${item.name} löschen`}
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  Löschen
                </Text>
              </Pressable>
            </View>
          )}
        />
        <Pressable
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.button,
            highContrast && styles.buttonHC,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          onPress={() => {
            void childHaptic();
            navigation.navigate('Onboarding');
          }}
          accessibilityRole="button"
          accessibilityLabel="Neues Profil anlegen"
        >
          <Text
            style={[
              styles.buttonText,
              largeText && styles.buttonTextLarge,
              highContrast && styles.buttonTextHC,
            ]}
          >
            Neues Profil
          </Text>
        </Pressable>

        {/* Gesture History Overlay */}
        {showGestureHistory && (
          <View style={styles.overlay}>
            <GestureHistoryViewer
              gestureHistory={gestureHistory}
              onClose={() => setShowGestureHistory(false)}
              onGestureSelect={(gesture) => {
                // Could navigate to practice this specific gesture
                setShowGestureHistory(false);
                navigation.navigate('Training', { gestureLabel: gesture.id });
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
