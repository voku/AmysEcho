import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, StyleSheet, TextInput } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { createProfile } from '../storage';
import {
  availableVocabularySets,
  setActiveVocabularySet,
} from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { logHIPEvent } from '../services/hipEvents';
import ScreenBackground from '../components/ScreenBackground';
import PrimaryButton from '../components/PrimaryButton';
import { AmyFirstCommitments } from '../components/AmyFirstCommitments';
import { AmyLoopTimeline } from '../components/AmyLoopTimeline';
import { announceAccessibilityMessage } from '../services/accessibilityService';
import { RootStackParamList } from '../navigation/types';

type StepKey = 'mission' | 'name' | 'accessibility' | 'consent' | 'vocabulary';

type WizardStep = {
  key: StepKey;
  emoji: string;
  title: string;
  description: string;
};

const STEPS: WizardStep[] = [
  {
    key: 'mission',
    emoji: '❤️',
    title: 'Amy zuerst – immer.',
    description:
      'Ich folge dem Amy-First-Versprechen: Sehen → Denken → Sprechen oder Zeigen → Bestätigen → Lernen. So bleibt jedes Gespräch offen und sicher.',
  },
  {
    key: 'name',
    emoji: '👋',
    title: 'Wie darf ich dich nennen?',
    description:
      'Sag mir den Namen, den ich klar und liebevoll sprechen soll. Wenn du keinen Namen eingibst, bleibe ich bei „Amy“.',
  },
  {
    key: 'accessibility',
    emoji: '🫶',
    title: 'Soll der Text größer oder kontrastreicher sein?',
    description:
      'Damit du jede Geste sofort erkennst, kann ich größere Schrift oder stärkeren Kontrast nutzen.',
  },
  {
    key: 'consent',
    emoji: '🛡️',
    title: 'Darf Amy’s Echo anonym beim Lernen helfen?',
    description:
      'Wir teilen nie persönliche Daten. Freigaben helfen nur dabei, dass meine Erkennung für dein Kind und andere klarer wird.',
  },
  {
    key: 'vocabulary',
    emoji: '💬',
    title: 'Welches Wortfeld braucht dein Kind zuerst?',
    description:
      'Wähle das Set, das am besten zu euren ersten Gesprächen passt. Du kannst später jederzeit mehr hinzufügen.',
  },
];

const FALLBACK_STEP = STEPS[0]!;

type OnboardingScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Onboarding'
>;

type OnboardingScreenProps = {
  navigation: OnboardingScreenNavigationProp;
};

