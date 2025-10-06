// Dynamically import storage only when initializing to avoid bundling React Native
// modules in non-native environments (e.g., integration tests).

export interface GestureModelEntry {
  id: string;
  label: string;
  videoUri?: string;
  dgsVideoUri?: string;
  emoji?: string;
  category?: string;
  confidence?: number;
}

export interface VocabularySet {
  id: string;
  label: string;
  gestures: string[];
}

export const availableVocabularySets: VocabularySet[] = [
  {
    id: 'basic',
    label: 'Basic Needs',
    gestures: ['hello', 'thank_you', 'please', 'more', 'finished', 'water', 'eat', 'help', 'essen', 'trinken', 'satt', 'fertig']
  },
  {
    id: 'emotions',
    label: 'Feelings',
    gestures: ['happy', 'sad', 'angry', 'excited', 'tired', 'scared']
  },
  {
    id: 'activities',
    label: 'Activities',
    gestures: ['play', 'read', 'music', 'outside', 'sleep', 'bath', 'spielen', 'nochmal']
  },
  {
    id: 'colors',
    label: 'Colors',
    gestures: ['rot', 'blau', 'gelb', 'gruen']
  },
  {
    id: 'family',
    label: 'Family',
    gestures: ['schwester', 'alle']
  }
];

export const gestureModel = {
  gestures: [
    { id: 'hello', label: '👋 Hallo', emoji: '👋', category: 'greeting' },
    { id: 'thank_you', label: '🙏 Danke', emoji: '🙏', category: 'politeness' },
    { id: 'please', label: '🥺 Bitte', emoji: '🥺', category: 'politeness' },
    { id: 'more', label: '➕ Mehr', emoji: '➕', category: 'quantity' },
    { id: 'finished', label: '✅ Fertig', emoji: '✅', category: 'status' },
    { id: 'water', label: '💧 Wasser', emoji: '💧', category: 'drink' },
    { id: 'eat', label: '🍽️ Essen', emoji: '🍽️', category: 'food' },
    { id: 'play', label: '🎮 Spielen', emoji: '🎮', category: 'activity' },
    { id: 'help', label: '🆘 Hilfe', emoji: '🆘', category: 'need' },
    { id: 'yes', label: '✅ Ja', emoji: '✅', category: 'response' },
    { id: 'no', label: '❌ Nein', emoji: '❌', category: 'response' },
    { id: 'happy', label: '😊 Glücklich', emoji: '😊', category: 'emotion' },
    { id: 'sad', label: '😢 Traurig', emoji: '😢', category: 'emotion' },
    // New DGS gestures with video support
    { id: 'alle', label: '👥 Alle', emoji: '👥', category: 'quantity', dgsVideoUri: 'alle.mp4' },
    { id: 'blau', label: '💙 Blau', emoji: '💙', category: 'color', dgsVideoUri: 'blau.mp4' },
    { id: 'rot', label: '❤️ Rot', emoji: '❤️', category: 'color', dgsVideoUri: 'rot.mp4' },
    { id: 'gelb', label: '💛 Gelb', emoji: '💛', category: 'color', dgsVideoUri: 'gelb.mp4' },
    { id: 'gruen', label: '💚 Grün', emoji: '💚', category: 'color', dgsVideoUri: 'gruen.mp4' },
    { id: 'essen', label: '🍽️ Essen', emoji: '🍽️', category: 'food', dgsVideoUri: 'essen.mp4' },
    { id: 'trinken', label: '🥤 Trinken', emoji: '🥤', category: 'drink', dgsVideoUri: 'trinken.mp4' },
    { id: 'satt', label: '😋 Satt', emoji: '😋', category: 'status', dgsVideoUri: 'satt.mp4' },
    { id: 'spielen', label: '🎮 Spielen', emoji: '🎮', category: 'activity', dgsVideoUri: 'spielen.mp4' },
    { id: 'schwester', label: '👩 Schwester', emoji: '👩', category: 'family', dgsVideoUri: 'schwester.mp4' },
    { id: 'nochmal', label: '🔄 Nochmal', emoji: '🔄', category: 'action', dgsVideoUri: 'nochmal.mp4' },
    { id: 'ich', label: '👉 Ich', emoji: '👉', category: 'pronoun' },
    { id: 'liebe', label: '❤️ Liebe', emoji: '❤️', category: 'emotion' },
    { id: 'dich', label: '🫵 Dich', emoji: '🫵', category: 'pronoun' },
    { id: 'fertig', label: '✅ Fertig', emoji: '✅', category: 'status', dgsVideoUri: 'fertig.mp4' }
  ] as GestureModelEntry[]
};

let activeVocabularySetId = 'basic';

export function setActiveVocabularySet(id: string): void {
  if (availableVocabularySets.find(s => s.id === id)) {
    activeVocabularySetId = id;
  }
}

export function getActiveVocabularySet(): VocabularySet {
  const matchedSet = availableVocabularySets.find(s => s.id === activeVocabularySetId);
  if (matchedSet) {
    return matchedSet;
  }

  const fallbackSet = availableVocabularySets[0];
  if (fallbackSet) {
    return fallbackSet;
  }

  throw new Error('Keine aktiven Vokabelsets konfiguriert');
}

export function getGesturesForVocabularySet(setId: string): GestureModelEntry[] {
  const vocabSet = availableVocabularySets.find(s => s.id === setId);
  if (!vocabSet) return [];

  return gestureModel.gestures.filter(g => vocabSet.gestures.includes(g.id));
}

export function addGesture(entry: GestureModelEntry): void {
  if (!gestureModel.gestures.find((g) => g.id === entry.id)) {
    gestureModel.gestures.push(entry);
  }
}

import { loadCustomGestures } from './storage';

export async function initGestureModel(): Promise<void> {
  try {
    const custom = await loadCustomGestures();
    custom.forEach((g) => addGesture(g));
  } catch (e) {
    console.warn('Custom gesture load failed:', e);
  }
}
