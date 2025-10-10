import { Vibration } from 'react-native';
import { logger } from './logger';

export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
} as const;

export type ImpactFeedbackStyle =
  (typeof ImpactFeedbackStyle)[keyof typeof ImpactFeedbackStyle];

export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const;

export type NotificationFeedbackType =
  (typeof NotificationFeedbackType)[keyof typeof NotificationFeedbackType];

type VibrationPattern = number | number[];

type PatternMap<T extends string> = Record<T, VibrationPattern>;

const IMPACT_PATTERNS: PatternMap<ImpactFeedbackStyle> = {
  [ImpactFeedbackStyle.Light]: 20,
  [ImpactFeedbackStyle.Medium]: [0, 35, 45, 35],
  [ImpactFeedbackStyle.Heavy]: [0, 55, 45, 55, 45, 55],
};

const NOTIFICATION_PATTERNS: PatternMap<NotificationFeedbackType> = {
  [NotificationFeedbackType.Success]: [0, 30, 40, 30],
  [NotificationFeedbackType.Warning]: [0, 40, 40, 40, 40, 40],
  [NotificationFeedbackType.Error]: [0, 60, 50, 60, 50, 60],
};

const isVibrationSupported =
  typeof Vibration !== 'undefined' && typeof Vibration.vibrate === 'function';

let hapticsEnabled = true;

function totalDuration(pattern: VibrationPattern): number {
  if (Array.isArray(pattern)) {
    return pattern.reduce((sum, value) => sum + Math.max(0, value), 0);
  }
  return Math.max(0, pattern);
}

function vibrate(pattern: VibrationPattern): void {
  if (!hapticsEnabled) {
    logger.debug('Haptics: Vibration ist derzeit deaktiviert.');
    return;
  }

  if (!isVibrationSupported) {
    logger.debug('Haptics: Vibration-API auf dieser Plattform nicht verfügbar.');
    return;
  }

  try {
    if (Array.isArray(pattern)) {
      Vibration.vibrate(pattern, false);
    } else {
      Vibration.vibrate(pattern);
    }
  } catch (error) {
    logger.warn('Haptics-Vibration fehlgeschlagen.', error);
  }
}

function wait(duration: number): Promise<void> {
  // Begrenze die Wartezeit, um aufeinanderfolgende Feedbacks nicht unnötig zu verzögern.
  const timeout = Math.min(Math.max(duration, 0), 1000);
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

export async function impactAsync(style: ImpactFeedbackStyle): Promise<void> {
  const pattern = IMPACT_PATTERNS[style] ?? IMPACT_PATTERNS[ImpactFeedbackStyle.Light];
  vibrate(pattern);
  await wait(totalDuration(pattern));
}

export async function notificationAsync(
  type: NotificationFeedbackType,
): Promise<void> {
  const pattern =
    NOTIFICATION_PATTERNS[type] ?? NOTIFICATION_PATTERNS[NotificationFeedbackType.Success];
  vibrate(pattern);
  await wait(totalDuration(pattern));
}

export async function selectionAsync(): Promise<void> {
  const duration = IMPACT_PATTERNS[ImpactFeedbackStyle.Light];
  vibrate(duration);
  await wait(totalDuration(duration));
}

export function setNotificationHandler(): void {
  logger.debug('Haptics: setNotificationHandler hat im Shim keine Wirkung.');
}

export function setHapticEnabled(enabled: boolean): void {
  hapticsEnabled = Boolean(enabled);
  logger.debug(
    hapticsEnabled
      ? 'Haptisches Feedback wurde aktiviert.'
      : 'Haptisches Feedback wurde deaktiviert.',
  );
}

export default {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  selectionAsync,
  setNotificationHandler,
  setHapticEnabled,
};
