import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GestureFixture } from './recordFixture';

const FIXTURE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(FIXTURE_DIRECTORY, '../../../../..');

function isFixtureFile(fileName: string): boolean {
  return fileName.endsWith('.json') && !fileName.startsWith('.');
}

function isPoint(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === 'number');
}

function isFrame(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.every((hand) => Array.isArray(hand) && hand.every(isPoint));
}

function isHandsFrame(frame: unknown): frame is { landmarks: number[][] } {
  return (
    !!frame &&
    typeof frame === 'object' &&
    Array.isArray((frame as { landmarks?: unknown }).landmarks) &&
    (frame as { landmarks: unknown[] }).landmarks.every(isPoint)
  );
}

function splitHandsFromMultimodalFrame(multimodalLandmarks: number[][]): number[][][] {
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

async function loadFramesFromServerLandmarks(relativeFilePath: string): Promise<number[][][][]> {
  const fullPath = path.resolve(REPO_ROOT, relativeFilePath);
  const payload = JSON.parse(await readFile(fullPath, 'utf8')) as unknown;

  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { frames?: unknown }).frames)) {
    return [];
  }

  const frames = (payload as { frames: unknown[] }).frames;
  return frames
    .filter(isHandsFrame)
    .map((frame) => splitHandsFromMultimodalFrame(frame.landmarks))
    .filter((hands) => hands.length > 0);
}

async function parseFixture(raw: unknown): Promise<GestureFixture | null> {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const sourceLandmarksFile = typeof data.sourceLandmarksFile === 'string' ? data.sourceLandmarksFile : undefined;

  let landmarks: number[][][][] = [];
  if (Array.isArray(data.landmarks) && data.landmarks.every(isFrame)) {
    landmarks = data.landmarks;
  } else if (sourceLandmarksFile) {
    landmarks = await loadFramesFromServerLandmarks(sourceLandmarksFile);
  }

  if (
    typeof data.gestureName !== 'string' ||
    (data.source !== 'camera' && data.source !== 'recorded') ||
    typeof data.expectedConfidence !== 'number' ||
    typeof data.capturedAt !== 'string' ||
    landmarks.length === 0
  ) {
    return null;
  }

  return {
    gestureName: data.gestureName,
    source: data.source,
    expectedConfidence: data.expectedConfidence,
    capturedAt: data.capturedAt,
    landmarks,
    ...(sourceLandmarksFile ? { sourceLandmarksFile } : {}),
  };
}

export async function loadGestureFixtures(): Promise<GestureFixture[]> {
  const entries = await readdir(FIXTURE_DIRECTORY, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isFixtureFile(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const fixtures: GestureFixture[] = [];

  for (const fileName of files) {
    const filePath = path.join(FIXTURE_DIRECTORY, fileName);
    const payload = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    const fixture = await parseFixture(payload);
    if (fixture) {
      fixtures.push(fixture);
    }
  }

  return fixtures;
}
