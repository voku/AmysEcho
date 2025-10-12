import type { AppTabsParamList, RootStackParamList } from '../navigation/types';

export type WorkflowRouteName = keyof AppTabsParamList;

export type WorkflowStage = 'Hören' | 'Verstehen' | 'Lernen';

export interface WorkflowStepMeta {
  route: WorkflowRouteName;
  stage: WorkflowStage;
  label: string;
  /**
   * Emoji-based iconography keeps the navigation light-weight while we finalise
   * the rebranded icon set.
   */
  icon: string;
  /**
   * Short explanation of the step for tooltips or future helper copy.
   */
  description: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  order: number;
}

export type WorkflowSupportRoute = 'ParentalGate' | 'Help';

interface BaseSupportDestination<RouteName extends WorkflowSupportRoute> {
  key: string;
  title: string;
  description: string;
  icon: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  navigationTarget: { route: RouteName; params?: RootStackParamList[RouteName] };
}

export type WorkflowSupportDestination =
  | (BaseSupportDestination<'ParentalGate'> & {
      navigationTarget: { route: 'ParentalGate'; params: RootStackParamList['ParentalGate'] };
    })
  | BaseSupportDestination<'Help'>;

const WORKFLOW_STEPS: WorkflowStepMeta[] = [
  {
    route: 'Recognition',
    stage: 'Hören',
    label: 'Kamera',
    icon: '🖐️',
    description: 'Gesten live aufnehmen – Amy hört sofort zu.',
    accessibilityLabel: 'Zur Gestenkamera wechseln',
    accessibilityHint: 'Gesten mit der Kamera aufnehmen, damit Amy sie versteht.',
    order: 1,
  },
  {
    route: 'History',
    stage: 'Verstehen',
    label: 'Verstehen',
    icon: '💬',
    description: 'Einblicke in Amys zuletzt verstandene Gesten.',
    accessibilityLabel: 'Verlauf und Einblicke ansehen',
    accessibilityHint: 'Letzte Gesten prüfen und Vertrauen einordnen.',
    order: 2,
  },
  {
    route: 'Lernen',
    stage: 'Lernen',
    label: 'Lernen',
    icon: '🧠',
    description: 'Gesten trainieren oder neue Beispiele hinzufügen.',
    accessibilityLabel: 'Trainings- und Lernbereich öffnen',
    accessibilityHint: 'Gesten trainieren und neue Beispiele aufnehmen.',
    order: 3,
  },
];

export const WORKFLOW_SUPPORT_DESTINATIONS: WorkflowSupportDestination[] = [
  {
    key: 'care',
    title: 'Betreuerbereich',
    description: 'Profile, Berichte und Trainingsziele verwalten.',
    icon: '👨‍👩‍👧',
    navigationTarget: { route: 'ParentalGate', params: { target: 'Parent' } },
    accessibilityLabel: 'Betreuerbereich öffnen',
    accessibilityHint: 'Elternzugang mit Sicherheitsfrage öffnen.',
  },
  {
    key: 'admin',
    title: 'Verwaltung & Modelle',
    description: 'Gesten-Daten prüfen und Modelle pflegen.',
    icon: '🛠️',
    navigationTarget: { route: 'ParentalGate', params: { target: 'Admin' } },
    accessibilityLabel: 'Verwaltung und Modelle öffnen',
    accessibilityHint: 'Sicherheitsfrage beantworten, um den Adminbereich zu öffnen.',
  },
  {
    key: 'help',
    title: 'Hilfe & Support',
    description: 'Kontakt und Antworten auf häufige Fragen.',
    icon: '🆘',
    navigationTarget: { route: 'Help' },
    accessibilityLabel: 'Hilfe und Support öffnen',
    accessibilityHint: 'Informationen und Unterstützung abrufen.',
  },
];

export const WORKFLOW_STEP_BY_ROUTE: Record<WorkflowRouteName, WorkflowStepMeta> = WORKFLOW_STEPS.reduce(
  (acc, step) => {
    acc[step.route] = step;
    return acc;
  },
  {} as Record<WorkflowRouteName, WorkflowStepMeta>,
);

export const ORDERED_WORKFLOW_STEPS = [...WORKFLOW_STEPS].sort((a, b) => a.order - b.order);

export const getWorkflowStepMeta = (routeName: string): WorkflowStepMeta | undefined =>
  WORKFLOW_STEP_BY_ROUTE[routeName as WorkflowRouteName];

export default WORKFLOW_STEPS;
