import { AdaptiveRecommendation } from '../../src/services/adaptiveLearningService';
import { getRecommendationLabel } from '../../src/components/AdaptiveLearningPanel';

describe('getRecommendationLabel', () => {
  const baseRecommendation: Omit<AdaptiveRecommendation, 'type'> = {
    reason: 'Test',
    priority: 'medium',
    estimatedTime: 3,
    expectedDifficulty: 'easy',
    confidence: 0.9,
  };

  it('prefers the gesture label when available', () => {
    const recommendation: AdaptiveRecommendation = {
      ...baseRecommendation,
      type: 'practice',
      gesture: 'Hallo',
    };

    expect(getRecommendationLabel(recommendation)).toBe('Hallo');
  });

  it('uses Pause for break recommendations without gestures', () => {
    const breakRecommendation = {
      ...baseRecommendation,
      type: 'break' as any,
      gesture: undefined,
    } as AdaptiveRecommendation;

    expect(getRecommendationLabel(breakRecommendation)).toBe('Pause');
  });

  it('falls back to a neutral Aktivität label when needed', () => {
    const recommendation: AdaptiveRecommendation = {
      ...baseRecommendation,
      type: 'review',
      gesture: undefined,
    };

    expect(getRecommendationLabel(recommendation)).toBe('Aktivität');
  });
});
