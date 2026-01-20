import { describe, expect, it } from 'vitest';
import { extractNonManualFeatures } from '../nonManualFeatures';

describe('extractNonManualFeatures', () => {
  it('returns null when no pose or face landmarks are available', () => {
    expect(extractNonManualFeatures()).toBeNull();
    expect(extractNonManualFeatures([], [])).toBeNull();
  });

  it('derives head metrics from pose landmarks', () => {
    const pose = Array.from({ length: 33 }, () => [0, 0, 0, 1]);
    pose[0] = [0.7, 0.4, 0.0, 1]; // nose
    pose[11] = [0.4, 0.5, 0.0, 1]; // left shoulder
    pose[12] = [0.8, 0.5, 0.0, 1]; // right shoulder

    const result = extractNonManualFeatures(pose, undefined);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.source).toBe('pose');
    expect(result.headYaw).toBeCloseTo(0.25, 4);
    expect(result.headPitch).toBeCloseTo(-0.25, 4);
    expect(result.mouthOpenness).toBeNull();
  });

  it('derives mouth openness and eyebrow raise from face landmarks', () => {
    const face = Array.from({ length: 468 }, () => [0, 0, 0]);
    face[1] = [0.5, 0.5, 0.0]; // nose tip
    face[33] = [0.4, 0.5, 0.0]; // left eye
    face[263] = [0.6, 0.5, 0.0]; // right eye
    face[13] = [0.5, 0.54, 0.0]; // upper lip
    face[14] = [0.5, 0.58, 0.0]; // lower lip
    face[159] = [0.4, 0.48, 0.0]; // left eye upper
    face[386] = [0.6, 0.48, 0.0]; // right eye upper
    face[105] = [0.4, 0.42, 0.0]; // left eyebrow
    face[334] = [0.6, 0.42, 0.0]; // right eyebrow

    const result = extractNonManualFeatures(undefined, face);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.source).toBe('face');
    expect(result.mouthOpenness).toBeCloseTo(0.2, 2);
    expect(result.eyebrowRaiseLeft).toBeGreaterThan(0);
    expect(result.eyebrowRaiseRight).toBeGreaterThan(0);
  });

  it('prefers face-derived head metrics when both sources are present', () => {
    const pose = Array.from({ length: 33 }, () => [0, 0, 0, 1]);
    pose[0] = [0.6, 0.5, 0.0, 1];
    pose[11] = [0.4, 0.5, 0.0, 1];
    pose[12] = [0.8, 0.5, 0.0, 1];

    const face = Array.from({ length: 468 }, () => [0, 0, 0]);
    face[1] = [0.5, 0.5, 0.0];
    face[33] = [0.4, 0.5, 0.0];
    face[263] = [0.6, 0.5, 0.0];

    const result = extractNonManualFeatures(pose, face);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.source).toBe('mixed');
    expect(result.headYaw).toBeCloseTo(0, 4);
  });
});
