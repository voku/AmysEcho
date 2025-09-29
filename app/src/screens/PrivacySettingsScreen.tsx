import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationProp } from '@react-navigation/native';
import PrivacySettings from '../components/PrivacySettings';
import BottomNav from '../components/BottomNav';
import ScreenBackground from '../components/ScreenBackground';
import { SPACING } from '../constants/ui';

import type { RootStackParamList } from '../navigation/types';

export default function PrivacySettingsScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'PrivacySettings'>;
}) {
  const insets = useSafeAreaInsets();
  const handleClose = () => {
    navigation.goBack();
  };

  const navInsetsStyle = React.useMemo(
    () => ({
      paddingBottom: insets.bottom + SPACING.lg,
    }),
    [insets.bottom],
  );

  return (
    <View style={styles.screen}>
      <ScreenBackground>
        <PrivacySettings onClose={handleClose} backgroundColor="transparent" />
      </ScreenBackground>
      <View style={[styles.navContainer, navInsetsStyle]}>
        <BottomNav active="parent" profileId="default" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navContainer: {
    paddingHorizontal: SPACING.lg,
  },
});
