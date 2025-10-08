
import React, { Suspense, useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './types';
import { loadProfiles } from '../storage';
import LoadingIndicator from '../components/LoadingIndicator';

const lazyScreen = (
  factory: () => Promise<any>,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  React.lazy(
    factory as () => Promise<{ default: React.ComponentType<any> }>,
  );

const OnboardingScreen = lazyScreen(() => import('../screens/OnboardingScreen'));
const GestureTutorialScreen = lazyScreen(() => import('../screens/GestureTutorialScreen'));
const ProfileSelectScreen = lazyScreen(() => import('../screens/ProfileSelectScreen'));
const RecognitionScreen = lazyScreen(() => import('../screens/RecognitionScreen'));
const TeachScreen = lazyScreen(() => import('../screens/TeachScreen'));
const TrainingScreen = lazyScreen(() => import('../screens/TrainingScreen'));
const TeachingScreen = lazyScreen(() => import('../screens/TeachingScreen'));
const ParentScreen = lazyScreen(() => import('../screens/ParentScreen'));
const ProfileManagerScreen = lazyScreen(() => import('../screens/ProfileManagerScreen'));
const ParentalGateScreen = lazyScreen(() => import('../screens/ParentalGateScreen'));
const AdminScreen = lazyScreen(() => import('../screens/AdminScreen'));
const DashboardScreen = lazyScreen(() => import('../screens/DashboardScreen'));
const HelpScreen = lazyScreen(() => import('../screens/HelpScreen'));
const ProgressScreen = lazyScreen(() => import('../screens/ProgressScreen'));
const ProgressChartScreen = lazyScreen(() => import('../screens/ProgressChartScreen'));
const CaregiverReportScreen = lazyScreen(() => import('../screens/CaregiverReportScreen'));
const CommunicationInsightsScreen = lazyScreen(() => import('../screens/CommunicationInsightsScreen'));

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | undefined>();

  useEffect(() => {
    loadProfiles().then((profiles) => {
      setInitialRoute(profiles.length > 0 ? 'ProfileSelect' : 'Onboarding');
    });
  }, []);

  if (!initialRoute) return <LoadingIndicator />;

  return (
    <Suspense fallback={<LoadingIndicator />}>
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
          name="Teach"
          component={TeachScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Teaching"
          component={TeachingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Training"
          component={TrainingScreen}
          options={{ headerShown: false }}
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
          options={{ title: 'Auswertung' }}
        />
        <Stack.Screen
          name="Progress"
          component={ProgressScreen}
          options={{ title: 'Fortschritt' }}
        />
        <Stack.Screen
          name="ProgressChart"
          component={ProgressChartScreen}
          options={{ title: 'Fortschrittsdiagramm' }}
        />
        <Stack.Screen
          name="Help"
          component={HelpScreen}
          options={{ title: 'Hilfe' }}
        />
        <Stack.Screen
          name="CaregiverReport"
          component={CaregiverReportScreen}
          options={{ title: 'Lernfortschritt' }}
        />
        <Stack.Screen
          name="CommunicationInsights"
          component={CommunicationInsightsScreen}
          options={{ title: 'Kommunikationsmuster' }}
        />
      </Stack.Navigator>
    </Suspense>
  );
};

export default RootNavigator;
