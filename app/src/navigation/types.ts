export type RootStackParamList = {
  Onboarding: undefined;
  Tutorial: undefined;
  ProfileSelect: undefined;
  Recognition: { profileId: string; simulateLowConfidence?: boolean };
  Correction: { gesture: string; suggestions: string[] };
  Training: { gestureLabel?: string };
  Parent: undefined;
  ProfileManager: undefined;
  ParentalGate: { target: string };
  Admin: undefined;
  Dashboard: undefined;
  Progress: undefined;
  Help: undefined;
};