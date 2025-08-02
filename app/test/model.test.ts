import { gestureModel, setActiveVocabularySet, getActiveVocabularySet, getGesturesForVocabularySet } from '../src/model';

describe('Model', () => {
  it('should switch between vocabulary sets correctly', () => {
    expect(getActiveVocabularySet().id).toBe('basic');
    expect(gestureModel.gestures.length).toBeGreaterThan(0);

    setActiveVocabularySet('emotions');
    expect(getActiveVocabularySet().id).toBe('emotions');

    const emotionsGestures = getGesturesForVocabularySet('emotions');
    expect(emotionsGestures.length).toBeGreaterThan(0);
  });
});