import path from 'path';
import { getMlpModelPath, TRAINED_MLP_MODEL_PATH, MLP_MODELS_DIR } from './modelPaths.js';

describe('getMlpModelPath', () => {
  it('returns global path when no profileId provided', () => {
    expect(getMlpModelPath()).toBe(TRAINED_MLP_MODEL_PATH);
  });
  it('returns profile-specific path when profileId provided', () => {
    expect(getMlpModelPath('abc')).toBe(
      path.join(MLP_MODELS_DIR, 'abc', 'amy_model.npz'),
    );
  });
  it('throws for invalid profileId', () => {
    expect(() => getMlpModelPath('../etc/passwd')).toThrow('Invalid');
  });
});
