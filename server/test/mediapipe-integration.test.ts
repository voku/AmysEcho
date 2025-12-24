import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';

describe('MediaPipe Integration Tests', () => {
  const testBundlesDir = path.join(__dirname, '../test-bundles');
  
  beforeEach(async () => {
    // Ensure test bundles directory exists
    await fs.mkdir(testBundlesDir, { recursive: true });
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
      
      expect(await fs.access(handModel).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(poseModel).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(faceModel).then(() => true).catch(() => false)).toBe(true);
      
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
      
      expect(await fs.access(modelsInRoot).then(() => true).catch(() => false)).toBe(false);
    });
  });

  describe('Bundle Validation', () => {
    it('should accept bundles with proper multimodal data', async () => {
      // Create a test bundle with all modalities
      const bundleData = {
        label: 'TEST_GESTURE',
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
      zip.addFile('metadata.json', JSON.stringify(bundleData));
      zip.addFile('landmarks.json', JSON.stringify(landmarks));
      
      const bundlePath = path.join(testBundlesDir, 'test-multimodal-bundle.zip');
      zip.writeZip(bundlePath);
      
      // Verify bundle was created
      const bundleStats = await fs.stat(bundlePath);
      expect(bundleStats.size).toBeGreaterThan(1000);
    });

    it('should accept hands-only bundles for fallback', async () => {
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
      zip.addFile('metadata.json', JSON.stringify(bundleData));
      zip.addFile('landmarks.json', JSON.stringify(landmarks));
      
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
      
      // Check that all expected video files exist
      const expectedVideos = [
        'alle.mp4', 'blau.mp4', 'essen.mp4', 'fertig.mp4',
        'gelb.mp4', 'gruen.mp4', 'nochmal.mp4', 'rot.mp4',
        'satt.mp4', 'schwester.mp4', 'spielen.mp4', 'trinken.mp4'
      ];

      for (const video of expectedVideos) {
        const videoPath = path.join(videoDir, video);
        expect(await fs.access(videoPath).then(() => true).catch(() => false)).toBe(true);
      }
    });

    it('should have corresponding landmark files', async () => {
      const videoDir = path.join(__dirname, '../data/dgs_video_examples');
      
      // Check that all landmark files exist
      const expectedLandmarks = [
        'alle_landmarks.json', 'blau_landmarks.json', 'essen_landmarks.json', 'fertig_landmarks.json',
        'gelb_landmarks.json', 'gruen_landmarks.json', 'nochmal_landmarks.json', 'rot_landmarks.json',
        'satt_landmarks.json', 'schwester_landmarks.json', 'spielen_landmarks.json', 'trinken_landmarks.json'
      ];

      for (const landmarks of expectedLandmarks) {
        const landmarksPath = path.join(videoDir, landmarks);
        expect(await fs.access(landmarksPath).then(() => true).catch(() => false)).toBe(true);
      }
    });

    it('should have valid DGS manifest', async () => {
      const manifestPath = path.join(__dirname, '../data/dgs_manifest.json');
      
      expect(await fs.access(manifestPath).then(() => true).catch(() => false)).toBe(true);
      
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);
      
      expect(manifest).toHaveProperty('entries');
      expect(manifest.entries).toBeInstanceOf(Array);
      expect(manifest.entries).toHaveLength(12);
      
      // Check that all entries have required structure
      manifest.entries.forEach((entry: any) => {
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('storage');
        expect(entry).toHaveProperty('metadata');
        
        expect(entry.storage).toHaveProperty('type');
        expect(entry.storage.type).toBe('file');
        expect(entry.storage).toHaveProperty('clip');
        
        expect(entry.metadata).toHaveProperty('clipFilename');
        expect(entry.metadata).toHaveProperty('profileId');
        expect(entry.metadata.profileId).toBe('global');
      });
      
      // Check for German labels
      const labels = manifest.entries.map((e: any) => e.label);
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
      const modelPath = path.join(__dirname, '../data/models/global/amy_model.npz');
      
      expect(await fs.access(modelPath).then(() => true).catch(() => false)).toBe(true);
      
      const modelStats = await fs.stat(modelPath);
      expect(modelStats.size).toBeGreaterThan(100000); // Should be at least 100KB
    });
  });
});