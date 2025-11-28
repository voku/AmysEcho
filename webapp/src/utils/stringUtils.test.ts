/**
 * Tests for string utility functions
 */

import { describe, expect, it } from 'vitest';
import { slugify, normalizeGestureLabel } from './stringUtils';

describe('stringUtils', () => {
  describe('slugify', () => {
    it('should convert German umlauts to ASCII equivalents', () => {
      expect(slugify('ä')).toBe('ae');
      expect(slugify('ö')).toBe('oe');
      expect(slugify('ü')).toBe('ue');
      expect(slugify('Ä')).toBe('ae');
      expect(slugify('Ö')).toBe('oe');
      expect(slugify('Ü')).toBe('ue');
      expect(slugify('ß')).toBe('ss');
    });

    it('should handle German gesture labels correctly', () => {
      expect(slugify('Ärger zeigen')).toBe('aerger_zeigen');
      expect(slugify('Fuß wackeln')).toBe('fuss_wackeln');
      expect(slugify('Müde sein')).toBe('muede_sein');
      expect(slugify('Tür öffnen')).toBe('tuer_oeffnen');
    });

    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello_world');
      expect(slugify('HELLO')).toBe('hello');
    });

    it('should replace spaces with underscores', () => {
      expect(slugify('hello world')).toBe('hello_world');
      expect(slugify('one two three')).toBe('one_two_three');
    });

    it('should remove special characters except underscore and hyphen', () => {
      expect(slugify('hello! world?')).toBe('hello_world');
      expect(slugify('test@example.com')).toBe('testexamplecom');
      expect(slugify('hello-world')).toBe('hello-world');
      expect(slugify('hello_world')).toBe('hello_world');
    });

    it('should collapse multiple consecutive underscores or hyphens', () => {
      expect(slugify('hello___world')).toBe('hello_world');
      expect(slugify('hello---world')).toBe('hello_world');
      expect(slugify('hello  world')).toBe('hello_world');
    });

    it('should remove leading and trailing underscores or hyphens', () => {
      expect(slugify('_hello_')).toBe('hello');
      expect(slugify('-hello-')).toBe('hello');
      expect(slugify('__hello__')).toBe('hello');
    });

    it('should handle empty strings', () => {
      expect(slugify('')).toBe('');
      expect(slugify('   ')).toBe('');
    });

    it('should handle strings with only special characters', () => {
      expect(slugify('!!!')).toBe('');
      expect(slugify('@#$%')).toBe('');
    });

    it('should handle mixed case German text', () => {
      expect(slugify('ÄRGER ZEIGEN')).toBe('aerger_zeigen');
      expect(slugify('Große Überraschung')).toBe('grosse_ueberraschung');
    });

    it('should match the server regex pattern [a-z0-9][a-z0-9_-]+', () => {
      const serverPattern = /^[a-z0-9][a-z0-9_-]+$/;
      
      expect(slugify('Ärger zeigen')).toMatch(serverPattern);
      expect(slugify('Fuß wackeln')).toMatch(serverPattern);
      expect(slugify('Müde sein')).toMatch(serverPattern);
      expect(slugify('hello world')).toMatch(serverPattern);
      expect(slugify('test-123')).toMatch(serverPattern);
    });

    it('should handle non-string inputs gracefully', () => {
      expect(slugify(null as any)).toBe('');
      expect(slugify(undefined as any)).toBe('');
      expect(slugify(123 as any)).toBe('');
    });
  });

  describe('normalizeGestureLabel', () => {
    it('should use slugify for normalization', () => {
      expect(normalizeGestureLabel('Ärger zeigen')).toBe('aerger_zeigen');
      expect(normalizeGestureLabel('Hello World')).toBe('hello_world');
    });

    it('should ensure result matches server validation pattern', () => {
      const serverPattern = /^[a-z0-9][a-z0-9_-]+$/;
      
      const labels = [
        'Ärger zeigen',
        'Fuß wackeln',
        'Müde sein',
        'Tür öffnen',
        'Große Überraschung',
      ];

      labels.forEach(label => {
        const normalized = normalizeGestureLabel(label);
        expect(normalized).toMatch(serverPattern);
      });
    });
  });
});
