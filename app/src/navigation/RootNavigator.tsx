
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileSelectScreen from '../screens/ProfileSelectScreen';
import RecognitionScreen from '../screens/RecognitionScreen';
import CorrectionScreen from '../screens/CorrectionScreen';
import TrainingScreen from '../screens/TrainingScreen';
import ParentScreen from '../screens/ParentScreen';
import ProfileManagerScreen from '../screens/ProfileManagerScreen';
import ParentalGateScreen from '../screens/ParentalGateScreen';
import AdminScreen from '../screens/AdminScreen';
import DashboardScreen from '../screens/DashboardScreen';
import HelpScreen from '../screens/HelpScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Onboarding">
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
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
  );
};

export default RootNavigator;
