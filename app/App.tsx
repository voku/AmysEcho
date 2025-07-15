import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import OnboardingScreen from './src/screens/OnboardingScreen';
import RecognitionScreen from './src/screens/RecognitionScreen';
import CorrectionScreen from './src/screens/CorrectionScreen';
import TrainingScreen from './src/screens/TrainingScreen';
import { loadProfile } from './src/storage';
import { setActiveVocabularySet } from './src/model';

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const profile = await loadProfile();
      if (profile) {
        setActiveVocabularySet(profile.vocabularySetId);
        setInitialRoute('Recognition');
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
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute as any}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Recognition" component={RecognitionScreen} />
        <Stack.Screen name="Correction" component={CorrectionScreen} />
        <Stack.Screen name="Training" component={TrainingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
