/**
 * Gesture Meaning Definitions - Amy First
 *
 * Central registry that describes the meanings Amy sees after a
 * gesture has been recognised. It unifies single-hand, coordinated,
 * and sequential gesture meanings so the UI can always explain the
 * combined meaning instead of separating individual hands.
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

export interface SequenceGestureMeaningDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: GestureMeaningCategory;
  difficulty: GestureMeaningDifficulty;
  examples: string[];
  composition: 'sequence';
  gestures: string[];
}

export type GestureMeaningDefinition =
  | SingleGestureMeaningDefinition
  | CoordinatedGestureMeaningDefinition
  | SequenceGestureMeaningDefinition;

export const GESTURE_MEANINGS: GestureMeaningDefinition[] = [
  {
    id: 'hallo-eine-hand',
    name: 'Hallo',
    description: 'Freundlicher Gruß mit einer Hand.',
    emoji: '👋',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Freund*innen begrüßen',
      'Morgendliche Runde starten',
      'Aufmerksamkeit holen',
    ],
    composition: 'single',
    gesture: 'hello',
  },
  {
    id: 'danke-eine-hand',
    name: 'Danke',
    description: 'Herzliches Dankeschön mit einer Hand.',
    emoji: '🙏',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Nach Hilfe bedanken',
      'Dank im Morgenkreis',
      'Freundliche Rückmeldung geben',
    ],
    composition: 'single',
    gesture: 'thank_you',
  },
  {
    id: 'bitte-eine-hand',
    name: 'Bitte',
    description: 'Höfliche Bitte mit einer Hand.',
    emoji: '🥺',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Um ein Spielzeug bitten',
      'Mehr Saft erfragen',
      'Höfliches Nachfragen',
    ],
    composition: 'single',
    gesture: 'please',
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
      'Noch ein Lied hören',
    ],
    composition: 'single',
    gesture: 'more',
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
      'Aufmerksamkeit erlangen',
    ],
    composition: 'single',
    gesture: 'help',
  },
  {
    id: 'trinken-eine-hand',
    name: 'Trinken',
    description: 'Signal für Durst oder Trinkpause.',
    emoji: '🥤',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Nach einem Becher fragen',
      'Durst melden',
      'Pause im Morgenkreis anregen',
    ],
    composition: 'single',
    gesture: 'trinken',
  },
  {
    id: 'spielen-eine-hand',
    name: 'Spielen',
    description: 'Einladung zum gemeinsamen Spiel.',
    emoji: '🎮',
    category: 'playful',
    difficulty: 'easy',
    examples: [
      'Mit Freund*innen spielen',
      'Spielecke öffnen',
      'Spielidee vorschlagen',
    ],
    composition: 'single',
    gesture: 'spielen',
  },
  {
    id: 'hilfe-beide-haende',
    name: 'Hilfe (beide Hände)',
    description: 'Hilfe-Signal mit beiden Händen für dringende Situationen.',
    emoji: '🆘',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Schnell Unterstützung anfordern',
      'Gefahr melden',
      'Auf sich aufmerksam machen',
    ],
    composition: 'coordinated',
    leftGesture: 'help',
    rightGesture: 'help',
  },
  {
    id: 'hallo-beide-haende',
    name: 'Hallo (beide Hände)',
    description: 'Großer Gruß mit beiden Händen.',
    emoji: '👋',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Freund*innen begrüßen',
      'Eltern verabschieden',
      'Gruppe sammeln',
    ],
    composition: 'coordinated',
    leftGesture: 'hello',
    rightGesture: 'hello',
  },
  {
    id: 'stopp-beide-haende',
    name: 'Stopp (beide Hände)',
    description: 'Klare Grenze setzen mit beiden Händen.',
    emoji: '✋',
    category: 'communication',
    difficulty: 'medium',
    examples: [
      'Spiel kurz stoppen',
      'Sicherheit einfordern',
      'Pause anmelden',
    ],
    composition: 'coordinated',
    leftGesture: 'no',
    rightGesture: 'no',
  },
  {
    id: 'danke-und-bitte',
    name: 'Danke und Bitte',
    description: 'Freundliche Abfolge für gemeinsames Arbeiten.',
    emoji: '🤝',
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Material weitergeben',
      'Beim Basteln helfen',
      'Gemeinsame Rituale begleiten',
    ],
    composition: 'sequence',
    gestures: ['thank_you', 'please'],
  },
  {
    id: 'ich-brauche-trinken',
    name: 'Ich brauche etwas zu trinken',
    description: 'Amy bittet um Hilfe beim Trinken.',
    emoji: '🥤',
    category: 'communication',
    difficulty: 'medium',
    examples: [
      'Erinnerung an Trinkpausen',
      'Nachfüllen der Trinkflasche',
      'Unterstützung beim Becher halten',
    ],
    composition: 'sequence',
    gestures: ['help', 'trinken'],
  },
  {
    id: 'nochmal-spielen',
    name: 'Nochmal spielen',
    description: 'Amy möchte das Spiel wiederholen.',
    emoji: '🔄',
    category: 'playful',
    difficulty: 'easy',
    examples: [
      'Rutsche noch einmal nutzen',
      'Lieblingslied wiederholen',
      'Spielrunde verlängern',
    ],
    composition: 'sequence',
    gestures: ['nochmal', 'spielen'],
  },
  {
    id: 'ich-hab-dich-lieb',
    name: 'Ich hab dich lieb',
    description: 'Warme Liebesbotschaft als kleine Sequenz.',
    emoji: '❤️',
    category: 'emotional',
    difficulty: 'medium',
    examples: [
      'Vertrauensmoment mit Bezugsperson',
      'Abschied im Kindergarten',
      'Danke für Unterstützung sagen',
    ],
    composition: 'sequence',
    gestures: ['ich', 'liebe', 'dich'],
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
        `${meaning.leftGesture}+${meaning.rightGesture}` === gestureId) ||
      (meaning.composition === 'sequence' && meaning.id === gestureId),
  );
}

export function getGestureMeaningBySequenceId(
  sequenceId: string,
): SequenceGestureMeaningDefinition | undefined {
  return GESTURE_MEANINGS.find(
    (meaning): meaning is SequenceGestureMeaningDefinition =>
      meaning.composition === 'sequence' && meaning.id === sequenceId,
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

export function findSequenceGestureMeaningByGestures(
  gestures: string[],
): SequenceGestureMeaningDefinition | undefined {
  return GESTURE_MEANINGS.find(
    (meaning): meaning is SequenceGestureMeaningDefinition =>
      meaning.composition === 'sequence' &&
      meaning.gestures.length === gestures.length &&
      meaning.gestures.every((gesture, index) => gesture === gestures[index]),
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
  if (meaning.composition === 'sequence') {
    return meaning.gestures.join('>');
  }
  return `${meaning.leftGesture}+${meaning.rightGesture}`;
}

export function isCoordinatedGestureString(gestureString: string): boolean {
  if (!gestureString.includes('+')) {
    return false;
  }
  const parsed = parseCoordinatedGestureString(gestureString);
  return Boolean(parsed);
}

export function parseCoordinatedGestureString(
  gestureString: string,
): { left: string; right: string } | null {
  if (!gestureString.includes('+')) {
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

  const match = findCoordinatedGestureMeaningByHands(left, right);
  if (!match) {
    return null;
  }

  return { left: match.leftGesture, right: match.rightGesture };
}
