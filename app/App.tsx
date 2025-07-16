import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { setupDatabase } from './db';
import ProfileSelectScreen from './src/screens/ProfileSelectScreen';
import LearningScreen from './src/screens/LearningScreen';
import AdminScreen from './src/screens/AdminScreen';
import ParentScreen from './src/screens/ParentScreen';
import { ServicesContext } from './src/context/ServicesContext';
import { mlService } from './src/services/mlService';
import { audioService } from './src/services/audioService';
import { adaptiveLearningService } from './src/services/adaptiveLearningService';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialProfileId, setInitialProfileId] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        const profileId = await setupDatabase();
        setInitialProfileId(profileId);
        await mlService.loadModels();
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
    <ServicesContext.Provider value={{ mlService, audioService, adaptiveLearningService }}>
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
    </ServicesContext.Provider>
  );
}
