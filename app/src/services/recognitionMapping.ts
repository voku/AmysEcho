import { gestureModel } from '../model';
import type { RecognitionResponse } from './remoteGestureRecognitionService';

// MediaPipe Tasks gesture names commonly seen (subset):
// - Thumb_Up, Thumb_Down, Open_Palm, Closed_Fist, Pointing_Up, Victory, ILoveYou
// Heuristic fallback names from our Hands path: open_hand, fist, no_hand

const MP_TO_APP: Record<string, string> = {
  Thumb_Up: 'yes',
  Thumb_Down: 'no',
  Open_Palm: 'hello',
  Closed_Fist: 'no',
  Pointing_Up: 'help',
  Victory: 'play',
  ILoveYou: 'please',
  // Fallback heuristic labels
  open_hand: 'hello',
  fist: 'no',
};

export function mapRecognitionToGesture(rec: RecognitionResponse | null): { id: string; label: string } | null {
  if (!rec || !rec.result?.label) return null;
  const raw = rec.result.label;

  const candidateId = MP_TO_APP[raw] || normalizeTry(raw);
  if (!candidateId) return null;
  const entry = gestureModel.gestures.find(g => g.id === candidateId);
  if (entry) return { id: entry.id, label: entry.label };
  return { id: candidateId, label: candidateId };
}

function normalizeTry(label: string): string | null {
  const l = label.trim().toLowerCase().replace(/\s+/g, '_');
  // Try simple matches against our known set (hello/yes/no/help/more/eat/water/play/...)
  const ids = new Set(gestureModel.gestures.map(g => g.id));
  if (ids.has(l)) return l;
  return null;
}

