
export type RootStackParamList = {
  Hero: undefined;
  App: undefined;
  Onboarding: undefined;
  Tutorial: undefined;
  ProfileSelect: undefined;
  Recognition: { profileId?: string; simulateLowConfidence?: boolean } | undefined;
  History: undefined;
  Lernen: { gestureId?: string; gestureLabel?: string } | undefined;
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

export type AppTabsParamList = {
  Recognition: undefined;
  History: undefined;
  Lernen: undefined;
};
