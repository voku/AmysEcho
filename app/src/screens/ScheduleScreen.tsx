import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import VisualSchedule from '../components/VisualSchedule';
import type { RootStackParamList } from '../navigation/types';
import { logger } from '../utils/logger';
import ScreenBackground from '../components/ScreenBackground';
import BottomNav from '../components/BottomNav';

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
    <View style={styles.screen}>
      <ScreenBackground style={styles.container}>
        <View style={styles.content}>
          <VisualSchedule
            onActivityPress={handleActivityPress}
            onScheduleComplete={handleScheduleComplete}
          />
        </View>
      </ScreenBackground>
      <BottomNav active="training" profileId="default" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
  },
});
