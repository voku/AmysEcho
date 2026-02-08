import { describe, expect, it } from 'vitest';
import {
  getSentenceFlowSuggestions,
  quickPhraseToSentenceSymbols,
  QUICK_PHRASES,
} from './metacomSentenceFlowService';

describe('metacomSentenceFlowService', () => {
  describe('getSentenceFlowSuggestions', () => {
    it('returns empty array for empty queue', () => {
      expect(getSentenceFlowSuggestions([])).toEqual([]);
    });

    it('suggests essen/trinken/spielen after "Ich möchte"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ]);

      expect(suggestions).toHaveLength(3);
      expect(suggestions.map((s) => s.boardId)).toEqual(['essen', 'trinken', 'spielen']);
    });

    it('suggests gefuehle after "Ich bin"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich_bin', label: 'Ich bin', emoji: '👤' },
      ]);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('gefuehle');
    });

    it('suggests personen after "Wo ist"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_wo_ist', label: 'Wo ist', emoji: '🔍' },
      ]);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('personen');
    });

    it('suggests saetze after person symbol "Ich"', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich', label: 'Ich', emoji: '👤' },
      ]);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.boardId).toBe('saetze');
    });

    it('returns empty for symbols without flow rules', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_apfel', label: 'Apfel', emoji: '🍎' },
      ]);

      expect(suggestions).toEqual([]);
    });

    it('uses only the last symbol in the queue', () => {
      const suggestions = getSentenceFlowSuggestions([
        { id: 'metacom_ich', label: 'Ich', emoji: '👤' },
        { id: 'metacom_ich_moechte', label: 'Ich möchte', emoji: '🙋' },
      ]);

      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]?.boardId).toBe('essen');
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
