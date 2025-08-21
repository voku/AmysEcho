import { loadCustomGestures } from './storage';

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
    gestures: ['hello', 'thank_you', 'please', 'more', 'finished', 'water', 'eat', 'help']
  },
  {
    id: 'emotions',
    label: 'Feelings',
    gestures: ['happy', 'sad', 'angry', 'excited', 'tired', 'scared']
  },
  {
    id: 'activities',
    label: 'Activities',
    gestures: ['play', 'read', 'music', 'outside', 'sleep', 'bath']
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
    { id: 'sad', label: '😢 Traurig', emoji: '😢', category: 'emotion' }
  ] as GestureModelEntry[]
};

let activeVocabularySetId = 'basic';

export function setActiveVocabularySet(id: string): void {
  if (availableVocabularySets.find(s => s.id === id)) {
    activeVocabularySetId = id;
  }
}

export function getActiveVocabularySet(): VocabularySet {
  return availableVocabularySets.find(s => s.id === activeVocabularySetId) || availableVocabularySets[0];
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

export async function initGestureModel(): Promise<void> {
  const custom = await loadCustomGestures();
  custom.forEach((g) => addGesture(g));
}

