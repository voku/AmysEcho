
import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { loadProfiles } from '../storage';

const lazyScreen = (
  factory: () => Promise<any>,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  React.lazy(
    factory as () => Promise<{ default: React.ComponentType<any> }>,
  );

const OnboardingScreen = lazyScreen(() => import('../screens/OnboardingScreen.js'));
const GestureTutorialScreen = lazyScreen(
  () => import('../screens/GestureTutorialScreen.js'),
);
const ProfileSelectScreen = lazyScreen(() => import('../screens/ProfileSelectScreen.js'));
const RecognitionScreen = lazyScreen(() => import('../screens/RecognitionScreen.js'));
const CorrectionScreen = lazyScreen(() => import('../screens/CorrectionScreen.js'));
const TrainingScreen = lazyScreen(() => import('../screens/TrainingScreen.js'));
const ParentScreen = lazyScreen(() => import('../screens/ParentScreen.js'));
const ProfileManagerScreen = lazyScreen(
  () => import('../screens/ProfileManagerScreen.js'),
);
const ParentalGateScreen = lazyScreen(
  () => import('../screens/ParentalGateScreen.js'),
);
const AdminScreen = lazyScreen(() => import('../screens/AdminScreen.js'));
const DashboardScreen = lazyScreen(() => import('../screens/DashboardScreen.js'));
const HelpScreen = lazyScreen(() => import('../screens/HelpScreen.js'));

const Stack = createNativeStackNavigator<RootStackParamList>();

const Loading = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" />
  </View>
);

const RootNavigator = () => {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | undefined>();

  useEffect(() => {
    loadProfiles().then((profiles) => {
      setInitialRoute(profiles.length > 0 ? 'ProfileSelect' : 'Onboarding');
    });
  }, []);

  if (!initialRoute) return <Loading />;

  return (
    <Suspense fallback={<Loading />}>
      <Stack.Navigator initialRouteName={initialRoute}>
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Tutorial"
        component={GestureTutorialScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProfileSelect"
        component={ProfileSelectScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Recognition"
        component={RecognitionScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Correction"
        component={CorrectionScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="Training"
        component={TrainingScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="Parent"
        component={ParentScreen}
        options={{ presentation: 'modal', title: 'Elternbereich' }}
      />
      <Stack.Screen
        name="ProfileManager"
        component={ProfileManagerScreen}
        options={{ title: 'Profile' }}
      />
      <Stack.Screen
        name="ParentalGate"
        component={ParentalGateScreen}
        options={{ title: 'Zugangsprüfung' }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{ title: 'Verwaltung' }}
      />
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Analytics' }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ title: 'Hilfe' }}
      />
      </Stack.Navigator>
    </Suspense>
  );
};

export default RootNavigator;
