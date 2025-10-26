
import React, { Suspense } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import {
  APP_TAB_ROUTES,
  AppTabsParamList,
  LernenStackParamList,
  LERNEN_STACK_ROUTES,
  ROOT_STACK_ROUTES,
  RootStackParamList,
} from './types';
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
const LernenStack = createStackNavigator<LernenStackParamList>();

const workflowOptions = <RouteName extends keyof AppTabsParamList>(routeName: RouteName) => {
  const meta = getWorkflowStepMeta(routeName);
  return {
    tabBarLabel: meta.label,
    tabBarAccessibilityLabel: meta.accessibilityLabel ?? meta.accessibilityHint ?? routeName,
  };
};

const LernenWorkflowStack = () => (
  <LernenStack.Navigator
    initialRouteName={LERNEN_STACK_ROUTES.LernenHome}
    screenOptions={{
      headerShown: false,
    }}
  >
    <LernenStack.Screen name={LERNEN_STACK_ROUTES.LernenHome} component={LernenScreen} />
    <LernenStack.Screen name={LERNEN_STACK_ROUTES.Recording} component={RecordingScreen} />
  </LernenStack.Navigator>
);

const AppTabs = ({
  route,
}: {
  route: RouteProp<RootStackParamList, 'App'>;
}) => {
  const initialRouteName = route?.params?.screen ?? APP_TAB_ROUTES.Recognition;

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props: BottomTabBarProps) => <NewBottomNav {...props} />}
    >
      <Tab.Screen
        name={APP_TAB_ROUTES.Recognition}
        component={RecognitionScreen}
        options={workflowOptions('Recognition')}
      />
      <Tab.Screen
        name={APP_TAB_ROUTES.History}
        component={HistoryScreen}
        options={workflowOptions('History')}
      />
      <Tab.Screen
        name={APP_TAB_ROUTES.Lernen}
        component={LernenWorkflowStack}
        options={workflowOptions('Lernen')}
      />
    </Tab.Navigator>
  );
};

const noopScreen = () => null;

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
      <Stack.Screen
        name={ROOT_STACK_ROUTES.Recording}
        component={noopScreen}
        listeners={({ navigation, route }) => ({
          focus: () => {
            navigation.replace(ROOT_STACK_ROUTES.App, {
              screen: APP_TAB_ROUTES.Lernen,
              params: {
                screen: LERNEN_STACK_ROUTES.Recording,
                params: route.params,
              },
            });
          },
        })}
      />
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
