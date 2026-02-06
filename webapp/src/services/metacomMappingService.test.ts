import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveGestureSymbol, resolveSymbolId } from './metacomMappingService';

// Mock localStorage for gestureMeaningService (loads defaults when empty)
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

describe('metacomMappingService', () => {
  describe('resolveGestureSymbol', () => {
    it('resolves a gesture label to a Metacom symbol by label', () => {
      const result = resolveGestureSymbol('Ja');
      expect(result).not.toBeNull();
      expect(result!.symbolId).toBe('metacom_ja');
      expect(result!.label).toBe('Ja');
      expect(result!.emoji).toBe('👍');
      expect(result!.boardId).toBe('start');
    });

    it('resolves a gesture label case-insensitively', () => {
      const result = resolveGestureSymbol('ja');
      expect(result).not.toBeNull();
      expect(result!.symbolId).toBe('metacom_ja');
    });

    it('resolves a symbol on a sub-board', () => {
      const result = resolveGestureSymbol('Apfel');
      expect(result).not.toBeNull();
      expect(result!.symbolId).toBe('metacom_apfel');
      expect(result!.boardId).toBe('essen');
      expect(result!.category).toBe('essen');
    });

    it('resolves by explicit symbolId', () => {
      const result = resolveGestureSymbol('Anything', 'metacom_hilfe');
      expect(result).not.toBeNull();
      expect(result!.symbolId).toBe('metacom_hilfe');
      expect(result!.label).toBe('Hilfe');
    });

    it('falls back to gestureMeaningService when no Metacom match', () => {
      const result = resolveGestureSymbol('toilette');
      expect(result).not.toBeNull();
      expect(result!.label).toBe('Toilette');
      expect(result!.emoji).toBe('🚽');
      expect(result!.boardId).toBeNull();
    });

    it('returns null for unknown gestures', () => {
      const result = resolveGestureSymbol('unbekannte_geste_xyz');
      expect(result).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(resolveGestureSymbol('')).toBeNull();
      expect(resolveGestureSymbol('', null)).toBeNull();
    });

    it('prefers start board matches over sub-board matches', () => {
      // "Mehr" exists on the start board AND sub-boards (essen, trinken, spielen)
      const result = resolveGestureSymbol('Mehr');
      expect(result).not.toBeNull();
      expect(result!.boardId).toBe('start');
    });
  });

  describe('resolveSymbolId', () => {
    it('resolves a known symbolId', () => {
      const result = resolveSymbolId('metacom_wasser');
      expect(result).not.toBeNull();
      expect(result!.label).toBe('Wasser');
      expect(result!.boardId).toBe('trinken');
    });

    it('returns null for unknown symbolId', () => {
      expect(resolveSymbolId('unknown_id')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveSymbolId('')).toBeNull();
    });
  });
});
