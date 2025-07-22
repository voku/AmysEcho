export type RootStackParamList = {
  ProfileSelect: undefined;
  ProfileManager: undefined;
  Recognition: { profileId?: string } | undefined;
  Admin: { profileId?: string } | undefined;
  Parent: undefined;
  Learning: { profileId: string };
  Training: { profileId?: string } | undefined;
  Dashboard: undefined;
  Onboarding: undefined;
};
