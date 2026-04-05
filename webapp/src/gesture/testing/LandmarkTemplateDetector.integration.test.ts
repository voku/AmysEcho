import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LandmarkTemplateDetector, normalizeLandmarks, type LandmarkTemplate } from '../landmarkTemplateDetector';
import { splitHandsFromMultimodalFrame } from './fixtures/splitHandsFromMultimodalFrame';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '../../../..');
const LANDMARK_FILE = path.join(
  REPO_ROOT,
  'server/test/fixtures/dgs_video_examples/spielen_landmarks.json',
);

async function loadTwoHandFrames(): Promise<number[][][][]> {
  const payload = JSON.parse(await readFile(LANDMARK_FILE, 'utf8')) as { frames?: Array<{ landmarks?: number[][] }> };
  const frames = payload.frames ?? [];

  return frames
    .map((frame) => splitHandsFromMultimodalFrame(frame.landmarks ?? []))
    .filter((hands) => hands.length >= 2);
}

describe('LandmarkTemplateDetector integration (real DGS landmarks)', () => {
  it('matches a "both" template even when the better hand is the second visible hand', async () => {
    const twoHandFrames = await loadTwoHandFrames();
    expect(twoHandFrames.length).toBeGreaterThan(1);

    const templateFrame = twoHandFrames[0]!;
    const probeFrame = twoHandFrames[1]!;

    const template: LandmarkTemplate = {
      id: 'spielen-spielplatz-template',
      label: 'spielen',
      profileId: 'integration-profile',
      landmarks: normalizeLandmarks(templateFrame[1]! as [number, number, number][]),
      handedness: 'both',
      createdAt: '2026-03-05T00:00:00.000Z',
    };

    const detector = new LandmarkTemplateDetector();
    detector.setTemplates([template]);

    const match = detector.detect(probeFrame);

    expect(match).not.toBeNull();
    expect(match?.label).toBe('spielen');
    expect((match?.confidence ?? 0)).toBeGreaterThan(0.6);
  });
});
