import path from 'path';
import { classifyGesture } from './recognizer';

describe('classifyGesture', () => {
  it('falls back to offline model when cloud fails', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
      const modelPath = path.join(process.cwd(), 'src/offlineModel.json');
      const result = await classifyGesture([0, 0], modelPath, true);
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
    }
  });

  it('flattens landmark arrays of varying depth for offline classification', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
      const modelPath = path.join(process.cwd(), 'src/offlineModel.json');
      const shallow = await classifyGesture([[0, 0], [0, 0]], modelPath, true);
      const deep = await classifyGesture([[[0, 0, 0], [0, 0, 0]]], modelPath, true);
      expect(shallow.label).toBe('g1');
      expect(deep.label).toBe('g1');
    } finally {
      if (originalFetch === undefined) {
        // remove the mock if there was no fetch prior
        // @ts-expect-error delete global property
        delete global.fetch;
      } else {
        (global.fetch as any) = originalFetch as any;
      }
    }
  });
});
