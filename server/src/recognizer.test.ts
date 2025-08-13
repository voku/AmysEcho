import path from 'path';
import { classifyGesture } from './recognizer';

describe('classifyGesture', () => {
  it('falls back to offline model when cloud fails', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    process.env.OFFLINE_MODEL_PATH = path.join(__dirname, 'offlineModel.json');
    const result = await classifyGesture([0, 0]);
    expect(result).toEqual({ label: 'g1', processedBy: 'local', confidence: expect.any(Number) });
    (global.fetch as any) = originalFetch;
  });
});
