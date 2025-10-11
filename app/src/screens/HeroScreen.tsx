import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import { AmyLoopTimeline } from '../components/AmyLoopTimeline';
import { AmyFirstCommitments } from '../components/AmyFirstCommitments';
import PrimaryButton from '../components/PrimaryButton';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';

type HeroScreenProps = {
  navigation: any;
};

const HeroScreen: React.FC<HeroScreenProps> = ({ navigation }) => {
  return (
    <ScreenBackground testID="hero-screen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.pill}>Amy First</Text>
          <Text style={styles.title}>Amy&apos;s Echo</Text>
          <Text style={styles.subtitle}>
            Jede Gebärde wird sofort verstanden – gesprochen, angezeigt und gesichert.
          </Text>
        </View>

        <View style={styles.timelineWrapper}>
          <AmyLoopTimeline activeStage="see" />
        </View>

        <AmyFirstCommitments />

        <View style={styles.ctaRow}>
          <PrimaryButton
            label="Zur Gestenkamera"
            onPress={() => navigation.replace('App')}
            accessibilityLabel="Zur Gestenkamera wechseln"
            testID="hero-start"
            style={styles.ctaButton}
          />
          <PrimaryButton
            label="Training öffnen"
            onPress={() => navigation.navigate('Lernen')}
            variant="secondary"
            accessibilityLabel="Zum Trainingsbereich wechseln"
            testID="hero-train"
            style={styles.ctaButton}
          />
        </View>
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
    gap: spacing.lg,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    color: Colors.inverseText,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.extrabold as any,
    color: Colors.text,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: typography.sizes.subtitle,
    color: Colors.text,
    textAlign: 'center',
    maxWidth: 520,
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
});

export default HeroScreen;
