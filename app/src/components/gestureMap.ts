import { LanguageManager } from '../services/LanguageManager';

export function getSymbolLabelForGesture(gestureId: string): string {
  return LanguageManager.getGestureLabel(gestureId) || gestureId;
}
