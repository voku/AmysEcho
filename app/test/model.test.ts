import { gestureModel, setActiveVocabularySet, getActiveVocabularySet, getGesturesForVocabularySet } from '../src/model';

(async () => {
  if (getActiveVocabularySet().id !== 'basic') {
    throw new Error('default set should be basic');
  }
  if (!gestureModel.gestures.length) {
    throw new Error('gestureModel should have entries');
  }

  setActiveVocabularySet('emotions');
  if (getActiveVocabularySet().id !== 'emotions') {
    throw new Error('setActiveVocabularySet failed');
  }
  const emotionsGestures = getGesturesForVocabularySet('emotions');
  if (emotionsGestures.length === 0) {
    throw new Error('gestures not returned for emotions');
  }
  console.log('model set switching ok');
})();
