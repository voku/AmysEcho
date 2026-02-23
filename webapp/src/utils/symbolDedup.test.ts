import { describe, expect, it } from 'vitest';
import type { SymbolDefinition } from '../context/SymbolStore';
import { dedupeSymbolsByName, normalizeSymbolName } from './symbolDedup';

describe('symbolDedup', () => {
  it('normalizes symbol names with german locale', () => {
    expect(normalizeSymbolName('  ESSEN  ')).toBe('essen');
  });

  it('lowercases german-specific characters', () => {
    expect(normalizeSymbolName('ÄPFEL')).toBe('äpfel');
    expect(normalizeSymbolName('ÖL')).toBe('öl');
    expect(normalizeSymbolName('ÜBER')).toBe('über');
    expect(normalizeSymbolName('STRAẞE')).toBe('straße');
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeSymbolsByName([])).toHaveLength(0);
  });

  it('skips symbols with empty or whitespace-only names', () => {
    const result = dedupeSymbolsByName([
      { id: 'empty', name: '', category: 'food' },
      { id: 'spaces', name: '   ', category: 'food' },
      { id: 'valid', name: 'Apfel', category: 'food' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.id).toBe('valid');
  });

  it('keeps the first symbol when both collisions are global', () => {
    const result = dedupeSymbolsByName([
      { id: 'first', name: 'Essen', category: 'food' },
      { id: 'second', name: ' essen ', category: 'food' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.id).toBe('first');
  });


  it('treats whitespace-only profileId as global for collision priority', () => {
    const result = dedupeSymbolsByName([
      { id: 'global-first', name: 'Essen', category: 'food' },
      { id: 'whitespace-profile', name: ' essen ', category: 'food', profileId: '   ' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.id).toBe('global-first');
  });

  it('prefers profile-scoped symbol over whitespace-profileId encountered first', () => {
    const result = dedupeSymbolsByName([
      { id: 'whitespace-first', name: 'Essen', category: 'food', profileId: '   ' },
      { id: 'real-profile', name: ' essen ', category: 'food', profileId: 'amy' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.id).toBe('real-profile');
  });

  it('ignores malformed symbols with non-string names instead of crashing', () => {
    const malformedSymbols = [
      { id: 'invalid-number-name', name: 123, category: 'food' },
      { id: 'invalid-null-name', name: null, category: 'food' },
      { id: 'valid', name: ' Essen ', category: 'food', profileId: 123 },
    ] as unknown as SymbolDefinition[];

    const result = dedupeSymbolsByName(malformedSymbols);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('valid');
    expect(result[0]?.name).toBe('Essen');
    expect(result[0]?.profileId).toBeUndefined();
  });

  it('keeps the first symbol when both collisions are profile-scoped', () => {
    const result = dedupeSymbolsByName([
      { id: 'profile-first', name: 'Essen', category: 'food', profileId: 'amy' },
      { id: 'profile-second', name: ' essen ', category: 'food', profileId: 'amy' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.id).toBe('profile-first');
  });
});
