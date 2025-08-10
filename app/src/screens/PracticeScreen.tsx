import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Button,
  StyleSheet,
  SafeAreaView,
  Text,
  FlatList,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import { gestureModel, GestureModelEntry } from '../model';
import BottomNav from '../components/BottomNav';
import { loadProfile, Profile } from '../storage';

export default function PracticeScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
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
  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);

  const renderItem = ({ item }: { item: GestureModelEntry }) => (
    <View style={styles.item}>
      <Button
        title={item.label}
        testID={`practice-${item.id}`}
        accessibilityLabel={`Übe ${item.label}`}
        onPress={() =>
          navigation.navigate('Training', {
            gestureLabel: item.id,
            isPractice: true,
          })
        }
      />
    </View>
  );

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>Practice Gestures</Text>
          <FlatList
            data={gestureModel.gestures}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No gestures available</Text>}
          />
        </SafeAreaView>
      </Animated.View>
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </LinearGradient>
  );
}

const createStyles = (largeText: boolean, highContrast: boolean) =>
  StyleSheet.create({
    container: { flex: 1, padding: SPACING.lg },
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
