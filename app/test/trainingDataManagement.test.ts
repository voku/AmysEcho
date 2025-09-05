import { createMockDb } from './utils/mockDb';

const mockTrainingData: any[] = [];

jest.mock('../db', () => {
  const { createMockDb } = require('./utils/mockDb');
  const database = createMockDb({ gesture_training_data: mockTrainingData });
  return { database };
});

import { addTrainingSample, getTrainingSamples, clearTrainingSamples } from '../src/services/trainingDataService';

describe('Training Data Management - Colors and Food', () => {
  beforeEach(() => {
    mockTrainingData.length = 0; // Clear the array
  });

  describe('Adding Training Samples', () => {
    it('adds red gesture training sample', async () => {
      const redLandmarks = [
        [0.5, 0.5, -0.05], [0.45, 0.55, -0.04], [0.4, 0.6, -0.03], [0.35, 0.65, -0.02], [0.3, 0.7, -0.01],
        [0.4, 0.4, -0.06], [0.35, 0.45, -0.05], [0.3, 0.5, -0.04], [0.25, 0.55, -0.03],
        [0.45, 0.35, -0.07], [0.4, 0.4, -0.06], [0.35, 0.45, -0.05], [0.3, 0.5, -0.04],
        [0.5, 0.3, -0.08], [0.45, 0.35, -0.07], [0.4, 0.4, -0.06], [0.35, 0.45, -0.05],
        [0.55, 0.3, -0.09], [0.5, 0.35, -0.08], [0.45, 0.4, -0.07], [0.4, 0.45, -0.06],
        [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
        [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]
      ];

      await addTrainingSample('red', redLandmarks);

      const samples = await getTrainingSamples('red');
      expect(samples).toHaveLength(1);
      expect(samples[0].gestureDefinitionId).toBe('red');
      expect(samples[0].landmarkData).toEqual(redLandmarks);
    });

    it('adds multiple samples for the same gesture', async () => {
      const landmarks1 = [[0.5, 0.5, -0.05], [0.45, 0.55, -0.04]];
      const landmarks2 = [[0.51, 0.5, -0.05], [0.46, 0.55, -0.04]];

      await addTrainingSample('blue', landmarks1);
      await addTrainingSample('blue', landmarks2);

      const samples = await getTrainingSamples('blue');
      expect(samples).toHaveLength(2);
      expect(samples[0].landmarkData).toEqual(landmarks1);
      expect(samples[1].landmarkData).toEqual(landmarks2);
    });

    it('adds food gesture training samples', async () => {
      const appleLandmarks = [
        [0.52, 0.5, -0.05], [0.47, 0.55, -0.04], [0.42, 0.6, -0.03], [0.37, 0.65, -0.02], [0.32, 0.7, -0.01],
        [0.42, 0.4, -0.06], [0.37, 0.45, -0.05], [0.32, 0.5, -0.04], [0.27, 0.55, -0.03],
        [0.47, 0.35, -0.07], [0.42, 0.4, -0.06], [0.37, 0.45, -0.05], [0.32, 0.5, -0.04],
        [0.52, 0.3, -0.08], [0.47, 0.35, -0.07], [0.42, 0.4, -0.06], [0.37, 0.45, -0.05],
        [0.57, 0.3, -0.09], [0.52, 0.35, -0.08], [0.47, 0.4, -0.07], [0.42, 0.45, -0.06],
        [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
        [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]
      ];

      await addTrainingSample('apple', appleLandmarks);

      const samples = await getTrainingSamples('apple');
      expect(samples).toHaveLength(1);
      expect(samples[0].gestureDefinitionId).toBe('apple');
    });
  });

  describe('Retrieving Training Samples', () => {
    beforeEach(async () => {
      await addTrainingSample('red', [[0.5, 0.5, -0.05]]);
      await addTrainingSample('blue', [[0.51, 0.5, -0.05]]);
      await addTrainingSample('red', [[0.52, 0.5, -0.05]]);
    });

    it('retrieves samples for specific gesture', async () => {
      const redSamples = await getTrainingSamples('red');
      expect(redSamples).toHaveLength(2);
      redSamples.forEach(sample => {
        expect(sample.gestureDefinitionId).toBe('red');
      });
    });

    it('returns empty array for gesture with no samples', async () => {
      const greenSamples = await getTrainingSamples('green');
      expect(greenSamples).toEqual([]);
    });

    it('retrieves all samples when no gesture specified', async () => {
      const allSamples = await getTrainingSamples();
      expect(allSamples).toHaveLength(3);
      const gestureIds = allSamples.map(s => s.gestureDefinitionId);
      expect(gestureIds).toContain('red');
      expect(gestureIds).toContain('blue');
    });
  });

  describe('Sample Validation', () => {
    it('validates landmark data format', async () => {
      const validLandmarks = Array(42).fill([0, 0, 0]);
      await expect(addTrainingSample('test', validLandmarks)).resolves.not.toThrow();
    });

    it('rejects invalid landmark data', async () => {
      const invalidLandmarks = 'invalid';
      await expect(addTrainingSample('test', invalidLandmarks as any)).rejects.toThrow();
    });

    it('rejects empty landmark data', async () => {
      await expect(addTrainingSample('test', [])).rejects.toThrow();
    });

    it('validates gesture ID', async () => {
      const landmarks = [[0, 0, 0]];
      await expect(addTrainingSample('', landmarks)).rejects.toThrow();
      await expect(addTrainingSample('   ', landmarks)).rejects.toThrow();
    });
  });

  describe('Data Management', () => {
    beforeEach(async () => {
      await addTrainingSample('red', [[0.5, 0.5, -0.05]]);
      await addTrainingSample('blue', [[0.51, 0.5, -0.05]]);
    });

    it('clears all training samples', async () => {
      await clearTrainingSamples();
      const allSamples = await getTrainingSamples();
      expect(allSamples).toHaveLength(0);
    });

    it('clears samples for specific gesture', async () => {
      await clearTrainingSamples('red');
      const redSamples = await getTrainingSamples('red');
      const blueSamples = await getTrainingSamples('blue');

      expect(redSamples).toHaveLength(0);
      expect(blueSamples).toHaveLength(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('handles large number of samples efficiently', async () => {
      const startTime = Date.now();

      // Add 100 samples
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(addTrainingSample('performance_test', [[i * 0.01, 0.5, -0.05]]));
      }
      await Promise.all(promises);

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second

      const samples = await getTrainingSamples('performance_test');
      expect(samples).toHaveLength(100);
    });

    it('maintains data integrity with concurrent operations', async () => {
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(addTrainingSample('concurrent_test', [[i * 0.01, 0.5, -0.05]]));
      }

      await Promise.all(promises);
      const samples = await getTrainingSamples('concurrent_test');
      expect(samples).toHaveLength(50);

      // Verify all samples are unique
      const landmarkStrings = samples.map(s => JSON.stringify(s.landmarkData));
      const uniqueLandmarks = new Set(landmarkStrings);
      expect(uniqueLandmarks.size).toBe(50);
    });
  });

  describe('Amy-Specific Requirements', () => {
    it('supports all Amy vocabulary gestures', async () => {
      const amyGestures = ['red', 'blue', 'green', 'yellow', 'apple', 'banana', 'bread', 'milk'];

      for (const gesture of amyGestures) {
        await addTrainingSample(gesture, [[0.5, 0.5, -0.05]]);
      }

      for (const gesture of amyGestures) {
        const samples = await getTrainingSamples(gesture);
        expect(samples).toHaveLength(1);
        expect(samples[0].gestureDefinitionId).toBe(gesture);
      }
    });

    it('handles age-appropriate gesture complexity', async () => {
      // Simple gestures for 4-year-old Amy
      const simpleLandmarks = [
        [0.5, 0.5, -0.05], [0.45, 0.55, -0.04], [0.4, 0.6, -0.03],
        [0.35, 0.65, -0.02], [0.3, 0.7, -0.01]
      ];

      await addTrainingSample('simple_gesture', simpleLandmarks);

      const samples = await getTrainingSamples('simple_gesture');
      expect(samples[0].landmarkData).toHaveLength(5);
    });
  });
});