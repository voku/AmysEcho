import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setupDatabase } from './db';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';
import RootNavigator from './src/navigation/RootNavigator';
import { palette } from './src/constants/ui';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });

  useEffect(() => {
    async function initialize() {
      try {
        console.log("Initializing Amy's Echo...");
        const profileId = await setupDatabase();
        console.log('Database setup complete, initial profile:', profileId);

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
          console.log('Profile loaded:', profile.name);
        } else {
          console.log('No profile found, user needs onboarding');
        }
      } catch (e) {
        console.error('Failed to initialize app:', e);
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
    ? [palette.highContrastBg, palette.highContrastBg]
    : [palette.backgroundStart, palette.backgroundEnd];

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'transparent',
      text: accessibility.highContrast ? palette.highContrastText : palette.text,
    },
  };

  if (!isReady) {
    return (
      <LinearGradient colors={gradientColors} style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={accessibility.highContrast ? palette.highContrastText : palette.accent}
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
        <LinearGradient colors={gradientColors} style={styles.appContainer}>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </LinearGradient>
      </AccessibilityContext.Provider>
    </AppServicesProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
