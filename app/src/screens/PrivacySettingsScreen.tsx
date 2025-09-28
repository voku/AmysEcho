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
    <View style={styles.screen}>
      <ScreenBackground style={styles.background}>
        <PrivacySettings onClose={handleClose} backgroundColor="transparent" />
      </ScreenBackground>
      <BottomNav active="parent" profileId="default" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
