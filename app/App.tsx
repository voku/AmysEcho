import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, AccessibilityInfo, LogBox } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setupDatabase } from './db';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { MessageProvider } from './src/context/MessageContext';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';
import { initGestureModel } from './src/model';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/ui';
import { logger } from './src/utils/logger';
import { initCrashReporting, onAppStartCrashFlush } from './src/services/crashReporting';
// Model updates are coordinated by AppServicesProvider

import { PerformanceProvider } from './src/context/PerformanceContext';
import ChildErrorBoundary from './src/components/ChildErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });

  // ML models are initialized in AppServicesProvider; avoid duplicate native loads here

  useEffect(() => {
    // Tame noisy dev warnings that overwhelm the screen
    LogBox.ignoreLogs([
      '[WARN] Sound not found',
      'API key integrity check failed',
      '[DEBUG] Speaking',
    ]);
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        logger.info("Initializing Amy's Echo...");
        initCrashReporting();
        const profileId = await setupDatabase();
        logger.info('Database setup complete, initial profile:', profileId);

        const activeId = await loadActiveProfileId();
        if (!activeId) {
          await setActiveProfileId(profileId);
        }

        const profile = await loadProfile(activeId || profileId);
        if (profile) {
          setAccessibility({
            largeText: !!profile.largeText,
            highContrast: !!profile.highContrast,
          });
          logger.info('Profile loaded:', profile.name);
        } else {
          logger.warn('No profile found, user needs onboarding');
        }

        await initGestureModel();
        // Model loading and update checks are handled in AppServicesProvider

      } catch (e) {
        logger.error('Failed to initialize app:', e);
        Alert.alert(
          'Fehler beim Start',
          "Amy's Echo konnte nicht richtig gestartet werden. Bitte starte die App neu.",
          [{ text: 'OK' }],
        );
      } finally {
        setIsReady(true);
        // Best-effort crash report upload after app becomes ready
        onAppStartCrashFlush();
      }
    }
    initialize();
  }, []);

  const handledInitial = useRef(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!handledInitial.current) {
        handledInitial.current = true;
        if (offline) {
          AccessibilityInfo.announceForAccessibility('Offline-Modus');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const gradientColors = accessibility.highContrast
    ? [COLORS.highContrastBackground, COLORS.highContrastBackground]
    : [COLORS.backgroundStart, COLORS.backgroundEnd];

  if (!isReady) {
    return (
      <LinearGradient colors={gradientColors} style={styles.container}>
        <ActivityIndicator
          size="large"
          color={accessibility.highContrast ? COLORS.highContrastText : COLORS.primaryAccent}
          accessibilityRole="progressbar"
          accessibilityLabel="Amy's Echo wird geladen"
        />
      </LinearGradient>
    );
  }

  return (
    <SafeAreaProvider>
      <MessageProvider>
        <PerformanceProvider>
          <AppServicesProvider offline={isOffline}>
            <AccessibilityContext.Provider
              value={{
                ...accessibility,
                update: (s: Partial<AccessibilitySettings>) =>
                  setAccessibility((prev) => ({ ...prev, ...s })),
              }}
            >
              <ChildErrorBoundary>
                <LinearGradient colors={gradientColors} style={styles.gradient}>
                  <OfflineBanner visible={isOffline} />
                  <NavigationContainer>
                    <RootNavigator />
                  </NavigationContainer>
                </LinearGradient>
              </ChildErrorBoundary>
            </AccessibilityContext.Provider>
          </AppServicesProvider>
        </PerformanceProvider>
      </MessageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    flex: 1,
  },
});