const createStyles = (largeText: boolean, highContrast: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.xl,
      justifyContent: 'space-between',
    },
    missionContent: {
      width: '100%',
      gap: SPACING.lg,
    },
    headlineArea: {
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    emoji: {
      fontSize: largeText ? 84 : 72,
      marginBottom: SPACING.lg,
    },
    progressText: {
      fontSize: largeText ? 22 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: SPACING.sm,
      textAlign: 'center',
    },
    title: {
      fontSize: largeText ? 34 : 26,
      textAlign: 'center',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.md,
    },
    description: {
      fontSize: largeText ? 20 : 16,
      textAlign: 'center',
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    input: {
      borderWidth: 2,
      padding: largeText ? SPACING.lg : SPACING.md,
      marginTop: SPACING.xl,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      borderRadius: DEFAULT_RADIUS,
      fontSize: largeText ? 22 : 18,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    toggleRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.lg,
      borderRadius: DEFAULT_RADIUS,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    label: {
      fontSize: largeText ? 22 : 18,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flexShrink: 1,
      paddingRight: SPACING.md,
    },
    switch: { transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] },
    vocabGrid: {
      marginTop: SPACING.xl,
      width: '100%',
    },
    vocabButton: {
      marginVertical: SPACING.xs,
    },
    footer: {
      marginTop: SPACING.xl,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
  });

export default function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const [name, setName] = useState('');
  const [consentDataUpload, setConsentDataUpload] = useState(false);
  const [consentHelpMeGetSmarter, setConsentHelpMeGetSmarter] = useState(false);
  const [vocabSet, setVocabSet] = useState('basic');
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const { update } = useAccessibility();

  const totalSteps = STEPS.length;
  const activeStep = React.useMemo<WizardStep>(() => {
    const step = STEPS[currentStep];
    if (!step) {
      return FALLBACK_STEP;
    }
    return step;
  }, [currentStep]);

  const styles = useMemo(
    () => createStyles(largeText, highContrast),
    [largeText, highContrast],
  );

  useEffect(() => {
    const message = `Schritt ${currentStep + 1} von ${totalSteps}: ${activeStep.title}`;
    announceAccessibilityMessage(message);
  }, [activeStep.title, currentStep, totalSteps]);

  const handleContinue = async () => {
    await createProfile({
      name: name.trim() || 'Amy',
      consentDataUpload,
      consentHelpMeGetSmarter,
      vocabularySetId: vocabSet,
      largeText,
      highContrast,
    });
    await logHIPEvent('HIP_1', 'onboarding_completed', {
      consentDataUpload,
      consentHelpMeGetSmarter,
      vocabularySetId: vocabSet,
    });
    setActiveVocabularySet(vocabSet);
    update({ largeText, highContrast });
    navigation.replace('Tutorial');
  };

  const goNext = () => {
    if (currentStep === totalSteps - 1) {
      void handleContinue();
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const goBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const renderStepContent = () => {
    switch (activeStep.key) {
      case 'mission':
        return (
          <View style={styles.missionContent}>
            <AmyLoopTimeline activeStage="see" />
            <AmyFirstCommitments />
          </View>
        );
      case 'name':
        return (
          <TextInput
            style={styles.input}
            placeholder="Name des Kindes"
            value={name}
            onChangeText={setName}
            accessibilityLabel="Profilname"
            placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
          />
        );
      case 'accessibility':
        return (
          <>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Große Schrift aktivieren</Text>
              <Switch
                value={largeText}
                onValueChange={setLargeText}
                style={styles.switch}
                accessibilityLabel="Große Schrift"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Hoher Kontrast für klare Symbole</Text>
              <Switch
                value={highContrast}
                onValueChange={setHighContrast}
                style={styles.switch}
                accessibilityLabel="Hoher Kontrast"
              />
            </View>
          </>
        );
      case 'consent':
        return (
          <>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Anonymisierte Daten dürfen Amy’s Echo verbessern</Text>
              <Switch
                value={consentDataUpload}
                onValueChange={setConsentDataUpload}
                style={styles.switch}
                accessibilityLabel="Datenupload erlauben"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Erlaube Zusatztraining, damit ich schneller dazu lerne</Text>
              <Switch
                value={consentHelpMeGetSmarter}
                onValueChange={setConsentHelpMeGetSmarter}
                style={styles.switch}
                accessibilityLabel="Lernfunktion aktivieren"
              />
            </View>
          </>
        );
      case 'vocabulary':
        return (
          <View style={styles.vocabGrid}>
            {availableVocabularySets.map((set) => (
              <PrimaryButton
                key={set.id}
                label={set.label}
                accessibilityLabel={`Vokabular ${set.label} auswählen`}
                onPress={() => setVocabSet(set.id)}
                variant={vocabSet === set.id ? 'primary' : 'secondary'}
                style={styles.vocabButton}
                testID={`vocab-${set.id}`}
              />
            ))}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <ScreenBackground scrollable>
      <View style={styles.container}>
        <View style={styles.headlineArea}>
          <Text style={styles.progressText}>{`Schritt ${currentStep + 1} von ${totalSteps}`}</Text>
          <Text style={styles.emoji} accessibilityLabel={`${activeStep.emoji} Illustration`}>
            {activeStep.emoji}
          </Text>
          <Text style={styles.title}>{activeStep.title}</Text>
          <Text style={styles.description}>{activeStep.description}</Text>
        </View>

        {renderStepContent()}

        <View style={styles.footer}>
          <View style={styles.buttonRow}>
            {currentStep > 0 ? (
              <PrimaryButton
                label="Zurück"
                accessibilityLabel="Zurück"
                onPress={goBack}
                variant="secondary"
                testID="btn-back"
              />
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <PrimaryButton
              label={currentStep === totalSteps - 1 ? 'Los geht‘s' : 'Weiter'}
              accessibilityLabel={currentStep === totalSteps - 1 ? 'Onboarding abschließen' : 'Weiter'}
              onPress={goNext}
              testID="btn-next"
            />
          </View>
          <PrimaryButton
            label="Später einrichten"
            accessibilityLabel="Onboarding überspringen"
            onPress={() => navigation.replace('App', { screen: 'Recognition' })}
            variant="secondary"
            testID="btn-skip"
            style={{ marginTop: SPACING.md }}
          />
        </View>
      </View>
    </ScreenBackground>
  );
}
