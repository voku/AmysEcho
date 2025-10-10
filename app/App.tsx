import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, AccessibilityInfo, LogBox } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer } from '@react-navigation/native';
import { setupDatabase } from './db';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { MessageProvider } from './src/context/MessageContext';
import { MoodProvider } from './src/context/MoodContext';
import { LocationProvider } from './src/context/LocationContext';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';
import { initGestureModel } from './src/model';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/ui';
import GradientBackground from './src/components/GradientBackground';
import { logger } from './src/utils/logger';

import { initCrashReporting, onAppStartCrashFlush } from './src/services/crashReporting';
// Model updates are coordinated by AppServicesProvider
import { AppServicesProvider } from './src/context/AppServicesProvider';

import { PerformanceProvider } from './src/context/PerformanceContext';
import ChildErrorBoundary from './src/components/ChildErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import LoadingIndicator from './src/components/LoadingIndicator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });
  const { theme } = useTheme();

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

  // Use theme-based colors, fallback to accessibility colors
  const getGradientColors = (): [string, string] => {
    if (accessibility.highContrast) {
      return [COLORS.highContrastBackground, COLORS.highContrastBackground];
    }
    // Use theme colors for gradient
    return [theme.colors.gradientStart, theme.colors.gradientEnd];
  };

  const gradientColors = getGradientColors();

  if (!isReady) {
    return (
      <GradientBackground colors={gradientColors} style={styles.container}>
        <LoadingIndicator label="Amy's Echo wird geladen" />
      </GradientBackground>
    );
  }

  return (
    <SafeAreaProvider>
      <MessageProvider>
        <MoodProvider>
          <LocationProvider>
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
                  <GradientBackground colors={gradientColors} style={styles.gradient}>
                    <OfflineBanner visible={isOffline} />
                    <NavigationContainer>
                      <RootNavigator />
                    </NavigationContainer>
                  </GradientBackground>
                </ChildErrorBoundary>
              </AccessibilityContext.Provider>
            </AppServicesProvider>
          </PerformanceProvider>
        </LocationProvider>
        </MoodProvider>
      </MessageProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    flex: 1,
  },
});
