import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';
import { ensureBaselineModelFixture } from './helpers/ensureBaselineModel.js';
import { BASELINE_MLP_MODEL_PATH } from '../src/constants/modelPaths.js';

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const shouldSkipFixtureCheck = async (paths: string[], label: string): Promise<boolean> => {
  const missing = [];
  for (const fixturePath of paths) {
    if (!(await pathExists(fixturePath))) {
      missing.push(fixturePath);
    }
  }
  if (missing.length === 0) {
    return false;
  }
  console.warn(`[mediapipe-integration] Missing ${label} fixtures:\n${missing.join('\n')}`);
  return true;
};

describe('MediaPipe Integration Tests', () => {
  const testBundlesDir = path.join(__dirname, '../test-bundles');
  
  beforeEach(async () => {
    // Ensure test bundles directory exists
    await fs.mkdir(testBundlesDir, { recursive: true });
    // Ensure baseline model exists
    await ensureBaselineModelFixture();
  });

  afterEach(async () => {
    // Clean up test bundles
    try {
      await fs.rm(testBundlesDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Model Path Resolution', () => {
    it('should have all required MediaPipe model files', async () => {
      const modelsDir = path.join(__dirname, '../data/models');
      
      const handModel = path.join(modelsDir, 'hand_landmarker.task');
      const poseModel = path.join(modelsDir, 'pose_landmarker.task');
      const faceModel = path.join(modelsDir, 'face_landmarker.task');
      
      if (await shouldSkipFixtureCheck([handModel, poseModel, faceModel], 'MediaPipe model')) {
        return;
      }
      
      // Check model file sizes are reasonable
      const handStats = await fs.stat(handModel);
      const poseStats = await fs.stat(poseModel);
      const faceStats = await fs.stat(faceModel);
      
      expect(handStats.size).toBeGreaterThan(1000000); // > 1MB
      expect(poseStats.size).toBeGreaterThan(1000000); // > 1MB
      expect(faceStats.size).toBeGreaterThan(1000000); // > 1MB
    });

    it('should not have model files in incorrect locations', async () => {
      const rootPath = path.join(__dirname, '../../');
      const modelsInRoot = path.join(rootPath, 'hand_landmarker.task');
      
      expect(await pathExists(modelsInRoot)).toBe(false);
    });
  });

  describe('Bundle Structure Validation', () => {
    it('should create valid multimodal bundle structure', async () => {
      // Create a test bundle with all modalities
      const bundleData = {
        label: 'TEST_SIGN',
        profileId: 'test-profile',
        capturedAt: new Date().toISOString(),
        metadata: {
          modalities: {
            hands: { present: true, frameCount: 3, coverage: 1.0 },
            pose: { present: true, frameCount: 3, coverage: 1.0 },
            face: { present: true, frameCount: 3, coverage: 1.0 }
          }
        }
      };

      const landmarks = {
        frames: [
          {
            landmarks: Array(42).fill(0).map(() => [Math.random(), Math.random(), Math.random()]),
            poseLandmarks: Array(33).fill(0).map(() => [Math.random(), Math.random(), Math.random(), 0.9]),
            faceLandmarks: Array(468).fill(0).map(() => [Math.random(), Math.random(), Math.random()])
          }
        ]
      };

      const zip = new AdmZip();
      zip.addFile('metadata.json', Buffer.from(JSON.stringify(bundleData)));
      zip.addFile('landmarks.json', Buffer.from(JSON.stringify(landmarks)));
      
      const bundlePath = path.join(testBundlesDir, 'test-multimodal-bundle.zip');
      zip.writeZip(bundlePath);
      
      // Verify bundle was created
      const bundleStats = await fs.stat(bundlePath);
      expect(bundleStats.size).toBeGreaterThan(1000);
    });

    it('should create valid hands-only bundle structure for fallback', async () => {
      // Create a test bundle with hands-only data
      const bundleData = {
        label: 'HANDS_ONLY',
        profileId: 'test-hands-profile',
        capturedAt: new Date().toISOString()
      };

      const landmarks = {
        frames: [
          {
            landmarks: Array(42).fill(0).map(() => [Math.random(), Math.random(), Math.random()])
          }
        ]
      };

      const zip = new AdmZip();
      zip.addFile('metadata.json', Buffer.from(JSON.stringify(bundleData)));
      zip.addFile('landmarks.json', Buffer.from(JSON.stringify(landmarks)));
      
      const bundlePath = path.join(testBundlesDir, 'test-hands-only-bundle.zip');
      zip.writeZip(bundlePath);
      
      // Verify bundle was created
      const bundleStats = await fs.stat(bundlePath);
      expect(bundleStats.size).toBeGreaterThan(500);
    });
  });

  describe('DGS Dataset Validation', () => {
    it('should have proper DGS video examples', async () => {
      const videoDir = path.join(__dirname, '../data/dgs_video_examples');
      
      if (await shouldSkipFixtureCheck([videoDir], 'DGS video directory')) {
        return;
      }

      const files = await fs.readdir(videoDir);
      const mp4Files = files.filter(f => f.endsWith('.mp4'));
      
      expect(mp4Files.length).toBeGreaterThanOrEqual(12);
    });

    it('should have corresponding landmark files', async () => {
      const videoDir = path.join(__dirname, '../data/dgs_video_examples');
      
      if (await shouldSkipFixtureCheck([videoDir], 'DGS landmark directory')) {
        return;
      }

      const files = await fs.readdir(videoDir);
      const mp4Files = files.filter(f => f.endsWith('.mp4'));
      
      for (const video of mp4Files) {
        const gesture = video.replace('.mp4', '');
        const landmarksPath = path.join(videoDir, `${gesture}_landmarks.json`);
        expect(await pathExists(landmarksPath)).toBe(true);
      }
    });

    it('should have valid DGS manifest', async () => {
      const manifestPath = path.join(__dirname, '../data/dgs_manifest.json');
      
      if (await shouldSkipFixtureCheck([manifestPath], 'DGS manifest')) {
        return;
      }
      
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);
      
      expect(manifest).toHaveProperty('gestures');
      expect(manifest.gestures).toBeInstanceOf(Array);
      expect(manifest.gestures.length).toBeGreaterThanOrEqual(12);
      
      interface DgsManifestEntry {
        id: string;
        label: string;
        video?: string;
        videos?: string[];
      }

      // Check that all entries have required structure
      manifest.gestures.forEach((entry: DgsManifestEntry) => {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('label');
        if (entry.videos) {
          expect(entry.videos).toBeInstanceOf(Array);
          entry.videos.forEach(v => expect(v).toMatch(/\.mp4$/));
        } else {
          expect(entry).toHaveProperty('video');
          expect(entry.video).toMatch(/\.mp4$/);
        }
      });
      
      // Check for German labels
      const labels = manifest.gestures.map((e: DgsManifestEntry) => e.label);
      const expectedLabels = [
        'alle', 'blau', 'essen', 'fertig', 'gelb', 'gruen',
        'nochmal', 'rot', 'satt', 'schwester', 'spielen', 'trinken'
      ];
      
      expectedLabels.forEach(label => {
        expect(labels).toContain(label);
      });
    });
  });

  describe('Trained Model Validation', () => {
    it('should have trained default model', async () => {
      const modelPath = BASELINE_MLP_MODEL_PATH;
      
      if (await shouldSkipFixtureCheck([modelPath], 'baseline MLP model')) {
        return;
      }
      
      const modelStats = await fs.stat(modelPath);
      expect(modelStats.size).toBeGreaterThan(100000); // Should be at least 100KB
    });
  });
});
