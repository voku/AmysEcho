
import React, { Suspense } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { AppTabsParamList, RootStackParamList } from './types';
import LoadingIndicator from '../components/LoadingIndicator';
import NewBottomNav from '../components/NewBottomNav';

const lazyScreen = (
  factory: () => Promise<any>,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  React.lazy(
    factory as () => Promise<{ default: React.ComponentType<any> }>,
  );

const RecognitionScreen = lazyScreen(() => import('../screens/RecognitionScreen'));
const HistoryScreen = lazyScreen(() => import('../screens/HistoryScreen'));
const LernenScreen = lazyScreen(() => import('../screens/LernenScreen'));
const RecordingScreen = lazyScreen(() => import('../screens/RecordingScreen'));
const HeroScreen = lazyScreen(() => import('../screens/HeroScreen'));

const Tab = createBottomTabNavigator<AppTabsParamList>();
const Stack = createStackNavigator<RootStackParamList>();

const AppTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
    }}
    tabBar={(props: BottomTabBarProps) => <NewBottomNav {...props} />}
  >
    <Tab.Screen
      name="Recognition"
      component={RecognitionScreen}
      options={{ tabBarLabel: 'Kamera' }}
    />
    <Tab.Screen
      name="History"
      component={HistoryScreen}
      options={{ tabBarLabel: 'History' }}
    />
    <Tab.Screen
      name="Lernen"
      component={LernenScreen}
      options={{ tabBarLabel: 'Lernen' }}
    />
  </Tab.Navigator>
);

const RootNavigator = () => (
  <Suspense fallback={<LoadingIndicator />}>
    <Stack.Navigator
      initialRouteName="Hero"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Hero" component={HeroScreen} />
      <Stack.Screen name="App" component={AppTabs} />
      <Stack.Screen name="Recording" component={RecordingScreen} />
    </Stack.Navigator>
  </Suspense>
);

export default RootNavigator;
