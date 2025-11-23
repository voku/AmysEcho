// @ts-nocheck
import { OptimizedGestureCombinationManager } from '../utils/OptimizedGestureCombinationManager';

describe('OptimizedGestureCombinationManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('detects sequences based on internal duration even if they completed earlier', () => {
    const manager = new OptimizedGestureCombinationManager();

    const baseTime = Date.now();
    manager.recordGesture('thumbs_up', 0.85);

    jest.setSystemTime(baseTime + 500);
    manager.recordGesture('open_palm', 0.9);

    // Advance the clock beyond the sequence timeWindow (2s) without recording new gestures.
    jest.setSystemTime(baseTime + 5000);

    const result = manager.checkForCombinations();

    expect(result).not.toBeNull();
    expect(result?.combination).toBe('yes_sequence');
    expect(result?.sequence).toEqual(['thumbs_up', 'open_palm']);
    expect(result?.timeSpan).toBeLessThanOrEqual(2000);
  });
});
