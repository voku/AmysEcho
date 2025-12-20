import { describe, it, expect, beforeEach } from 'vitest';
import { gestureMeaningService } from './gestureMeaningService';

describe('gestureMeaningService', () => {
  beforeEach(() => {
    // Reset to defaults for each test
    gestureMeaningService.reset();
  });

  describe('MediaPipe gesture recognition outputs', () => {
    it('should map thumbs_up to "Ja"', () => {
      const meaning = gestureMeaningService.getMeaning('thumbs_up');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Ja');
      expect(meaning?.audioText).toBe('Ja');
    });

    it('should map thumbs_down to "Nein"', () => {
      const meaning = gestureMeaningService.getMeaning('thumbs_down');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Nein');
      expect(meaning?.audioText).toBe('Nein');
    });

    it('should map open_palm to "Hallo"', () => {
      const meaning = gestureMeaningService.getMeaning('open_palm');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Hallo');
      expect(meaning?.audioText).toBe('Hallo');
    });

    it('should map fist to "Halt"', () => {
      const meaning = gestureMeaningService.getMeaning('fist');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Halt');
      expect(meaning?.audioText).toBe('Halt');
    });

    it('should map pointing_up to "Da!"', () => {
      const meaning = gestureMeaningService.getMeaning('pointing_up');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Da!');
      expect(meaning?.audioText).toBe('Da');
    });

    it('should map victory to "Spaß"', () => {
      const meaning = gestureMeaningService.getMeaning('victory');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Spaß');
      expect(meaning?.audioText).toBe('Spaß');
    });

    it('should map iloveyou to "Liebhaben"', () => {
      const meaning = gestureMeaningService.getMeaning('iloveyou');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Liebhaben');
      expect(meaning?.audioText).toBe('Ich habe dich lieb');
    });

    it('should map help to "Hilfe"', () => {
      const meaning = gestureMeaningService.getMeaning('help');
      expect(meaning).toBeDefined();
      expect(meaning?.label).toBe('Hilfe');
      expect(meaning?.audioText).toBe('Ich brauche Hilfe');
    });
  });

  describe('DGS baseline gestures', () => {
    it('should provide meanings for all baseline gestures', () => {
      const baselineGestures = [
        'alle', 'blau', 'essen', 'fertig', 'gelb', 'gruen', 
        'nochmal', 'rot', 'satt', 'schwester', 'spielen', 'trinken'
      ];

      baselineGestures.forEach(gestureId => {
        const meaning = gestureMeaningService.getMeaning(gestureId);
        expect(meaning, `Missing meaning for ${gestureId}`).toBeDefined();
        expect(meaning?.label).toBeTruthy();
        expect(meaning?.emoji).toBeTruthy();
      });
    });
  });

  describe('Single source of truth', () => {
    it('should be case-insensitive for gesture lookups', () => {
      const lowercase = gestureMeaningService.getMeaning('thumbs_up');
      const uppercase = gestureMeaningService.getMeaning('THUMBS_UP');
      const mixedcase = gestureMeaningService.getMeaning('Thumbs_Up');

      expect(lowercase).toEqual(uppercase);
      expect(lowercase).toEqual(mixedcase);
    });

    it('should return all gestures sorted by priority', () => {
      const allMeanings = gestureMeaningService.getAllMeanings();
      
      // Should have all gestures
      expect(allMeanings.length).toBeGreaterThan(20);
      
      // Should be sorted by priority (lower number = higher priority)
      for (let i = 1; i < allMeanings.length; i++) {
        expect(allMeanings[i].priority).toBeGreaterThanOrEqual(allMeanings[i - 1].priority);
      }
    });

    it('should provide consistent audio text for gestures', () => {
      const thumbsUp = gestureMeaningService.getMeaning('thumbs_up');
      const ja = gestureMeaningService.getMeaning('ja');
      
      // Both should provide audio text
      expect(thumbsUp?.audioText).toBeTruthy();
      expect(ja?.audioText).toBeTruthy();
    });
  });

  describe('Custom gesture support', () => {
    it('should allow adding new gesture meanings', () => {
      const customGesture = {
        gestureId: 'custom_wave',
        label: 'Winken',
        emoji: '👋',
        category: 'begrüßung',
        color: '#FFD700',
        audioText: 'Hallo',
        priority: 2
      };

      gestureMeaningService.setMeaning(customGesture);
      
      const retrieved = gestureMeaningService.getMeaning('custom_wave');
      expect(retrieved).toEqual(customGesture);
    });

    it('should allow removing gesture meanings', () => {
      gestureMeaningService.removeMeaning('thumbs_up');
      
      const meaning = gestureMeaningService.getMeaning('thumbs_up');
      expect(meaning).toBeUndefined();
    });
  });

  describe('Categories', () => {
    it('should organize gestures by category', () => {
      const categories = gestureMeaningService.getCategories();
      
      expect(categories).toContain('grundbedürfnisse');
      expect(categories).toContain('kommunikation');
      expect(categories).toContain('antworten');
      expect(categories).toContain('personen');
      expect(categories).toContain('begrüßung');
      expect(categories).toContain('emotionen');
      expect(categories).toContain('farben');
    });

    it('should return gestures filtered by category', () => {
      const answers = gestureMeaningService.getMeaningsByCategory('antworten');
      
      expect(answers.length).toBeGreaterThan(0);
      answers.forEach(meaning => {
        expect(meaning.category).toBe('antworten');
      });
    });
  });
});
