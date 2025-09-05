import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import VisualSchedule from '../components/VisualSchedule';
import BottomNav from '../components/BottomNav';

import type { RootStackParamList } from '../navigation/types';

export default function ScheduleScreen({
  navigation,
}: {
  navigation: NavigationProp<RootStackParamList, 'Schedule'>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleActivityPress = (_activity: any) => {
    // Navigate to practice screen with the selected activity
    navigation.navigate('Practice');
  };

  const handleScheduleComplete = () => {
    // Could show a celebration or navigate somewhere
    console.log('Schedule completed!');
  };

  return (
    <View style={styles.container}>
      <VisualSchedule
        onActivityPress={handleActivityPress}
        onScheduleComplete={handleScheduleComplete}
      />
      <BottomNav active="training" profileId="default" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});