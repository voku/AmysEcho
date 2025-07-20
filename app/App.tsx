import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { setupDatabase } from './db';
import ProfileSelectScreen from './src/screens/ProfileSelectScreen';
import RecognitionScreen from './src/screens/RecognitionScreen';
import AdminScreen from './src/screens/AdminScreen';
import ParentScreen from './src/screens/ParentScreen';
import { AppServicesProvider } from './src/context/AppServicesProvider';
import { AccessibilityContext, AccessibilitySettings } from './src/components/AccessibilityContext';
import { loadProfile, loadCustomModelUri } from './src/storage';
import { mlService } from './src/services';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';

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

        // Load ML models
        const landmarkModel = await loadTensorflowModel(
          require('./assets/models/hand_landmarker.tflite'),
        );
        let gestureModel: TensorflowModel | string = await loadTensorflowModel(
          require('./assets/models/gesture_classifier.tflite'),
        );

        const customModelUri = await loadCustomModelUri();
        if (customModelUri) {
          console.log('Loading custom model from:', customModelUri);
          gestureModel = customModelUri;
        }

        await mlService.loadModels(landmarkModel, gestureModel);
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
          <Stack.Navigator initialRouteName={initialProfileId ? 'Recognition' : 'ProfileSelect'}>
          <Stack.Screen
            name="ProfileSelect"
            component={ProfileSelectScreen}
            options={{ title: 'Profil auswählen' }}
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
