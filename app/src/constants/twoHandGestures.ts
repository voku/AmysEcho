/**
 * Two-Hand Gesture Definitions - Phase 3.1
 *
 * Defines common two-hand gestures for Amy's communication
 * These gestures use both hands simultaneously for enhanced expression
 */

export interface TwoHandGestureDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  leftGesture: string;
  rightGesture: string;
  category: 'communication' | 'emotional' | 'playful';
  difficulty: 'easy' | 'medium' | 'hard';
  examples: string[];
}

/**
 * Predefined two-hand gestures for Amy's Echo
 * These are designed to be intuitive and commonly used in sign language
 */
export const TWO_HAND_GESTURES: TwoHandGestureDefinition[] = [
  {
    id: 'please-both-hands',
    name: 'Bitte (beide Hände)',
    description: 'Bitte mit beiden Händen für stärkere Betonung',
    emoji: '🙏',
    leftGesture: 'ILoveYou', // Please gesture with left hand
    rightGesture: 'ILoveYou', // Please gesture with right hand
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Bitte um Hilfe bei schwierigen Aufgaben',
      'Höfliche Verstärkung einer Bitte',
      'Ausdruck starker Bedürfnisse'
    ]
  },
  {
    id: 'help-both-hands',
    name: 'Hilfe (beide Hände)',
    description: 'Hilfe-Signal mit beiden Händen für Notfälle',
    emoji: '🆘',
    leftGesture: 'Pointing_Up', // Help gesture with left hand
    rightGesture: 'Pointing_Up', // Help gesture with right hand
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Sofortige Hilfe benötigt',
      'Medizinische Notfälle',
      'Sicherheitsbedenken'
    ]
  },
  {
    id: 'play-both-hands',
    name: 'Spielen (beide Hände)',
    description: 'Spielen-Signal mit beiden Händen',
    emoji: '🎮',
    leftGesture: 'Victory', // Play gesture with left hand
    rightGesture: 'Victory', // Play gesture with right hand
    category: 'playful',
    difficulty: 'easy',
    examples: [
      'Spielen vorschlagen',
      'Freude ausdrücken',
      'Spaß haben'
    ]
  },
  {
    id: 'happy-both-hands',
    name: 'Glücklich (beide Hände)',
    description: 'Glückliche Stimmung mit beiden Händen zeigen',
    emoji: '😊',
    leftGesture: 'Thumb_Up', // Positive gesture with left hand
    rightGesture: 'Thumb_Up', // Positive gesture with right hand
    category: 'emotional',
    difficulty: 'easy',
    examples: [
      'Zufriedenheit ausdrücken',
      'Positive Verstärkung',
      'Freude teilen'
    ]
  },
  {
    id: 'hello-goodbye-both',
    name: 'Hallo/Tschüss (beide Hände)',
    description: 'Begrüßung oder Verabschiedung mit beiden Händen',
    emoji: '👋',
    leftGesture: 'Open_Palm', // Hello gesture with left hand
    rightGesture: 'Open_Palm', // Hello gesture with right hand
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Jemanden begrüßen',
      'Sich verabschieden',
      'Aufmerksamkeit erregen'
    ]
  },
  {
    id: 'more-both-hands',
    name: 'Mehr (beide Hände)',
    description: 'Mehr von etwas wollen mit beiden Händen',
    emoji: '➕',
    leftGesture: 'ILoveYou', // Please/more with left hand
    rightGesture: 'Thumb_Up', // Positive reinforcement with right hand
    category: 'communication',
    difficulty: 'medium',
    examples: [
      'Mehr Essen wollen',
      'Mehr spielen wollen',
      'Mehr Zeit für Aktivität'
    ]
  },
  {
    id: 'stop-both-hands',
    name: 'Stopp (beide Hände)',
    description: 'Stopp-Signal mit beiden Händen für klare Kommunikation',
    emoji: '✋',
    leftGesture: 'Closed_Fist', // Stop with left hand
    rightGesture: 'Closed_Fist', // Stop with right hand
    category: 'communication',
    difficulty: 'easy',
    examples: [
      'Etwas stoppen wollen',
      'Aufhören mit Aktivität',
      'Grenzen setzen'
    ]
  }
];

/**
 * Get two-hand gesture by ID
 */
export function getTwoHandGestureById(id: string): TwoHandGestureDefinition | undefined {
  return TWO_HAND_GESTURES.find(gesture => gesture.id === id);
}

/**
 * Find a two-hand gesture by the underlying left/right gestures
 */
export function findTwoHandGestureByHands(
  leftGesture: string,
  rightGesture: string,
): TwoHandGestureDefinition | undefined {
  const directMatch = TWO_HAND_GESTURES.find(
    (gesture) => gesture.leftGesture === leftGesture && gesture.rightGesture === rightGesture,
  );

  if (directMatch) {
    return directMatch;
  }

  return TWO_HAND_GESTURES.find(
    (gesture) => gesture.leftGesture === rightGesture && gesture.rightGesture === leftGesture,
  );
}

/**
 * Get two-hand gestures by category
 */
export function getTwoHandGesturesByCategory(category: TwoHandGestureDefinition['category']): TwoHandGestureDefinition[] {
  return TWO_HAND_GESTURES.filter(gesture => gesture.category === category);
}

/**
 * Get two-hand gestures by difficulty
 */
export function getTwoHandGesturesByDifficulty(difficulty: TwoHandGestureDefinition['difficulty']): TwoHandGestureDefinition[] {
  return TWO_HAND_GESTURES.filter(gesture => gesture.difficulty === difficulty);
}

/**
 * Convert two-hand gesture to display string
 */
export function formatTwoHandGesture(gesture: TwoHandGestureDefinition): string {
  return `${gesture.leftGesture}+${gesture.rightGesture}`;
}

/**
 * Check if a gesture string represents a two-hand gesture
 */
export function isTwoHandGestureString(gestureString: string): boolean {
  return gestureString.includes('+');
}

/**
 * Parse two-hand gesture string into components
 */
export function parseTwoHandGestureString(gestureString: string): { left: string; right: string } | null {
  if (!isTwoHandGestureString(gestureString)) {
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

  return {
    left,
    right
  };
}