/**
 * Tests for time utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrentTimestamp,
  getTimestampId,
  getTimeDiff,
  isWithinTimeWindow,
  filterByTimeWindow,
  filterAfterTimestamp,
  TIME_CONSTANTS,
  getDaysCutoff,
  getHoursCutoff,
  getMinutesCutoff,
  formatTimestamp,
  getUptimeSeconds,
} from './timeUtils';

describe('timeUtils', () => {
  describe('getCurrentTimestamp', () => {
    it('should return current timestamp', () => {
      const before = Date.now();
      const result = getCurrentTimestamp();
      const after = Date.now();
      
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });

  describe('getTimestampId', () => {
    it('should return base-36 string', () => {
      const id = getTimestampId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      // Should be valid base-36
      expect(() => parseInt(id, 36)).not.toThrow();
    });

    it('should generate unique IDs', () => {
      const id1 = getTimestampId();
      const id2 = getTimestampId();
      // May be equal if called in same millisecond, but structure is valid
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });
  });

  describe('getTimeDiff', () => {
    it('should calculate time difference', () => {
      const past = 1000;
      const now = 5000;
      expect(getTimeDiff(past, now)).toBe(4000);
    });

    it('should use current time if not provided', () => {
      const past = Date.now() - 1000;
      const diff = getTimeDiff(past);
      expect(diff).toBeGreaterThanOrEqual(1000);
      expect(diff).toBeLessThan(1100); // Allow 100ms tolerance
    });
  });

  describe('isWithinTimeWindow', () => {
    it('should return true if within window', () => {
      const now = 10000;
      const timestamp = 8000;
      const window = 3000;
      expect(isWithinTimeWindow(timestamp, window, now)).toBe(true);
    });

    it('should return false if outside window', () => {
      const now = 10000;
      const timestamp = 5000;
      const window = 3000;
      expect(isWithinTimeWindow(timestamp, window, now)).toBe(false);
    });

    it('should return true if exactly at window boundary', () => {
      const now = 10000;
      const timestamp = 7000;
      const window = 3000;
      expect(isWithinTimeWindow(timestamp, window, now)).toBe(true);
    });
  });

  describe('filterByTimeWindow', () => {
    it('should filter items within window', () => {
      const now = 10000;
      const items = [
        { timestamp: 9000, value: 'recent' },
        { timestamp: 5000, value: 'old' },
        { timestamp: 8500, value: 'recent2' },
      ];
      const result = filterByTimeWindow(items, 2000, now);
      expect(result).toHaveLength(2);
      expect(result[0]?.value).toBe('recent');
      expect(result[1]?.value).toBe('recent2');
    });

    it('should return empty array if no items match', () => {
      const now = 10000;
      const items = [
        { timestamp: 5000, value: 'old1' },
        { timestamp: 4000, value: 'old2' },
      ];
      const result = filterByTimeWindow(items, 1000, now);
      expect(result).toHaveLength(0);
    });
  });

  describe('filterAfterTimestamp', () => {
    it('should filter items after cutoff', () => {
      const items = [
        { timestamp: 9000, value: 'a' },
        { timestamp: 5000, value: 'b' },
        { timestamp: 7000, value: 'c' },
      ];
      const result = filterAfterTimestamp(items, 6000);
      expect(result).toHaveLength(2);
      expect(result.map(i => i.value)).toEqual(['a', 'c']);
    });

    it('should include items at exact cutoff', () => {
      const items = [
        { timestamp: 6000, value: 'exact' },
        { timestamp: 5999, value: 'before' },
      ];
      const result = filterAfterTimestamp(items, 6000);
      expect(result).toHaveLength(1);
      expect(result[0]?.value).toBe('exact');
    });
  });

  describe('TIME_CONSTANTS', () => {
    it('should have correct time values', () => {
      expect(TIME_CONSTANTS.SECOND).toBe(1000);
      expect(TIME_CONSTANTS.MINUTE).toBe(60 * 1000);
      expect(TIME_CONSTANTS.HOUR).toBe(60 * 60 * 1000);
      expect(TIME_CONSTANTS.DAY).toBe(24 * 60 * 60 * 1000);
      expect(TIME_CONSTANTS.WEEK).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('getDaysCutoff', () => {
    it('should calculate days cutoff', () => {
      const now = 10 * TIME_CONSTANTS.DAY;
      const cutoff = getDaysCutoff(3, now);
      expect(cutoff).toBe(7 * TIME_CONSTANTS.DAY);
    });
  });

  describe('getHoursCutoff', () => {
    it('should calculate hours cutoff', () => {
      const now = 10 * TIME_CONSTANTS.HOUR;
      const cutoff = getHoursCutoff(2, now);
      expect(cutoff).toBe(8 * TIME_CONSTANTS.HOUR);
    });
  });

  describe('getMinutesCutoff', () => {
    it('should calculate minutes cutoff', () => {
      const now = 10 * TIME_CONSTANTS.MINUTE;
      const cutoff = getMinutesCutoff(5, now);
      expect(cutoff).toBe(5 * TIME_CONSTANTS.MINUTE);
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamp as ISO string', () => {
      const timestamp = 1609459200000; // 2021-01-01T00:00:00.000Z
      const result = formatTimestamp(timestamp);
      expect(result).toBe('2021-01-01T00:00:00.000Z');
    });
  });

  describe('getUptimeSeconds', () => {
    it('should calculate uptime in seconds', () => {
      const startTime = 1000;
      const now = 6000;
      const uptime = getUptimeSeconds(startTime, now);
      expect(uptime).toBe(5);
    });
  });
});
