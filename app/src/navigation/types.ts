export type RootStackParamList = {
  ProfileSelect: undefined;
  ProfileManager: undefined;
  Recognition: { profileId?: string } | undefined;
  Admin: { profileId?: string } | undefined;
  Parent: undefined;
  Learning: { profileId: string };
  Training: { profileId?: string } | undefined;
  LegacyTraining: undefined;
  Correction: undefined;
  Dashboard: undefined;
  Onboarding: undefined;
  Help: undefined;
};
