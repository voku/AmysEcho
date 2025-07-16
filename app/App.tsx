import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ProfileSelectScreen from './src/screens/ProfileSelectScreen';
import ParentScreen from './src/screens/ParentScreen';
import AdminScreen from './src/screens/AdminScreen';
import LearningScreen from './src/screens/LearningScreen';
import RecognitionScreen from './src/screens/RecognitionScreen';
import CorrectionScreen from './src/screens/CorrectionScreen';
import TrainingScreen from './src/screens/TrainingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import { loadProfile } from './src/storage';
import { setActiveVocabularySet } from './src/model';
import {
  AccessibilityContext,
  AccessibilitySettings,
} from './src/components/AccessibilityContext';

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({
    largeText: false,
    highContrast: false,
  });

  useEffect(() => {
    async function init() {
      const profile = await loadProfile();
      if (profile) {
        setActiveVocabularySet(profile.vocabularySetId);
        setAccessibility({
          largeText: !!profile.largeText,
          highContrast: !!profile.highContrast,
        });
        setInitialRoute('ProfileSelect');
      } else {
        setInitialRoute('Onboarding');
      }
    }
    init();
  }, []);

  if (!initialRoute) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <AccessibilityContext.Provider value={accessibility}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute as any}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="ProfileSelect" component={ProfileSelectScreen} />
          <Stack.Screen name="Parent" component={ParentScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
          <Stack.Screen name="Recognition" component={RecognitionScreen} />
          <Stack.Screen name="Correction" component={CorrectionScreen} />
          <Stack.Screen name="Training" component={TrainingScreen} />
          <Stack.Screen name="Learning" component={LearningScreen} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </AccessibilityContext.Provider>
  );
}
