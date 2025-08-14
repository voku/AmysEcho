import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Platform, ToastAndroid } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setupDatabase } from './db';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { MessageProvider } from './src/context/MessageContext';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/ui';
import { logger } from './src/utils/logger';
import { useAmyGestureModel } from './src/ml/tfliteRuntime';
import { initCrashReporting, onAppStartCrashFlush } from './src/services/crashReporting';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });

  // Load gesture model once and expose global inference for worklets
  useAmyGestureModel(require('./assets/models/gesture_classifier.tflite'));

  useEffect(() => {
    async function initialize() {
      try {
        logger.info("Initializing Amy's Echo...");
        initCrashReporting();
        const profileId = await setupDatabase();
        logger.info('Database setup complete, initial profile:', profileId);

        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          setIsOffline(true);
          if (Platform.OS === 'android') {
            ToastAndroid.show('Working offline', ToastAndroid.SHORT);
          } else {
            Alert.alert('Working offline');
          }
        }

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
      } catch (e) {
        logger.error('Failed to initialize app:', e);
        Alert.alert(
          'Initialization Error',
          "Amy's Echo failed to start properly. Please restart the app.",
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
          accessibilityLabel="Loading Amy's Echo"
        />
      </LinearGradient>
    );
  }

  return (
    <MessageProvider>
      <AppServicesProvider offline={isOffline}>
        <AccessibilityContext.Provider
          value={{
            ...accessibility,
            update: (s: Partial<AccessibilitySettings>) =>
              setAccessibility((prev) => ({ ...prev, ...s })),
          }}
        >
          <LinearGradient colors={gradientColors} style={styles.gradient}>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </LinearGradient>
        </AccessibilityContext.Provider>
      </AppServicesProvider>
    </MessageProvider>
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
