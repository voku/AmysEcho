import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import PrivacySettings from '../components/PrivacySettings';
import BottomNav from '../components/BottomNav';
import ScreenBackground from '../components/ScreenBackground';

import type { RootStackParamList } from '../navigation/types';

export default function PrivacySettingsScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'PrivacySettings'>;
}) {
  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <ScreenBackground style={styles.container}>
      <PrivacySettings onClose={handleClose} />
      <BottomNav active="parent" profileId="default" />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});