import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { setupDatabase } from './db';
import ProfileSelectScreen from './src/screens/ProfileSelectScreen';
import ProfileManagerScreen from './src/screens/ProfileManagerScreen';
import RecognitionScreen from './src/screens/RecognitionScreen';
import AdminScreen from './src/screens/AdminScreen';
import ParentScreen from './src/screens/ParentScreen';
import LearningScreen from './src/screens/LearningScreen';
import TeachingScreen from './src/screens/TeachingScreen';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialProfileId, setInitialProfileId] = useState<string | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });

  useEffect(() => {
    async function initialize() {
      try {
        const profileId = await setupDatabase();
        setInitialProfileId(profileId);

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
        }

      } catch (e) {
        console.error('Failed to initialize app:', e);
      } finally {
        setIsReady(true);
      }
    }
    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AppServicesProvider>
      <AccessibilityContext.Provider value={{
        ...accessibility,
        update: (s: Partial<AccessibilitySettings>) =>
          setAccessibility(prev => ({ ...prev, ...s })),
      }}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName={initialProfileId ? 'Recognition' : 'ProfileManager'}>
          <Stack.Screen
            name="ProfileSelect"
            component={ProfileSelectScreen}
            options={{ title: 'Profil auswählen' }}
          />
          <Stack.Screen
            name="ProfileManager"
            component={ProfileManagerScreen}
            options={{ title: 'Profile' }}
          />
          <Stack.Screen
            name="Recognition"
            component={RecognitionScreen}
            options={{ title: "Amy's Echo" }}
            initialParams={{ profileId: initialProfileId }}
          />
          <Stack.Screen
            name="Admin"
            component={AdminScreen}
            options={{ title: 'Verwaltung' }}
          />
          <Stack.Screen
            name="Learning"
            component={LearningScreen as React.ComponentType<any>}
            options={{ title: 'Lernen' }}
          />
          <Stack.Screen
            name="Training"
            component={TeachingScreen}
            options={{ title: 'Training' }}
          />
          <Stack.Screen
            name="Parent"
            component={ParentScreen}
            options={{ title: 'Elternbereich' }}
          />
          </Stack.Navigator>
        </NavigationContainer>
      </AccessibilityContext.Provider>
    </AppServicesProvider>
  );
}
