// Server-side mapping from raw recognizer labels to app-specific gesture IDs.
// Goal: Define our own stable labels independent of MediaPipe or heuristic names.

export const APP_GESTURES = [
  'hello',
  'yes',
  'no',
  'help',
  'more',
  'finished',
  'water',
  'eat',
  'play',
  'please',
] as const;
export type AppGestureId = typeof APP_GESTURES[number];

// Synonyms map raw recognizer label -> our AppGestureId
// You can extend this list without changing client code.
const RAW_TO_APP: Record<string, AppGestureId> = {
  // MediaPipe common categories
  Thumb_Up: 'yes',
  Thumb_Down: 'no',
  Open_Palm: 'hello',
  Closed_Fist: 'no',
  Pointing_Up: 'help',
  Victory: 'play',
  ILoveYou: 'please',
  // Our heuristic fallback labels
  open_hand: 'hello',
  fist: 'no',
};

// Normalize to simple tokens
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

const NORMALIZED_TO_APP: Record<string, AppGestureId> = Object.fromEntries(
  Object.entries(RAW_TO_APP).map(([k, v]) => [norm(k), v]),
) as Record<string, AppGestureId>;

export function mapRawToAppLabel(raw: string | null | undefined, categories?: Array<{ name?: string | null; score?: number }>): { appLabel: AppGestureId | null; appConfidence: number | null } {
  // Prefer the top category if available
  if (categories && categories.length > 0) {
    const sorted = [...categories].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    for (const c of sorted) {
      const id = NORMALIZED_TO_APP[norm(c.name ?? '')];
      if (id) return { appLabel: id, appConfidence: c.score ?? null };
    }
  }
  // Fallback to primary raw label
  if (raw) {
    const id = NORMALIZED_TO_APP[norm(raw)];
    if (id) return { appLabel: id, appConfidence: null };
  }
  return { appLabel: null, appConfidence: null };
}

