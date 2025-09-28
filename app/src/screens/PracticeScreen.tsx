import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Button,
  StyleSheet,
  Text,
  FlatList,
  Animated,
} from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import { gestureModel, GestureModelEntry } from '../model';
import BottomNav from '../components/BottomNav';
import { loadProfile, Profile } from '../storage';
import ScreenBackground from '../components/ScreenBackground';

export default function PracticeScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targetSamples, setTargetSamples] = useState<number>(3);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .catch(() => {});
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const styles = createStyles(largeText, highContrast);
  const renderItem = ({ item }: { item: GestureModelEntry }) => (
    <View style={styles.item}>
      <Button
        title={item.label}
        testID={`practice-${item.id}`}
        accessibilityLabel={`Übe ${item.label}`}
        onPress={() => {
          const params: any = { gestureLabel: item.id, isPractice: true };
          if (targetSamples !== 3) params.targetSamples = targetSamples;
          navigation.navigate('Training', params);
        }}
      />
    </View>
  );

  return (
    <ScreenBackground>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <View style={styles.container}>
          <Text style={styles.title}>Gesten üben</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.md }}>
            <Button title="3" onPress={() => setTargetSamples(3)} accessibilityLabel="3 Beispiele" color={targetSamples===3? COLORS.primaryAccent : undefined} />
            <View style={{ width: SPACING.sm }} />
            <Button title="5" onPress={() => setTargetSamples(5)} accessibilityLabel="5 Beispiele" color={targetSamples===5? COLORS.primaryAccent : undefined} />
            <View style={{ width: SPACING.sm }} />
            <Button title="8" onPress={() => setTargetSamples(8)} accessibilityLabel="8 Beispiele" color={targetSamples===8? COLORS.primaryAccent : undefined} />
          </View>
          <FlatList
            data={gestureModel.gestures}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>Keine Gesten verfügbar</Text>}
          />
        </View>
      </Animated.View>
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </ScreenBackground>
  );
}

const createStyles = (largeText: boolean, highContrast: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    title: {
      fontSize: largeText ? 28 : 24,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    list: { gap: SPACING.sm },
    item: { marginBottom: SPACING.sm },
    empty: {
      textAlign: 'center',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });
