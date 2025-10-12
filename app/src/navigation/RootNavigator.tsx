
import React, { Suspense } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { AppTabsParamList, RootStackParamList } from './types';
import LoadingIndicator from '../components/LoadingIndicator';
import NewBottomNav from '../components/NewBottomNav';
import { getWorkflowStepMeta } from '../constants/workflow';

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
const OnboardingScreen = lazyScreen(() => import('../screens/OnboardingScreen'));
const TutorialScreen = lazyScreen(() => import('../screens/GestureTutorialScreen'));
const ProfileSelectScreen = lazyScreen(() => import('../screens/ProfileSelectScreen'));
const TrainingScreen = lazyScreen(() => import('../screens/TrainingScreen'));
const TeachScreen = lazyScreen(() => import('../screens/TeachScreen'));
const TeachingScreen = lazyScreen(() => import('../screens/TeachingScreen'));
const ParentScreen = lazyScreen(() => import('../screens/ParentScreen'));
const ProfileManagerScreen = lazyScreen(() => import('../screens/ProfileManagerScreen'));
const ParentalGateScreen = lazyScreen(() => import('../screens/ParentalGateScreen'));
const AdminScreen = lazyScreen(() => import('../screens/AdminScreen'));
const DashboardScreen = lazyScreen(() => import('../screens/DashboardScreen'));
const ProgressScreen = lazyScreen(() => import('../screens/ProgressScreen'));
const ProgressChartScreen = lazyScreen(() => import('../screens/ProgressChartScreen'));
const CaregiverReportScreen = lazyScreen(() => import('../screens/CaregiverReportScreen'));
const CommunicationInsightsScreen = lazyScreen(
  () => import('../screens/CommunicationInsightsScreen'),
);
const HelpScreen = lazyScreen(() => import('../screens/HelpScreen'));

const Tab = createBottomTabNavigator<AppTabsParamList>();
const Stack = createStackNavigator<RootStackParamList>();

const workflowOptions = <RouteName extends keyof AppTabsParamList>(routeName: RouteName) => {
  const meta = getWorkflowStepMeta(routeName as string);
  return {
    tabBarLabel: meta?.label ?? routeName,
    tabBarAccessibilityLabel:
      meta?.accessibilityLabel ?? meta?.accessibilityHint ?? (routeName as string),
  };
};

const AppTabs = ({
  route,
}: {
  route: RouteProp<RootStackParamList, 'App'>;
}) => {
  const initialRouteName = route?.params?.screen ?? 'Recognition';

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props: BottomTabBarProps) => <NewBottomNav {...props} />}
    >
      <Tab.Screen
        name="Recognition"
        component={RecognitionScreen}
        options={workflowOptions('Recognition')}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={workflowOptions('History')}
      />
      <Tab.Screen
        name="Lernen"
        component={LernenScreen}
        options={workflowOptions('Lernen')}
      />
    </Tab.Navigator>
  );
};

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
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Tutorial" component={TutorialScreen} />
      <Stack.Screen name="ProfileSelect" component={ProfileSelectScreen} />
      <Stack.Screen name="Recording" component={RecordingScreen} />
      <Stack.Screen name="Training" component={TrainingScreen} />
      <Stack.Screen name="Teach" component={TeachScreen} />
      <Stack.Screen name="Teaching" component={TeachingScreen} />
      <Stack.Screen name="Parent" component={ParentScreen} />
      <Stack.Screen name="ProfileManager" component={ProfileManagerScreen} />
      <Stack.Screen name="ParentalGate" component={ParentalGateScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Progress" component={ProgressScreen} />
      <Stack.Screen name="ProgressChart" component={ProgressChartScreen} />
      <Stack.Screen name="CaregiverReport" component={CaregiverReportScreen} />
      <Stack.Screen name="CommunicationInsights" component={CommunicationInsightsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
    </Stack.Navigator>
  </Suspense>
);

export default RootNavigator;
