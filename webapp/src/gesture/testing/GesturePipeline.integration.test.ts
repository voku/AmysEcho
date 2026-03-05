import { beforeAll, describe, expect, it } from 'vitest';

import { GestureDetectionStep } from '../core/ProcessingSteps';
import { LandmarkTemplateDetector, normalizeLandmarks, type LandmarkTemplate } from '../landmarkTemplateDetector';
import type { GestureDetectorConfig } from '../config/GestureConfig';
import type { GestureFixture } from './fixtures/recordFixture';
import { loadGestureFixtures } from './fixtures/loadFixtures';

const config = {
  thresholds: { mlpConfidence: 0.4 },
} as unknown as GestureDetectorConfig;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function toTemplate(fixture: GestureFixture): LandmarkTemplate {
  const firstFrame = fixture.landmarks[0];
  const firstHand = firstFrame?.[0] ?? [];

  const handedness = firstFrame && firstFrame.length >= 2 ? 'both' : 'left';

  return {
    id: `fixture-${normalizeLabel(fixture.gestureName)}`,
    label: fixture.gestureName,
    profileId: 'integration-fixtures',
    landmarks: normalizeLandmarks(firstHand as [number, number, number][]),
    handedness,
    createdAt: fixture.capturedAt,
  };
}

async function runFullPipeline(step: GestureDetectionStep, fixture: GestureFixture) {
  let bestResult: Awaited<ReturnType<GestureDetectionStep['execute']>> | null = null;

  for (let index = 0; index < fixture.landmarks.length; index += 1) {
    const frame = fixture.landmarks[index] ?? [];
    const result = await step.execute({
      landmarks: frame,
      rawLandmarks: frame,
      timestamp: Date.now() + index,
      processingStep: 'integration_fixture',
      skipExpensiveSteps: false,
      rawResults: { gestures: [], landmarks: frame as never, handednesses: [] },
      normalizedResults: { hands: [], landmarks: [], handednesses: [] },
    } as any);

    if (!bestResult || result.confidence > bestResult.confidence) {
      bestResult = result;
    }
  }

  if (!bestResult) {
    throw new Error(`No frame result returned for fixture ${fixture.gestureName}`);
  }

  return bestResult;
}

function detectTemplateConfidence(template: LandmarkTemplate, frame: number[][][]): number {
  const detector = new LandmarkTemplateDetector();
  detector.setTemplates([template]);
  const match = detector.detect(frame);
  return match?.confidence ?? 0;
}

describe('GesturePipeline integration (fixture-based, no mocks)', () => {
  let fixtures: GestureFixture[] = [];

  beforeAll(async () => {
    fixtures = await loadGestureFixtures();
  });

  it('loads at least two recorded fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });

  it('recognizes each fixture gesture with configured confidence', async () => {
    for (const fixture of fixtures) {
      const detector = new LandmarkTemplateDetector();
      detector.setTemplates([toTemplate(fixture)]);
      const step = new GestureDetectionStep(config, detector);

      const result = await runFullPipeline(step, fixture);

      expect(result.gesture).toBe(normalizeLabel(fixture.gestureName));
      expect(result.confidence).toBeGreaterThanOrEqual(fixture.expectedConfidence);
      expect(result.metadata?.method).toBe('landmark_template');
    }
  });

  it('keeps satt/trinken template scores discriminative', () => {
    const sattFixture = fixtures.find((fixture) => normalizeLabel(fixture.gestureName) === 'satt');
    const trinkenFixture = fixtures.find((fixture) => normalizeLabel(fixture.gestureName) === 'trinken');

    expect(sattFixture).toBeDefined();
    expect(trinkenFixture).toBeDefined();

    if (!sattFixture || !trinkenFixture) {
      throw new Error('Required satt/trinken fixtures are missing');
    }

    const sattTemplate = toTemplate(sattFixture);
    const trinkenTemplate = toTemplate(trinkenFixture);

    const sattFrame = sattFixture.landmarks[0] ?? [];
    const sattScore = detectTemplateConfidence(sattTemplate, sattFrame);
    const trinkenScoreOnSatt = detectTemplateConfidence(trinkenTemplate, sattFrame);

    expect(sattScore - trinkenScoreOnSatt).toBeGreaterThan(0.3);
  });
});
