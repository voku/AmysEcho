import basic from '../assets/model/basicGestures.json';
import animals from '../assets/model/animalGestures.json';

export type GestureModelEntry = {
  id: string;
  label: string;
  /** Path to the standard demonstration video relative to the assets folder */
  videoUri?: string;
  /** Optional path to a DGS video */
  dgsVideoUri?: string;
  /** Optional path to a default audio cue */
  audioUri?: string;
};

export type GestureModel = {
  gestures: GestureModelEntry[];
};

const vocabularySets: Record<string, GestureModel> = {
  basic: basic as GestureModel,
  animals: animals as GestureModel,
};

export const availableVocabularySets = [
  { id: 'basic', label: 'Basic' },
  { id: 'animals', label: 'Animals' },
];

let activeSetId = 'basic';
export let gestureModel: GestureModel = vocabularySets[activeSetId];

export function setActiveVocabularySet(id: string): void {
  if (vocabularySets[id]) {
    activeSetId = id;
    gestureModel = vocabularySets[id];
  }
}

export function getActiveVocabularySetId(): string {
  return activeSetId;
}
