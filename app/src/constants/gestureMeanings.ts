/**
 * Gesture Meaning Definitions - Amy First
 *
 * Central registry that describes the meanings Amy sees after a
 * gesture has been recognised. It unifies single-hand and
 * coordinated gestures so that the UI can always explain the
 * combined idea instead of splitting by hand count.
 */

export type GestureMeaningCategory = 'communication' | 'emotional' | 'playful';
export type GestureMeaningDifficulty = 'easy' | 'medium' | 'hard';

export interface SingleGestureMeaningDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: GestureMeaningCategory;
  difficulty: GestureMeaningDifficulty;
  examples: string[];
  composition: 'single';
  gesture: string;
}

export interface CoordinatedGestureMeaningDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: GestureMeaningCategory;
  difficulty: GestureMeaningDifficulty;
  examples: string[];
  composition: 'coordinated';
  leftGesture: string;
  rightGesture: string;
}

export type GestureMeaningDefinition =
  | SingleGestureMeaningDefinition
  | CoordinatedGestureMeaningDefinition;

export const GESTURE_MEANINGS: GestureMeaningDefinition[] = [
  {
    id: 'ich-liebe-dich',
    name: 'Ich liebe dich',
    description: 'Herzliches Zeichen mit einer Hand für liebevolle Botschaften.',
    emoji: '🤟',
    category: 'emotional',
    difficulty: 'easy',
    examples: [
      'Zuneigung gegenüber Eltern zeigen',
      'Bedanken nach Hilfe',
      'Freude teilen'
    ],
    composition: 'single',
    gesture: 'ILoveYou',
  },
  {
    id: 'hilfe-eine-hand',
    name: 'Hilfe',
    description: 'Deutliches Hilfesignal mit einer Hand.',
    emoji: '🆘',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Um Unterstützung bitten',
      'Notfall melden',
      'Aufmerksamkeit erlangen'
    ],
    composition: 'single',
    gesture: 'Pointing_Up',
  },
  {
    id: 'mehr-eine-hand',
    name: 'Mehr',
    description: 'Zeigt, dass Amy mehr von etwas möchte.',
    emoji: '➕',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Mehr trinken',
      'Weiter spielen',
      'Mehr Musik hören'
    ],
    composition: 'single',
    gesture: 'Thumb_Up',
  },
  {
    id: 'please-both-hands',
    name: 'Bitte (beide Hände)',
    description: 'Bitte mit beiden Händen für stärkere Betonung.',
    emoji: '🙏',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Bitte um Hilfe bei schwierigen Aufgaben',
      'Höfliche Verstärkung einer Bitte',
      'Ausdruck starker Bedürfnisse'
    ],
    composition: 'coordinated',
    leftGesture: 'ILoveYou',
    rightGesture: 'ILoveYou',
  },
  {
    id: 'help-both-hands',
    name: 'Hilfe (beide Hände)',
    description: 'Hilfe-Signal mit beiden Händen für Notfälle.',
    emoji: '🆘',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Sofortige Hilfe benötigt',
      'Medizinische Notfälle',
      'Sicherheitsbedenken'
    ],
    composition: 'coordinated',
    leftGesture: 'Pointing_Up',
    rightGesture: 'Pointing_Up',
  },
  {
    id: 'play-both-hands',
    name: 'Spielen (beide Hände)',
    description: 'Spielen-Signal mit beiden Händen.',
    emoji: '🎮',
    category: 'playful',
    difficulty: 'easy',
    examples: [
      'Spielen vorschlagen',
      'Freude ausdrücken',
      'Spaß haben'
    ],
    composition: 'coordinated',
    leftGesture: 'Victory',
    rightGesture: 'Victory',
  },
  {
    id: 'happy-both-hands',
    name: 'Glücklich (beide Hände)',
    description: 'Glückliche Stimmung mit beiden Händen zeigen.',
    emoji: '😊',
    category: 'emotional',
    difficulty: 'easy',
    examples: [
      'Zufriedenheit ausdrücken',
      'Positive Verstärkung',
      'Freude teilen'
    ],
    composition: 'coordinated',
    leftGesture: 'Thumb_Up',
    rightGesture: 'Thumb_Up',
  },
  {
    id: 'hello-goodbye-both',
    name: 'Hallo/Tschüss (beide Hände)',
    description: 'Begrüßung oder Verabschiedung mit beiden Händen.',
    emoji: '👋',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Jemanden begrüßen',
      'Sich verabschieden',
      'Aufmerksamkeit erregen'
    ],
    composition: 'coordinated',
    leftGesture: 'Open_Palm',
    rightGesture: 'Open_Palm',
  },
  {
    id: 'more-both-hands',
    name: 'Mehr (beide Hände)',
    description: 'Mehr von etwas wollen mit beiden Händen.',
    emoji: '➕',
    category: 'communication',
    difficulty: 'medium',
    examples: [
      'Mehr Essen wollen',
      'Mehr spielen wollen',
      'Mehr Zeit für Aktivität'
    ],
    composition: 'coordinated',
    leftGesture: 'ILoveYou',
    rightGesture: 'Thumb_Up',
  },
  {
    id: 'stop-both-hands',
    name: 'Stopp (beide Hände)',
    description: 'Stopp-Signal mit beiden Händen für klare Kommunikation.',
    emoji: '✋',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Etwas stoppen wollen',
      'Aufhören mit Aktivität',
      'Grenzen setzen'
    ],
    composition: 'coordinated',
    leftGesture: 'Closed_Fist',
    rightGesture: 'Closed_Fist',
  },
];

