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
import type { WorkflowRouteName } from '../constants/workflow';
import WorkflowSupportLinks from '../components/WorkflowSupportLinks';

type HeroScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, typeof ROOT_STACK_ROUTES.Hero>;
};

const HeroScreen: React.FC<HeroScreenProps> = ({ navigation }) => {
  const handleTimelinePress = React.useCallback(
    (route: WorkflowRouteName) => {
      navigation.navigate(
        ROOT_STACK_ROUTES.App,
        {
          screen: route,
        },
        { pop: true },
      );
    },
    [navigation],
  );

  return (
    <ScreenBackground scrollable testID="hero-screen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.pill}>Amy’s Echo hört zu</Text>
          <Text style={styles.title} testID="hero-title">
            Willkommen bei Amy’s Echo
          </Text>
          <Text style={styles.subtitle} testID="hero-subtitle">
            Die Gestenkamera übersetzt jedes Zeichen direkt in Stimme, Symbole und Verlauf.
            So bleibt das Gespräch mit Amy’s Echo nie stehen.
          </Text>
        </View>

        <View style={styles.timelineWrapper}>
          <AmyLoopTimeline
            activeStage={APP_TAB_ROUTES.Recognition}
            layout="inline"
            compact
            hideDescriptions
            onStagePress={handleTimelinePress}
          />
        </View>

        <View style={styles.ctaRow}>
          <PrimaryButton
            label="Zur Gestenkamera"
            onPress={() =>
              navigation.replace(ROOT_STACK_ROUTES.App, {
                screen: APP_TAB_ROUTES.Recognition,
              })
            }
            accessibilityLabel="Zur Gestenkamera wechseln"
            testID="hero-start"
            style={styles.ctaButton}
          />
          <PrimaryButton
            label="Lernen entdecken"
            onPress={() => {
              navigation.navigate(
                ROOT_STACK_ROUTES.App,
                {
                  screen: APP_TAB_ROUTES.Lernen,
                },
                { pop: true },
              );
            }}
            variant="secondary"
            accessibilityLabel="Zum Trainingsbereich wechseln"
            testID="hero-train"
            style={styles.ctaButton}
          />
        </View>

        <AmyFirstCommitments />

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
    alignItems: 'stretch',
    paddingVertical: spacing.xl,
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
    marginTop: spacing.lg,
  },
  ctaRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  ctaButton: {
    flex: 1,
  },
  supportLinks: {
    marginTop: spacing.xl,
  },
});

export default HeroScreen;
