/**
 * Tests for One Euro Filter
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OneEuroFilter, OneEuroFilter3D, HandLandmarkFilter } from '../OneEuroFilter';

describe('OneEuroFilter', () => {
  describe('basic filtering', () => {
    it('gibt ersten Wert unverändert zurück', () => {
      const filter = new OneEuroFilter(1.0, 0.0, 1.0);
      const result = filter.filter(0.5, 0);
      expect(result).toBe(0.5);
    });

    it('glättet aufeinanderfolgende Werte', () => {
      const filter = new OneEuroFilter(1.0, 0.0, 1.0);
      filter.filter(0.5, 0);
      const result = filter.filter(0.6, 0.016); // ~16ms later
      
      // Should be smoothed between 0.5 and 0.6
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(0.6);
    });

    it('passt sich schnellen Bewegungen an (mit beta > 0)', () => {
      const filter = new OneEuroFilter(1.0, 0.5, 1.0);
      filter.filter(0.0, 0);
      filter.filter(0.5, 0.016);
      const result = filter.filter(1.0, 0.032);
      
      // Should follow movement more closely due to beta
      expect(result).toBeGreaterThan(0.5);
    });

    it('kann zurückgesetzt werden', () => {
      const filter = new OneEuroFilter(1.0, 0.0, 1.0);
      filter.filter(0.5, 0);
      filter.filter(0.6, 0.016);
      
      filter.reset();
      
      // After reset, should behave like new filter
      const result = filter.filter(0.1, 0);
      expect(result).toBe(0.1);
    });
  });
});

describe('OneEuroFilter3D', () => {
  it('filtert 3D-Punkte', () => {
    const filter = new OneEuroFilter3D(1.0, 0.0, 1.0);
    const point1: [number, number, number] = [0.5, 0.5, 0.5];
    const point2: [number, number, number] = [0.6, 0.6, 0.6];
    
    const result1 = filter.filter(point1, 0);
    expect(result1).toEqual([0.5, 0.5, 0.5]);
    
    const result2 = filter.filter(point2, 0.016);
    expect(result2[0]).toBeGreaterThan(0.5);
    expect(result2[0]).toBeLessThan(0.6);
  });

  it('kann zurückgesetzt werden', () => {
    const filter = new OneEuroFilter3D(1.0, 0.0, 1.0);
    filter.filter([0.5, 0.5, 0.5], 0);
    filter.filter([0.6, 0.6, 0.6], 0.016);
    
    filter.reset();
    
    const result = filter.filter([0.1, 0.2, 0.3], 0);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('HandLandmarkFilter', () => {
  let filter: HandLandmarkFilter;

  beforeEach(() => {
    filter = new HandLandmarkFilter(1.0, 0.007, 1.0);
  });

  it('filtert Hand-Landmarks', () => {
    const landmarks = [
      [0.1, 0.2, 0.3],
      [0.2, 0.3, 0.4],
      [0.3, 0.4, 0.5],
    ];
    
    const result = filter.filterLandmarks(landmarks, 0);
    
    expect(result.length).toBe(3);
    expect(result[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it('glättet Landmarks über Zeit', () => {
    const landmarks1 = [[0.1, 0.2, 0.3]];
    const landmarks2 = [[0.2, 0.3, 0.4]];
    
    filter.filterLandmarks(landmarks1, 0);
    const result = filter.filterLandmarks(landmarks2, 0.016);
    
    expect(result[0]![0]).toBeGreaterThan(0.1);
    expect(result[0]![0]).toBeLessThan(0.2);
  });

  it('behandelt leere Landmarks', () => {
    const result = filter.filterLandmarks([], 0);
    expect(result).toEqual([]);
  });

  it('behandelt Landmarks mit nur 2D-Koordinaten', () => {
    const landmarks = [[0.1, 0.2]];
    const result = filter.filterLandmarks(landmarks, 0);
    
    expect(result.length).toBe(1);
    expect(result[0]).toHaveLength(3);
    expect(result[0]![2]).toBe(0); // z should be 0
  });

  it('kann zurückgesetzt werden', () => {
    filter.filterLandmarks([[0.5, 0.5, 0.5]], 0);
    filter.filterLandmarks([[0.6, 0.6, 0.6]], 0.016);
    
    filter.reset();
    
    const result = filter.filterLandmarks([[0.1, 0.1, 0.1]], 0);
    expect(result[0]).toEqual([0.1, 0.1, 0.1]);
  });
});