export function getGestureMeaningById(id: string): GestureMeaningDefinition | undefined {
  return GESTURE_MEANINGS.find((meaning) => meaning.id === id);
}

export function getGestureMeaningByGestureId(gestureId: string): GestureMeaningDefinition | undefined {
  return GESTURE_MEANINGS.find(
    (meaning) =>
      (meaning.composition === 'single' && meaning.gesture === gestureId) ||
      (meaning.composition === 'coordinated' &&
        `${meaning.leftGesture}+${meaning.rightGesture}` === gestureId),
  );
}

export function findCoordinatedGestureMeaningByHands(
  leftGesture: string,
  rightGesture: string,
): CoordinatedGestureMeaningDefinition | undefined {
  const directMatch = GESTURE_MEANINGS.find(
    (meaning): meaning is CoordinatedGestureMeaningDefinition =>
      meaning.composition === 'coordinated' &&
      meaning.leftGesture === leftGesture &&
      meaning.rightGesture === rightGesture,
  );

  if (directMatch) {
    return directMatch;
  }

  return GESTURE_MEANINGS.find(
    (meaning): meaning is CoordinatedGestureMeaningDefinition =>
      meaning.composition === 'coordinated' &&
      meaning.leftGesture === rightGesture &&
      meaning.rightGesture === leftGesture,
  );
}

export function getGestureMeaningsByCategory(
  category: GestureMeaningCategory,
): GestureMeaningDefinition[] {
  return GESTURE_MEANINGS.filter((meaning) => meaning.category === category);
}

export function getGestureMeaningsByDifficulty(
  difficulty: GestureMeaningDifficulty,
): GestureMeaningDefinition[] {
  return GESTURE_MEANINGS.filter((meaning) => meaning.difficulty === difficulty);
}

export function formatGestureMeaning(meaning: GestureMeaningDefinition): string {
  if (meaning.composition === 'single') {
    return meaning.gesture;
  }
  return `${meaning.leftGesture}+${meaning.rightGesture}`;
}

export function isCoordinatedGestureString(gestureString: string): boolean {
  return gestureString.includes('+');
}

export function parseCoordinatedGestureString(
  gestureString: string,
): { left: string; right: string } | null {
  if (!isCoordinatedGestureString(gestureString)) {
    return null;
  }

  const parts = gestureString.split('+');
  if (parts.length !== 2) {
    return null;
  }

  const [left, right] = parts;
  if (!left || !right) {
    return null;
  }

  return { left, right };
}
