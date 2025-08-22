import path from 'path';
import { classifyGesture } from './recognizer';

describe('classifyGesture', () => {
  it('falls back to offline model when cloud fails', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
      process.env.OFFLINE_MODEL_PATH = path.join(
        __dirname,
        'offlineModel.json'
      );
      const result = await classifyGesture([0, 0]);
      expect(result).toEqual({
        label: 'g1',
        processedBy: 'local',
        confidence: expect.any(Number),
      });
    } finally {
      if (originalFetch === undefined) {
        // remove the mock if there was no fetch prior
        // @ts-expect-error delete global property
        delete global.fetch;
      } else {
        (global.fetch as any) = originalFetch as any;
      }
      delete process.env.OFFLINE_MODEL_PATH;
    }
  });

  it('flattens landmark arrays of varying depth for offline classification', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
      process.env.OFFLINE_MODEL_PATH = path.join(__dirname, 'offlineModel.json');
      const shallow = await classifyGesture([[0, 0], [0, 0]]);
      const deep = await classifyGesture([[[0, 0, 0], [0, 0, 0]]]);
      expect(shallow.label).toBe('g1');
      expect(deep.label).toBe('g1');
    } finally {
      if (originalFetch === undefined) {
        // @ts-expect-error delete global property
        delete global.fetch;
      } else {
        (global.fetch as any) = originalFetch as any;
      }
      delete process.env.OFFLINE_MODEL_PATH;
    }
  });
});
