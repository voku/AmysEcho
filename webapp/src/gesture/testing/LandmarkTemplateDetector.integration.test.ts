import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LandmarkTemplateDetector, normalizeLandmarks, type LandmarkTemplate } from '../landmarkTemplateDetector';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '../../../..');
const LANDMARK_FILE = path.join(
  REPO_ROOT,
  'server/data/dgs_video_examples/spielen_main_spielplatz_landmarks.json',
);

function splitHands(multimodalLandmarks: number[][]): number[][][] {
  const handPoints = multimodalLandmarks.slice(0, 42);
  const leftHand = handPoints.slice(0, 21);
  const rightHand = handPoints.slice(21, 42);

  const hasLeft = leftHand.some((point) => point.some((value) => value !== 0));
  const hasRight = rightHand.some((point) => point.some((value) => value !== 0));

  const hands: number[][][] = [];
  if (hasLeft) hands.push(leftHand);
  if (hasRight) hands.push(rightHand);
  return hands;
}

async function loadTwoHandFrames(): Promise<number[][][][]> {
  const payload = JSON.parse(await readFile(LANDMARK_FILE, 'utf8')) as { frames?: Array<{ landmarks?: number[][] }> };
  const frames = payload.frames ?? [];

  return frames
    .map((frame) => splitHands(frame.landmarks ?? []))
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
