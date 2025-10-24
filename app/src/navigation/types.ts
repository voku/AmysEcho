
import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';

export type AppTabsParamList = {
  Recognition: { profileId?: string; simulateLowConfidence?: boolean } | undefined;
  History: undefined;
  Lernen: { gestureId?: string; gestureLabel?: string } | undefined;
};

export type RootStackParamList = {
  Hero: undefined;
  App: NavigatorScreenParams<AppTabsParamList> | undefined;
  Onboarding: undefined;
  Tutorial: undefined;
  ProfileSelect: undefined;
  Recording: { gestureId?: string; gestureLabel?: string } | undefined;
  Training: { gestureLabel?: string; isPractice?: boolean } | undefined;
  Teach: undefined;
  Teaching: { gestureId?: string } | undefined;
  Parent: undefined;
  ProfileManager: undefined;
  ParentalGate: { target: string };
  Admin: undefined;
  Dashboard: undefined;
  Progress: undefined;
  ProgressChart: { gestureId: string };
  CaregiverReport: undefined;
  CommunicationInsights: undefined;
  Help: undefined;
};

export type TabNavigationProp<RouteName extends keyof AppTabsParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<AppTabsParamList, RouteName>,
  StackNavigationProp<RootStackParamList>
>;

export const APP_TAB_ROUTES = {
  Recognition: 'Recognition',
  History: 'History',
  Lernen: 'Lernen',
} as const satisfies Record<keyof AppTabsParamList, keyof AppTabsParamList>;

export const ROOT_STACK_ROUTES = {
  Hero: 'Hero',
  App: 'App',
  Onboarding: 'Onboarding',
  Tutorial: 'Tutorial',
  ProfileSelect: 'ProfileSelect',
  Recording: 'Recording',
  Training: 'Training',
  Teach: 'Teach',
  Teaching: 'Teaching',
  Parent: 'Parent',
  ProfileManager: 'ProfileManager',
  ParentalGate: 'ParentalGate',
  Admin: 'Admin',
  Dashboard: 'Dashboard',
  Progress: 'Progress',
  ProgressChart: 'ProgressChart',
  CaregiverReport: 'CaregiverReport',
  CommunicationInsights: 'CommunicationInsights',
  Help: 'Help',
} as const satisfies Record<keyof RootStackParamList, keyof RootStackParamList>;

export type AppTabRouteName = (typeof APP_TAB_ROUTES)[keyof typeof APP_TAB_ROUTES];
export type RootStackRouteName = (typeof ROOT_STACK_ROUTES)[keyof typeof ROOT_STACK_ROUTES];
