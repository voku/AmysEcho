import { describe, expect, it } from 'vitest';
import type { MetacomCell } from '../types/metacom';
import { buildNextWordLabel, getNextWordRecommendations } from './metacomRecommendationService';

describe('metacomRecommendationService', () => {
  it('builds a dynamic label with age, time, and recent sentence', () => {
    const now = new Date('2025-01-10T08:10:00');
    const label = buildNextWordLabel({
      childAge: 5,
      lastSentence: 'Ich essen',
      lastSentenceAt: now.getTime() - 2 * 60 * 1000,
      now,
    });

    expect(label).toContain('Nächste Wörter');
    expect(label).toContain('für 5 Jahre');
    expect(label).toContain('am Morgen');
    expect(label).toContain('gerade „Ich essen“');
  });

  it('recommends action words after a person symbol', () => {
    const cells: MetacomCell[] = [
      { id: 'ich', label: 'Ich', emoji: '👤', position: 0, type: 'symbol', role: 'person' },
      {
        id: 'essen',
        label: 'Essen',
        emoji: '🍎',
        position: 1,
        type: 'board',
        targetBoardId: 'essen',
        role: 'action',
      },
      { id: 'brot', label: 'Brot', emoji: '🍞', position: 2, type: 'symbol', role: 'object' },
      { id: 'mehr', label: 'Mehr', emoji: '➕', position: 3, type: 'symbol', role: 'modifier' },
    ];

    const recommendations = getNextWordRecommendations({
      cells,
      queue: [{ label: 'Ich', role: 'person' }],
      context: {
        childAge: null,
        lastSentence: null,
        lastSentenceAt: null,
        now: new Date('2025-01-10T08:10:00'),
      },
      maxRecommendations: 2,
    });

    expect(recommendations[0]?.label).toBe('Essen');
    expect(recommendations).toHaveLength(2);
  });
});
