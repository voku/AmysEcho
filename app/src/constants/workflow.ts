import type { AppTabsParamList } from '../navigation/types';

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
