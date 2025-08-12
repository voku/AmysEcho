import { classifyGesture } from '../../server/src/recognizer';

// Ensures the pipeline accepts the agreed shape; we only assert the shape is processed without crash.
// The server-side recognizer already has local-fallback tests in your suite.
describe('Landmark vector contract', () => {
  it('accepts 63-length flat vectors', async () => {
    // 21 points × xyz => 63 values, normalized in [0..1]
    const lm = Array.from({ length: 63 }, (_, i) => (i % 3 === 0 ? 0.2 : 0.8));
    const result = await classifyGesture([lm]); // your recognizer expects an array of frames/landmarks
    expect(result).toBeDefined();
    expect(['local', 'cloud']).toContain(result.processedBy);
  });
});
