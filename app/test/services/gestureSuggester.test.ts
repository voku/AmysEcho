/**
 * Gesture Suggester Tests - Amy First
 *
 * Validates predictive suggestion accuracy tracking and confidence boosting.
 */

import gestureSuggester from '../../src/services/gestureSuggester';

// Mock logger to keep test output clean
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('GestureSuggester', () => {
  const context = { recentGestures: ['hello'], timeOfDay: 0, confidence: 0.2 };

  beforeEach(() => {
    gestureSuggester.clearHistory();
  });

  it('tracks suggestion selection accuracy', () => {
    const suggestions = gestureSuggester.getSuggestions(null, context);
    expect(suggestions[0].id).toBe('hello');

    gestureSuggester.recordSuggestionResult('hello', true);
    const stats = gestureSuggester.getSuggestionStats('hello');
    expect(stats.shown).toBe(1);
    expect(stats.accepted).toBe(1);
  });

  it('does not allow accepted count to exceed shown count', () => {
    gestureSuggester.recordSuggestionResult('unseen', true);
    const stats = gestureSuggester.getSuggestionStats('unseen');
    expect(stats.accepted).toBe(1);
    expect(stats.shown).toBe(1);
  });

  it('boosts confidence for accurate suggestions', () => {
    const first = gestureSuggester.getSuggestions(null, context);
    const initialConf = first[0].confidence;

    gestureSuggester.recordSuggestionResult('hello', true);
    const second = gestureSuggester.getSuggestions(null, context);

    expect(second[0].confidence).toBeGreaterThan(initialConf);
  });
});
