import { classifyGesture } from '../../server/src/recognizer';

describe('Recognizer', () => {
  it('should use local fallback for classification', async () => {
    const result = await classifyGesture([[0, 0]]);
    expect(result.processedBy).toBe('local');
  });
});