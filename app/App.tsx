import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { setupDatabase } from './db';
import ProfileSelectScreen from './screens/ProfileSelectScreen';
import LearningScreen from './screens/LearningScreen';
import AdminScreen from './screens/AdminScreen';
import ParentScreen from './screens/ParentScreen';
import { AppServicesProvider } from './context/AppServicesProvider';
import { AccessibilityContext, AccessibilitySettings } from './components/AccessibilityContext';
import { loadProfile } from './storage';

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
        const profile = await loadProfile();
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
          <Stack.Navigator initialRouteName={initialProfileId ? 'Learning' : 'ProfileSelect'}>
          <Stack.Screen
            name="ProfileSelect"
            component={ProfileSelectScreen}
            options={{ title: 'Profil auswählen' }}
          />
          <Stack.Screen
            name="Learning"
            component={LearningScreen}
            options={{ title: "Amy's Echo" }}
            initialParams={{ profileId: initialProfileId }}
          />
          <Stack.Screen
            name="Admin"
            component={AdminScreen}
            options={{ title: 'Verwaltung' }}
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
