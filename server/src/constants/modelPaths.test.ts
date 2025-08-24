import path from 'path';
import { getTrainedModelPath, TRAINED_MODEL_PATH, DATA_DIR } from './modelPaths';

describe('getTrainedModelPath', () => {
  it('returns global path when no profileId provided', () => {
    expect(getTrainedModelPath()).toBe(TRAINED_MODEL_PATH);
  });
  it('returns profile-specific path when profileId provided', () => {
    expect(getTrainedModelPath('abc')).toBe(
      path.join(DATA_DIR, 'trained_model_abc.json'),
    );
  });
});
