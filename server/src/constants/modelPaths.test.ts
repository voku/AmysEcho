import path from 'path';
import {
  getTrainedModelPath,
  TRAINED_MODEL_PATH,
  DATA_DIR,
  getMlpModelPath,
  TRAINED_MLP_MODEL_PATH,
} from './modelPaths.js';

describe('getTrainedModelPath', () => {
  it('returns global path when no profileId provided', () => {
    expect(getTrainedModelPath()).toBe(TRAINED_MODEL_PATH);
  });
  it('returns profile-specific path when profileId provided', () => {
    expect(getTrainedModelPath('abc')).toBe(
      path.join(DATA_DIR, 'trained_model_abc.json'),
    );
  });
  it('throws for invalid profileId', () => {
    expect(() => getTrainedModelPath('../etc/passwd')).toThrow('Invalid');
  });
});

describe('getMlpModelPath', () => {
  it('returns global path when no profileId provided', () => {
    expect(getMlpModelPath()).toBe(TRAINED_MLP_MODEL_PATH);
  });
  it('returns profile-specific path when profileId provided', () => {
    expect(getMlpModelPath('abc')).toBe(
      path.join(DATA_DIR, 'dgs_model_abc.npz'),
    );
  });
  it('throws for invalid profileId', () => {
    expect(() => getMlpModelPath('../etc/passwd')).toThrow('Invalid');
  });
});
