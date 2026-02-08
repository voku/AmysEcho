import { describe, expect, it } from 'vitest';
import {
  getSentenceFlowSuggestions,
  quickPhraseToSentenceSymbols,
  QUICK_PHRASES,
} from './metacomSentenceFlowService';
import type { MetacomBoardDefinition } from '../types/metacom';

const TEST_BOARDS: Record<string, MetacomBoardDefinition> = {
  essen: {
    id: 'essen',
    label: 'Essen',
    rows: 1,
    columns: 1,
    cells: [{ id: 'metacom_apfel', label: 'Apfel', emoji: '🍎', position: 0, type: 'symbol' }],
  },
  trinken: {
    id: 'trinken',
    label: 'Trinken',
    rows: 1,
    columns: 1,
    cells: [{ id: 'metacom_wasser', label: 'Wasser', emoji: '💧', position: 0, type: 'symbol' }],
  },
  spielen: {
    id: 'spielen',
    label: 'Spielen',
    rows: 1,
    columns: 1,
    cells: [{ id: 'metacom_ball', label: 'Ball', emoji: '⚽', position: 0, type: 'symbol' }],
  },
  gefuehle: {
    id: 'gefuehle',
    label: 'Gefühle',
    rows: 1,
    columns: 1,
    cells: [{ id: 'metacom_gluecklich', label: 'Glücklich', emoji: '😊', position: 0, type: 'symbol' }],
  },
  personen: {
    id: 'personen',
    label: 'Personen',
    rows: 1,
    columns: 1,
    cells: [{ id: 'metacom_mama', label: 'Mama', emoji: '👩', position: 0, type: 'symbol' }],
  },
  saetze: {
    id: 'saetze',
    label: 'Sätze',
    rows: 1,
    columns: 1,
    cells: [{ id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋', position: 0, type: 'symbol' }],
  },
};

describe('metacomSentenceFlowService', () => {
  describe('getSentenceFlowSuggestions', () => {
    it('returns empty array for empty queue', () => {
      expect(getSentenceFlowSuggestions([], TEST_BOARDS)).toEqual([]);
    });

    it('suggests essen/trinken/spielen after "Ich möchte"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ], TEST_BOARDS);

      expect(suggestions).toHaveLength(3);
      expect(suggestions.map((s) => s.boardId)).toEqual(['essen', 'trinken', 'spielen']);
    });

    it('suggests gefuehle after "Ich bin"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_bin', label: 'Ich bin', emoji: '👤' },
      ], TEST_BOARDS);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('gefuehle');
    });

    it('suggests personen after "Wo ist"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_wo_ist', label: 'Wo ist', emoji: '🔍' },
      ], TEST_BOARDS);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('personen');
    });

    it('suggests saetze after person symbol "Ich"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich', label: 'Ich', emoji: '👤' },
      ], TEST_BOARDS);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('saetze');
    });

    it('returns empty for symbols without flow rules', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_apfel', label: 'Apfel', emoji: '🍎' },
      ], TEST_BOARDS);

      expect(suggestions).toEqual([]);
    });

    it('uses only the last symbol in the queue', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich', label: 'Ich', emoji: '👤' },
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ], TEST_BOARDS);

      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]?.boardId).toBe('essen');
    });

    it('derives label and emoji from board definitions', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ], TEST_BOARDS);

      expect(suggestions[0]?.label).toBe('Essen');
      expect(suggestions[0]?.emoji).toBe('🍎');
      expect(suggestions[1]?.label).toBe('Trinken');
      expect(suggestions[1]?.emoji).toBe('💧');
    });

    it('skips boards not present in imported bundle', () => {
      const partialBoards: Record<string, MetacomBoardDefinition> = {
        essen: TEST_BOARDS['essen']!,
      };
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ], partialBoards);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('essen');
    });

    it('returns fallback labels without boards parameter', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ]);

      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]?.boardId).toBe('essen');
      expect(suggestions[0]?.label).toBe('essen');
    });
  });

  describe('quickPhraseToSentenceSymbols', () => {
    it('splits phrase into individual word symbols', () => {
      const phrase = QUICK_PHRASES.find((p) => p.id === 'qp_ja_bitte');
      expect(phrase).toBeDefined();
      const symbols = quickPhraseToSentenceSymbols(phrase!);

      expect(symbols).toHaveLength(2);
      expect(symbols[0]?.label).toBe('Ja');
      expect(symbols[1]?.label).toBe('bitte');
    });

    it('assigns emoji only to first word', () => {
      const phrase = QUICK_PHRASES.find((p) => p.id === 'qp_ich_moechte_mehr');
      expect(phrase).toBeDefined();
      const symbols = quickPhraseToSentenceSymbols(phrase!);

      expect(symbols).toHaveLength(3);
      expect(symbols[0]?.emoji).toBe('➕');
      expect(symbols[1]?.emoji).toBe('');
      expect(symbols[2]?.emoji).toBe('');
    });
  });

  describe('QUICK_PHRASES', () => {
    it('contains at least 10 quick phrases', () => {
      expect(QUICK_PHRASES.length).toBeGreaterThanOrEqual(10);
    });

    it('all phrases have required fields', () => {
      for (const phrase of QUICK_PHRASES) {
        expect(phrase.id).toBeTruthy();
        expect(phrase.label).toBeTruthy();
        expect(phrase.emoji).toBeTruthy();
        expect(phrase.speech).toBeTruthy();
      }
    });

    it('all phrase IDs are unique', () => {
      const ids = QUICK_PHRASES.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
