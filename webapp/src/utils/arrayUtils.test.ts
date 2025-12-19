/**
 * Tests for array utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSuccessRate,
  filterByProperty,
  groupByProperty,
  countByProperty,
  getMostRecent,
  sortByTimestampDesc,
  sortByTimestampAsc,
  calculateAverage,
  getUniqueValues,
  chunkArray,
  takeFirst,
  takeLast,
  uniqueByProperty,
} from './arrayUtils';

describe('arrayUtils', () => {
  describe('calculateSuccessRate', () => {
    it('should calculate success rate correctly', () => {
      const items = [
        { success: true },
        { success: false },
        { success: true },
        { success: true },
      ];
      expect(calculateSuccessRate(items)).toBe(0.75);
    });

    it('should return 0 for empty array', () => {
      expect(calculateSuccessRate([])).toBe(0);
    });

    it('should return 1 for all successes', () => {
      const items = [{ success: true }, { success: true }];
      expect(calculateSuccessRate(items)).toBe(1);
    });

    it('should return 0 for all failures', () => {
      const items = [{ success: false }, { success: false }];
      expect(calculateSuccessRate(items)).toBe(0);
    });
  });

  describe('filterByProperty', () => {
    it('should filter items by property value', () => {
      const items = [
        { name: 'Amy', age: 5 },
        { name: 'Bob', age: 7 },
        { name: 'Amy', age: 8 },
      ];
      const result = filterByProperty(items, 'name', 'Amy');
      expect(result).toHaveLength(2);
      expect(result[0]?.age).toBe(5);
      expect(result[1]?.age).toBe(8);
    });
  });

  describe('groupByProperty', () => {
    it('should group items by property', () => {
      const items = [
        { type: 'gesture', value: 1 },
        { type: 'sound', value: 2 },
        { type: 'gesture', value: 3 },
      ];
      const groups = groupByProperty(items, 'type');
      expect(groups.size).toBe(2);
      expect(groups.get('gesture')).toHaveLength(2);
      expect(groups.get('sound')).toHaveLength(1);
    });
  });

  describe('countByProperty', () => {
    it('should count items matching property value', () => {
      const items = [
        { status: 'complete' },
        { status: 'pending' },
        { status: 'complete' },
        { status: 'complete' },
      ];
      expect(countByProperty(items, 'status', 'complete')).toBe(3);
      expect(countByProperty(items, 'status', 'pending')).toBe(1);
    });
  });

  describe('getMostRecent', () => {
    it('should return most recent item', () => {
      const items = [
        { timestamp: 1000, value: 'old' },
        { timestamp: 3000, value: 'newest' },
        { timestamp: 2000, value: 'middle' },
      ];
      const result = getMostRecent(items);
      expect(result?.value).toBe('newest');
    });

    it('should return undefined for empty array', () => {
      expect(getMostRecent([])).toBeUndefined();
    });
  });

  describe('sortByTimestampDesc', () => {
    it('should sort by timestamp descending', () => {
      const items = [
        { timestamp: 1000 },
        { timestamp: 3000 },
        { timestamp: 2000 },
      ];
      const result = sortByTimestampDesc(items);
      expect(result[0]?.timestamp).toBe(3000);
      expect(result[1]?.timestamp).toBe(2000);
      expect(result[2]?.timestamp).toBe(1000);
    });

    it('should not mutate original array', () => {
      const items = [{ timestamp: 1000 }, { timestamp: 2000 }];
      const original = [...items];
      sortByTimestampDesc(items);
      expect(items).toEqual(original);
    });
  });

  describe('sortByTimestampAsc', () => {
    it('should sort by timestamp ascending', () => {
      const items = [
        { timestamp: 3000 },
        { timestamp: 1000 },
        { timestamp: 2000 },
      ];
      const result = sortByTimestampAsc(items);
      expect(result[0]?.timestamp).toBe(1000);
      expect(result[1]?.timestamp).toBe(2000);
      expect(result[2]?.timestamp).toBe(3000);
    });
  });

  describe('calculateAverage', () => {
    it('should calculate average correctly', () => {
      expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateAverage([10, 20, 30])).toBe(20);
    });

    it('should return 0 for empty array', () => {
      expect(calculateAverage([])).toBe(0);
    });

    it('should handle single value', () => {
      expect(calculateAverage([42])).toBe(42);
    });
  });

  describe('getUniqueValues', () => {
    it('should return unique values', () => {
      const result = getUniqueValues([1, 2, 2, 3, 1, 4]);
      expect(result).toHaveLength(4);
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).toContain(3);
      expect(result).toContain(4);
    });

    it('should work with strings', () => {
      const result = getUniqueValues(['a', 'b', 'a', 'c']);
      expect(result).toHaveLength(3);
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });
  });

  describe('chunkArray', () => {
    it('should chunk array into specified sizes', () => {
      const items = [1, 2, 3, 4, 5, 6, 7];
      const result = chunkArray(items, 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([1, 2, 3]);
      expect(result[1]).toEqual([4, 5, 6]);
      expect(result[2]).toEqual([7]);
    });

    it('should handle chunk size larger than array', () => {
      const items = [1, 2, 3];
      const result = chunkArray(items, 10);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([1, 2, 3]);
    });

    it('should handle zero or negative chunk size', () => {
      const items = [1, 2, 3];
      const result = chunkArray(items, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([1, 2, 3]);
    });
  });

  describe('takeFirst', () => {
    it('should take first N items', () => {
      const items = [1, 2, 3, 4, 5];
      expect(takeFirst(items, 3)).toEqual([1, 2, 3]);
    });

    it('should handle count larger than array', () => {
      const items = [1, 2];
      expect(takeFirst(items, 10)).toEqual([1, 2]);
    });

    it('should handle negative count', () => {
      const items = [1, 2, 3];
      expect(takeFirst(items, -1)).toEqual([]);
    });
  });

  describe('takeLast', () => {
    it('should take last N items', () => {
      const items = [1, 2, 3, 4, 5];
      expect(takeLast(items, 3)).toEqual([3, 4, 5]);
    });

    it('should handle count larger than array', () => {
      const items = [1, 2];
      expect(takeLast(items, 10)).toEqual([1, 2]);
    });
  });

  describe('uniqueByProperty', () => {
    it('should remove duplicates by property', () => {
      const items = [
        { id: 1, name: 'Amy' },
        { id: 2, name: 'Bob' },
        { id: 1, name: 'Amy2' },
        { id: 3, name: 'Charlie' },
      ];
      const result = uniqueByProperty(items, 'id');
      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe(1);
      expect(result[1]?.id).toBe(2);
      expect(result[2]?.id).toBe(3);
    });

    it('should keep first occurrence', () => {
      const items = [
        { id: 1, value: 'first' },
        { id: 1, value: 'second' },
      ];
      const result = uniqueByProperty(items, 'id');
      expect(result).toHaveLength(1);
      expect(result[0]?.value).toBe('first');
    });
  });
});
