// React imports
import React, { useState, useEffect, memo, useCallback } from 'react';

// React Native imports
import { View, Pressable, Text, StyleSheet, FlatList } from 'react-native';

// Third-party imports
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';

// Local imports
import { COLORS, SPACING } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { useTheme } from '../context/ThemeContext';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';

// Type imports
import type { StyleProp, ViewStyle } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

interface BottomNavProps {
  active: 'recognition' | 'training' | 'parent';
  profileId: string;
}

const BottomNavComponent = ({ active, profileId }: BottomNavProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { highContrast } = useAccessibility();
  const { theme } = useTheme();
  const [navHistory, setNavHistory] = useState<Array<{name: string; title: string; canGoBack: boolean}>>([]);

  // Memoize navigation functions to prevent unnecessary re-renders
  const navigateToRecognition = useCallback(() => {
    void childHaptic();
    navigation.navigate('App', { screen: 'Recognition', params: { profileId } });
  }, [navigation, profileId]);

  const navigateToTraining = useCallback(() => {
    void childHaptic();
    navigation.navigate('App', { screen: 'Lernen' });
  }, [navigation]);

  const navigateToProfileSelect = useCallback(() => {
    void childHaptic();
    navigation.navigate('ProfileSelect');
  }, [navigation]);

  // Enhanced breadcrumb system - show navigation path
  const getCurrentScreenName = useCallback(() => {
    const screenNames: Record<string, string> = {
      App: '🏠 Zuhören',
      Recognition: '🏠 Zuhören',
      'Lernen': '🎯 Lernen',
      'Help': '❓ Hilfe',
      'Dashboard': '📊 Auswertung',
      'Progress': '📈 Fortschritt',
      'Parent': '👨‍👩‍👧 Eltern',
      'ProfileSelect': '👤 Profile',
      'ProfileManager': '⚙️ Einstellungen',
    };
    return screenNames[route.name] || route.name;
  }, [route.name]);

  useEffect(() => {
    // Update navigation history
    const currentScreen = getCurrentScreenName();
    const canGoBack = navigation.canGoBack();
    setNavHistory(prev => {
      const newHistory = [...prev];
      // Keep only last 3 screens for breadcrumb
      const lastEntry = newHistory[newHistory.length - 1];
      if (!lastEntry || lastEntry.name !== route.name) {
        newHistory.push({
          name: route.name,
          title: currentScreen,
          canGoBack
        });
        if (newHistory.length > 3) {
          newHistory.shift();
        }
      }
      return newHistory;
    });
  }, [route.name, getCurrentScreenName, navigation]);
  return (
    <View style={[styles.container, highContrast && styles.containerHC, { backgroundColor: highContrast ? COLORS.highContrastBackground : theme.colors.surface }]}>
      {/* Single Button Navigation - Amy First: Always provide clear way back to recognition */}
      <View style={[styles.homeButtonContainer, highContrast && styles.homeButtonContainerHC, { backgroundColor: highContrast ? COLORS.highContrastText : theme.colors.primary }]}>
        <Pressable
          onPress={navigateToRecognition}
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.homeButton,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          accessibilityLabel="Zurück zur Gestenerkennung"
          accessibilityRole="button"
          accessibilityHint="Einfacher Weg zurück zur Hauptseite"
        >
          <Text style={[styles.homeButtonText, highContrast && styles.homeButtonTextHC, { color: highContrast ? COLORS.highContrastBackground : theme.colors.surface }]}>
            🏠 Zuhören
          </Text>
        </Pressable>
      </View>

      {/* Enhanced Visual Breadcrumb Trail */}
      <View style={[styles.breadcrumbContainer, highContrast && styles.breadcrumbContainerHC, { backgroundColor: highContrast ? COLORS.highContrastBackground : theme.colors.background }]}>
        <FlatList
          horizontal
          data={navHistory}
          keyExtractor={(item) => item.name}
          renderItem={({ item, index }) => (
            <View style={styles.breadcrumbItem}>
              {index > 0 && <Text style={[styles.breadcrumbSeparator, highContrast && styles.breadcrumbSeparatorHC]}> › </Text>}
              {index < navHistory.length - 1 ? (
                <Pressable
                  onPress={() => {
                    void childHaptic();
                    // Navigate back to this screen
                    const stepsBack = navHistory.length - 1 - index;
                    for (let i = 0; i < stepsBack; i++) {
                      if (navigation.canGoBack()) {
                        navigation.goBack();
                      }
                    }
                  }}
                  style={({ pressed }) => [
                    styles.breadcrumbPressable,
                    pressed && styles.breadcrumbPressed,
                  ]}
                  accessibilityLabel={`Zurück zu ${item.title}`}
                  accessibilityRole="button"
                >
                  <Text style={[
                    styles.breadcrumbText,
                    styles.breadcrumbClickable,
                    highContrast && styles.breadcrumbTextHC,
                    { color: highContrast ? COLORS.highContrastText : theme.colors.primary }
                  ]}>
                    {item.title}
                  </Text>
                </Pressable>
              ) : (
                <Text style={[
                  styles.breadcrumbText,
                  highContrast && styles.breadcrumbTextHC,
                  { color: highContrast ? COLORS.highContrastText : theme.colors.text }
                ]}>
                  {item.title}
                </Text>
              )}
            </View>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbList}
        />
      </View>

      {/* Navigation Buttons */}
      <View style={styles.navContainer}>
        <Pressable
          onPress={navigateToRecognition}
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.item,
            active === 'recognition' && styles.homeButton,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          accessibilityLabel="Zuhören"
          accessibilityRole="button"
          accessibilityHint="Zurück zur Gestenerkennung"
        >
          <HandIcon
            size={24}
            color={
              highContrast
                ? active === 'recognition'
                  ? COLORS.highContrastText
                  : COLORS.highContrastPressed
                : active === 'recognition'
                ? theme.colors.primary
                : theme.colors.secondary
            }
            style={styles.icon}
          />
          <Text
            style={[
              styles.label,
              highContrast && styles.labelHC,
              active === 'recognition' && (highContrast ? styles.activeHC : styles.active),
            ]}
          >
            Zuhören
          </Text>
        </Pressable>
        <Pressable
          onPress={navigateToTraining}
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.item,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          accessibilityLabel="Lernen"
          accessibilityRole="button"
          accessibilityHint="Gesten aufnehmen oder üben"
        >
          <BookIcon
            size={24}
            color={
              highContrast
                ? active === 'training'
                  ? COLORS.highContrastText
                  : COLORS.highContrastPressed
                : active === 'training'
                ? theme.colors.primary
                : theme.colors.secondary
            }
            style={styles.icon}
          />
          <Text
            style={[
              styles.label,
              highContrast && styles.labelHC,
              active === 'training' && (highContrast ? styles.activeHC : styles.active),
            ]}
          >
            Lernen
          </Text>
        </Pressable>
        <Pressable
          onPress={navigateToProfileSelect}
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.item,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          accessibilityLabel="Menü"
          accessibilityRole="button"
          accessibilityHint="Profil- und Einstellungsmenü öffnen"
        >
          <SettingsIcon
            size={24}
            color={
              highContrast
                ? active === 'parent'
                  ? COLORS.highContrastText
                  : COLORS.highContrastPressed
                : active === 'parent'
                ? theme.colors.primary
                : theme.colors.secondary
            }
            style={styles.icon}
          />
          <Text
            style={[
              styles.label,
              highContrast && styles.labelHC,
              active === 'parent' && (highContrast ? styles.activeHC : styles.active),
            ]}
          >
            Menü
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

// Custom comparison function for React.memo
const arePropsEqual = (prevProps: BottomNavProps, nextProps: BottomNavProps): boolean => {
  return (
    prevProps.active === nextProps.active &&
    prevProps.profileId === nextProps.profileId
  );
};

export default memo(BottomNavComponent, arePropsEqual);

const styles = StyleSheet.create({
    container: {
      borderTopWidth: 1,
    },
    containerHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderColor: COLORS.highContrastText,
    },
    homeButtonContainer: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      marginHorizontal: SPACING.md,
      marginTop: SPACING.sm,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    homeButtonContainerHC: {
      backgroundColor: COLORS.highContrastText,
      shadowColor: COLORS.highContrastText,
    },
    homeButton: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.sm,
    },
    homeButtonText: {
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    homeButtonTextHC: {
      color: COLORS.highContrastBackground,
    },
    breadcrumbContainer: {
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      alignItems: 'center',
      borderBottomWidth: 1,
    },
    breadcrumbContainerHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderColor: COLORS.highContrastText,
    },
    breadcrumbText: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    breadcrumbTextHC: {
      color: COLORS.highContrastText,
    },
    breadcrumbList: {
      paddingHorizontal: SPACING.sm,
      alignItems: 'center',
    },
    breadcrumbItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    breadcrumbSeparator: {
      color: COLORS.textMuted,
      fontSize: 14,
      fontWeight: 'bold',
    },
    breadcrumbSeparatorHC: {
      color: COLORS.highContrastText,
    },
    breadcrumbPressable: {
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      borderRadius: 6,
    },
    breadcrumbPressed: {
      backgroundColor: COLORS.pressed,
    },
    breadcrumbClickable: {
      textDecorationLine: 'underline',
    },
    navContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
    },
    item: {
      alignItems: 'center',
    },
    buttonPressed: { backgroundColor: COLORS.pressed },
    buttonPressedHC: { backgroundColor: COLORS.highContrastPressed },
    icon: {
      marginBottom: SPACING.xs,
    },
    label: {
      fontSize: 12,
    },
    labelHC: {
      color: COLORS.highContrastPressed,
    },
    active: {
      fontWeight: 'bold',
    },
    activeHC: {
      color: COLORS.highContrastText,
      fontWeight: 'bold',
    },
  });

interface IconProps {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}

function HandIcon({ size, color, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <Path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <Path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <Path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </Svg>
  );
}

function BookIcon({ size, color, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d="M12 7v14" />
      <Path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </Svg>
  );
}

function SettingsIcon({ size, color, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );
}
