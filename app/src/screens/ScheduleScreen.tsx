import React from 'react';
import { StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import VisualSchedule from '../components/VisualSchedule';
import BottomNav from '../components/BottomNav';
import type { RootStackParamList } from '../navigation/types';
import { logger } from '../utils/logger';
import ScreenBackground from '../components/ScreenBackground';

export default function ScheduleScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'Schedule'>;
}) {
  const handleActivityPress = () => {
    // Navigate to practice screen with the selected activity
    navigation.navigate('Practice');
  };

  const handleScheduleComplete = () => {
    // Could show a celebration or navigate somewhere
    logger.info('Schedule completed!');
  };

  return (
    <>
      <ScreenBackground style={styles.container}>
        <VisualSchedule
          onActivityPress={handleActivityPress}
          onScheduleComplete={handleScheduleComplete}
        />
      </ScreenBackground>
      <BottomNav active="training" profileId="default" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});