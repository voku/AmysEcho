import type { AppTabsParamList, RootStackParamList } from '../navigation/types';

declare const __DEV__: boolean | undefined;

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
    key: 'profiles',
    title: 'Profile & Einstellungen',
    description: 'Nutzerprofile, Sprache und Geräte verwalten.',
    icon: '⚙️',
    navigationTarget: { route: 'ParentalGate', params: { target: 'ProfileManager' } },
    accessibilityLabel: 'Profile und Einstellungen öffnen',
    accessibilityHint: 'Sicherheitsfrage beantworten, um Profile und Einstellungen zu bearbeiten.',
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

const REQUIRED_WORKFLOW_ROUTES: WorkflowRouteName[] = ['Recognition', 'History', 'Lernen'];

export const WORKFLOW_STEP_BY_ROUTE = WORKFLOW_STEPS.reduce(
  (acc, step) => {
    acc[step.route] = step;
    return acc;
  },
  {} as Record<WorkflowRouteName, WorkflowStepMeta>,
) satisfies Record<WorkflowRouteName, WorkflowStepMeta>;

type WorkflowAdjacency = {
  next?: WorkflowRouteName | undefined;
  previous?: WorkflowRouteName | undefined;
};

if (__DEV__) {
  REQUIRED_WORKFLOW_ROUTES.forEach((route) => {
    if (!WORKFLOW_STEP_BY_ROUTE[route]) {
      console.warn(`Missing workflow metadata for route: ${route}`);
    }
  });
}

export const ORDERED_WORKFLOW_STEPS = [...WORKFLOW_STEPS].sort((a, b) => a.order - b.order);

const WORKFLOW_ADJACENCY: Record<WorkflowRouteName, WorkflowAdjacency> = ORDERED_WORKFLOW_STEPS.reduce(
  (acc, step, index, array) => {
    const previous = index > 0 ? array[index - 1] : undefined;
    const next = index < array.length - 1 ? array[index + 1] : undefined;

    acc[step.route] = {
      previous: previous?.route,
      next: next?.route,
    };

    return acc;
  },
  {} as Record<WorkflowRouteName, WorkflowAdjacency>,
);

export const getWorkflowStepMeta = (routeName: WorkflowRouteName): WorkflowStepMeta =>
  WORKFLOW_STEP_BY_ROUTE[routeName];

export const isWorkflowRouteName = (routeName: string): routeName is WorkflowRouteName =>
  routeName in WORKFLOW_STEP_BY_ROUTE;

export const getNextWorkflowRoute = (routeName: WorkflowRouteName) => WORKFLOW_ADJACENCY[routeName]?.next;

export const getPreviousWorkflowRoute = (routeName: WorkflowRouteName) =>
  WORKFLOW_ADJACENCY[routeName]?.previous;

export default WORKFLOW_STEPS;
