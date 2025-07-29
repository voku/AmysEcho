import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
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
import HelpScreen from './src/screens/HelpScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadActiveProfileId, setActiveProfileId } from './src/storage';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialProfileId, setInitialProfileId] = useState<string | null>(null);
  const [hasProfiles, setHasProfiles] = useState(false);
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

        setInitialProfileId(profileId);

        const activeId = await loadActiveProfileId();
        if (!activeId) {
          await setActiveProfileId(profileId);
        }

        const profile = await loadProfile(activeId || profileId);
        if (profile) {
          setHasProfiles(true);
          setAccessibility({
            largeText: !!profile.largeText,
            highContrast: !!profile.highContrast,
          });
          console.log('Profile loaded:', profile.name);
        } else {
          console.log('No profile found, user needs onboarding');
          setHasProfiles(false);
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

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Determine initial route based on setup state
  let initialRouteName = 'Recognition';
  if (!hasProfiles) {
    initialRouteName = 'Onboarding';
  } else if (!initialProfileId) {
    initialRouteName = 'ProfileManager';
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
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={initialRouteName}
            screenOptions={{
              headerStyle: {
                backgroundColor: '#007AFF',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ title: "Welcome to Amy's Echo", headerShown: false }}
          />
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
          <Stack.Screen
            name="Help"
            component={HelpScreen}
            options={{ title: 'Hilfe' }}
          />
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ title: 'Analytics' }}
          />
          </Stack.Navigator>
        </NavigationContainer>
      </AccessibilityContext.Provider>
    </AppServicesProvider>
  );
}
