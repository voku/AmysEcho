import { AccessibilityInfo } from 'react-native';

/**
 * Announces a recognized gesture for screen readers.
 * @param name Gesture name to announce
 * @param confidence Confidence value between 0 and 1
 */
export function announceGestureRecognition(name: string, confidence: number): void {
  const percent = Math.round(confidence * 100);
  const message = `${name} erkannt, ${percent} Prozent sicher`;
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // ignore errors to avoid breaking gesture flow
  }
}

export function announceAccessibilityMessage(message: string): void {
  try {
    if (!message || message.trim().length === 0) {
      return;
    }
    AccessibilityInfo?.announceForAccessibility?.(message);
  } catch {
    // ignore errors so onboarding never blocks screen readers
  }
}

/**
 * Builds a descriptive accessibility label for a gesture.
 * @param gesture Gesture name
 * @param confidence Confidence value between 0 and 1
 * @param context Optional additional context to append
 */
export function createGestureAccessibilityLabel(
  gesture: string,
  confidence: number,
  context?: string,
): string {
  const percent = Math.round(confidence * 100);
  let label = `${gesture}, ${percent} Prozent sicher`;
  if (context && context.length > 0) {
    label += `. ${context}`;
  }
  return label;
}
