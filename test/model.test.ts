import { gestureModel, setActiveVocabularySet, getActiveVocabularySetId } from '../app/src/model';

(async () => {
  if (getActiveVocabularySetId() !== 'basic') {
    throw new Error('default set should be basic');
  }
  if (!gestureModel.gestures.length) {
    throw new Error('gestureModel should have entries');
  }

  setActiveVocabularySet('animals');
  if (getActiveVocabularySetId() !== 'animals') {
    throw new Error('setActiveVocabularySet failed');
  }
  if (gestureModel.gestures[0].id !== 'cat') {
    throw new Error('gestureModel not switched');
  }
  console.log('model set switching ok');
})();
