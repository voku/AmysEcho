import React from 'react';
import { StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import CommunicationInsights from '../components/CommunicationInsights';
import BottomNav from '../components/BottomNav';
import ScreenBackground from '../components/ScreenBackground';

import type { RootStackParamList } from '../navigation/types';

export default function CommunicationInsightsScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'CommunicationInsights'>;
}) {
  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <>
      <ScreenBackground style={styles.container} testID="communication-insights-screen">
        <CommunicationInsights onClose={handleClose} />
      </ScreenBackground>
      <BottomNav active="parent" profileId="default" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});