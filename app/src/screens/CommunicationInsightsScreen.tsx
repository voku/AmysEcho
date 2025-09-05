import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import CommunicationInsights from '../components/CommunicationInsights';
import BottomNav from '../components/BottomNav';

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
    <View style={styles.container}>
      <CommunicationInsights onClose={handleClose} />
      <BottomNav active="parent" profileId="default" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});