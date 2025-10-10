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

function totalDuration(pattern: VibrationPattern): number {
  if (Array.isArray(pattern)) {
    return pattern.reduce((sum, value) => sum + Math.max(0, value), 0);
  }
  return Math.max(0, pattern);
}

function vibrate(pattern: VibrationPattern): void {
  if (!isVibrationSupported) {
    logger.debug('Haptics: Vibration API not available on this platform');
    return;
  }

  try {
    if (Array.isArray(pattern)) {
      Vibration.vibrate(pattern, false);
    } else {
      Vibration.vibrate(pattern);
    }
  } catch (error) {
    logger.warn('Haptics vibration failed', error);
  }
}

function wait(duration: number): Promise<void> {
  const timeout = Math.min(Math.max(duration, 0), 400);
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

export function selectionAsync(): Promise<void> {
  const duration = IMPACT_PATTERNS[ImpactFeedbackStyle.Light];
  vibrate(duration);
  return wait(totalDuration(duration));
}

export function setNotificationHandler(): void {
  logger.debug('Haptics: setNotificationHandler is a no-op in the shim');
}

export function setHapticEnabled(_: boolean): void {
  logger.debug('Haptics: setHapticEnabled is a no-op in the shim');
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
