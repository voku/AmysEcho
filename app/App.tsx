import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setupDatabase } from './db';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/ui';
import { logger } from './src/utils/logger';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });

  useEffect(() => {
    async function initialize() {
      try {
        logger.info("Initializing Amy's Echo...");
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
      } catch (e) {
        logger.error('Failed to initialize app:', e);
        Alert.alert(
          'Initialization Error',
          "Amy's Echo failed to start properly. Please restart the app.",
          [{ text: 'OK' }],
        );
      } finally {
        setIsReady(true);
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
    <AppServicesProvider>
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
