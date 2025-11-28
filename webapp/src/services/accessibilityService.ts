/**
 * Accessibility Service for Web
 * Provides screen reader announcements and accessibility labels for gestures.
 */

/**
 * Announces a recognized gesture for screen readers.
 * Uses ARIA live regions for web accessibility.
 * @param name Gesture name to announce
 * @param confidence Confidence value between 0 and 1
 */
export function announceGestureRecognition(name: string, confidence: number): void {
  const percent = Math.round(confidence * 100);
  const message = `${name} erkannt, ${percent} Prozent sicher`;
  announceAccessibilityMessage(message);
}

/**
 * Announces a message to screen readers using ARIA live regions.
 * @param message Message to announce
 */
export function announceAccessibilityMessage(message: string): void {
  try {
    if (!message || message.trim().length === 0) {
      return;
    }

    // Create or get the announcer element
    let announcer = document.getElementById('sr-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'sr-announcer';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.position = 'absolute';
      announcer.style.width = '1px';
      announcer.style.height = '1px';
      announcer.style.padding = '0';
      announcer.style.margin = '-1px';
      announcer.style.overflow = 'hidden';
      announcer.style.clip = 'rect(0, 0, 0, 0)';
      announcer.style.whiteSpace = 'nowrap';
      announcer.style.border = '0';
      document.body.appendChild(announcer);
    }

    // Clear and set new message (forces re-announcement)
    announcer.textContent = '';
    setTimeout(() => {
      if (announcer) {
        announcer.textContent = message;
      }
    }, 100);
  } catch {
    // Ignore errors to avoid breaking gesture flow
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

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if high contrast mode is enabled
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(forced-colors: active)').matches;
}
