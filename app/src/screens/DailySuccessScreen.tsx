import React from 'react';
import { StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import DailySuccessSummary from '../components/DailySuccessSummary';
import BottomNav from '../components/BottomNav';
import ScreenBackground from '../components/ScreenBackground';

import type { RootStackParamList } from '../navigation/types';

export default function DailySuccessScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'DailySuccess'>;
}) {
  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <>
      <ScreenBackground style={styles.container}>
        <DailySuccessSummary onClose={handleClose} />
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