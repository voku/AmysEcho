import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import { AmyLoopTimeline } from '../components/AmyLoopTimeline';
import { AmyFirstCommitments } from '../components/AmyFirstCommitments';
import PrimaryButton from '../components/PrimaryButton';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation/types';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES } from '../navigation/types';
import WorkflowSupportLinks from '../components/WorkflowSupportLinks';

type HeroScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, typeof ROOT_STACK_ROUTES.Hero>;
};

const HeroScreen: React.FC<HeroScreenProps> = ({ navigation }) => {
  return (
    <ScreenBackground scrollable testID="hero-screen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.pill}>Amy hört zu</Text>
          <Text style={styles.title} testID="hero-title">
            Willkommen bei Amy&apos;s Echo
          </Text>
          <Text style={styles.subtitle} testID="hero-subtitle">
            Die Gestenkamera übersetzt jedes Zeichen direkt in Stimme, Symbole und Verlauf.
            So bleibt Amys Gespräch nie stehen.
          </Text>
        </View>

        <View style={styles.timelineWrapper}>
          <AmyLoopTimeline activeStage="Recognition" />
        </View>

        <AmyFirstCommitments />

        <View style={styles.ctaRow}>
          <PrimaryButton
            label="Zur Gestenkamera"
            onPress={() => navigation.replace(ROOT_STACK_ROUTES.App, { screen: APP_TAB_ROUTES.Recognition })}
            accessibilityLabel="Zur Gestenkamera wechseln"
            testID="hero-start"
            style={styles.ctaButton}
          />
          <PrimaryButton
            label="Lernen entdecken"
            onPress={() => {
              navigation.navigate(ROOT_STACK_ROUTES.App, { screen: APP_TAB_ROUTES.Lernen });
            }}
            variant="secondary"
            accessibilityLabel="Zum Trainingsbereich wechseln"
            testID="hero-train"
            style={styles.ctaButton}
          />
        </View>

        <WorkflowSupportLinks style={styles.supportLinks} />
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    gap: spacing['2xl'],
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: Colors.secondary,
    color: Colors.neutral,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold,
    letterSpacing: 1.1,
  },
  title: {
    fontSize: typography.sizes.titleLg,
    fontWeight: typography.weights.extrabold,
    color: Colors.inverseText,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.sizes.bodyLg,
    color: Colors.inverseText,
    textAlign: 'center',
    maxWidth: 560,
    lineHeight: typography.lineHeights.relaxed,
  },
  timelineWrapper: {
    width: '100%',
  },
  ctaRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  ctaButton: {
    flex: 1,
  },
  supportLinks: {
    marginTop: spacing['2xl'],
  },
});

export default HeroScreen;
