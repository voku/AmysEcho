import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import CommunicationInsights from '../components/CommunicationInsights';
import BottomNav from '../components/BottomNav';
import ScreenBackground from '../components/ScreenBackground';
import { loadProfile, Profile } from '../storage';

import type { RootStackParamList } from '../navigation/types';

export default function CommunicationInsightsScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'CommunicationInsights'>;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <>
      <ScreenBackground style={styles.container} testID="communication-insights-screen">
        <CommunicationInsights onClose={handleClose} />
      </ScreenBackground>
      {profile && <BottomNav active="parent" profileId={profile.id} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});