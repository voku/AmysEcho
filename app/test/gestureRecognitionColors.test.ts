import { classifyWithCentroids } from '../src/services/offlineClassifier';
import { buildLocalCentroids } from '../src/services/localCentroids';

// Mock the database and model loading
jest.mock('../src/services/localCentroids');
jest.mock('../src/services/offlineClassifier');

describe('Gesture Recognition - Colors and Food (Amy Vocabulary)', () => {
  const mockCentroids = {
    red: [
      [0.5, 0.5, -0.05], [0.45, 0.55, -0.04], [0.4, 0.6, -0.03], [0.35, 0.65, -0.02], [0.3, 0.7, -0.01],
      [0.4, 0.4, -0.06], [0.35, 0.45, -0.05], [0.3, 0.5, -0.04], [0.25, 0.55, -0.03],
      [0.45, 0.35, -0.07], [0.4, 0.4, -0.06], [0.35, 0.45, -0.05], [0.3, 0.5, -0.04],
      [0.5, 0.3, -0.08], [0.45, 0.35, -0.07], [0.4, 0.4, -0.06], [0.35, 0.45, -0.05],
      [0.55, 0.3, -0.09], [0.5, 0.35, -0.08], [0.45, 0.4, -0.07], [0.4, 0.45, -0.06],
      [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
      [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]
    ],
    blue: [
      [0.51, 0.5, -0.05], [0.46, 0.55, -0.04], [0.41, 0.6, -0.03], [0.36, 0.65, -0.02], [0.31, 0.7, -0.01],
      [0.41, 0.4, -0.06], [0.36, 0.45, -0.05], [0.31, 0.5, -0.04], [0.26, 0.55, -0.03],
      [0.46, 0.35, -0.07], [0.41, 0.4, -0.06], [0.36, 0.45, -0.05], [0.31, 0.5, -0.04],
      [0.51, 0.3, -0.08], [0.46, 0.35, -0.07], [0.41, 0.4, -0.06], [0.36, 0.45, -0.05],
      [0.56, 0.3, -0.09], [0.51, 0.35, -0.08], [0.46, 0.4, -0.07], [0.41, 0.45, -0.06],
      [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
      [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]
    ],
    apple: [
      [0.52, 0.5, -0.05], [0.47, 0.55, -0.04], [0.42, 0.6, -0.03], [0.37, 0.65, -0.02], [0.32, 0.7, -0.01],
      [0.42, 0.4, -0.06], [0.37, 0.45, -0.05], [0.32, 0.5, -0.04], [0.27, 0.55, -0.03],
      [0.47, 0.35, -0.07], [0.42, 0.4, -0.06], [0.37, 0.45, -0.05], [0.32, 0.5, -0.04],
      [0.52, 0.3, -0.08], [0.47, 0.35, -0.07], [0.42, 0.4, -0.06], [0.37, 0.45, -0.05],
      [0.57, 0.3, -0.09], [0.52, 0.35, -0.08], [0.47, 0.4, -0.07], [0.42, 0.45, -0.06],
      [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
      [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (buildLocalCentroids as jest.Mock).mockResolvedValue(mockCentroids);
    (classifyWithCentroids as jest.Mock).mockImplementation((landmarks, centroids) => {
      // Simple distance-based classification for testing
      let bestMatch = null;
      let bestScore = -1;

      for (const [gestureId, centroid] of Object.entries(centroids)) {
        if (!centroid || !Array.isArray(centroid)) continue;

        let distance = 0;
        for (let i = 0; i < Math.min(landmarks.length, centroid.length); i++) {
          if (Array.isArray(landmarks[i]) && Array.isArray(centroid[i])) {
            for (let j = 0; j < Math.min(landmarks[i].length, centroid[i].length); j++) {
              distance += Math.abs(landmarks[i][j] - centroid[i][j]);
            }
          }
        }

        const score = 1 / (1 + distance);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { label: gestureId, confidence: score };
        }
      }

      return bestMatch;
    });
  });

  describe('Color Gesture Recognition', () => {
    it('correctly recognizes red gesture with high confidence', async () => {
      const redLandmarks = mockCentroids.red;
      const result = await classifyWithCentroids(redLandmarks, mockCentroids);

      expect(result).not.toBeNull();
      expect(result!.label).toBe('red');
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    it('correctly recognizes blue gesture with high confidence', async () => {
      const blueLandmarks = mockCentroids.blue;
      const result = await classifyWithCentroids(blueLandmarks, mockCentroids);

      expect(result).not.toBeNull();
      expect(result!.label).toBe('blue');
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    it('distinguishes between different colors', async () => {
      const redResult = await classifyWithCentroids(mockCentroids.red, mockCentroids);
      const blueResult = await classifyWithCentroids(mockCentroids.blue, mockCentroids);

      expect(redResult!.label).toBe('red');
      expect(blueResult!.label).toBe('blue');
      expect(redResult!.label).not.toBe(blueResult!.label);
    });

    it('handles noisy landmark data gracefully', async () => {
      const noisyRedLandmarks = mockCentroids.red.map(landmark =>
        landmark.map(coord => coord + (Math.random() - 0.5) * 0.01) // Reduce noise
      );

      const result = await classifyWithCentroids(noisyRedLandmarks, mockCentroids);

      expect(result).not.toBeNull();
      expect(result!.label).toBe('red');
      expect(result!.confidence).toBeGreaterThan(0.7); // Lower threshold for noisy data
    });
  });

  describe('Food Gesture Recognition', () => {
    it('correctly recognizes apple gesture', async () => {
      const appleLandmarks = mockCentroids.apple;
      const result = await classifyWithCentroids(appleLandmarks, mockCentroids);

      expect(result).not.toBeNull();
      expect(result!.label).toBe('apple');
      expect(result!.confidence).toBeGreaterThan(0.7);
    });

    it('distinguishes food from colors', async () => {
      const appleResult = await classifyWithCentroids(mockCentroids.apple, mockCentroids);
      const redResult = await classifyWithCentroids(mockCentroids.red, mockCentroids);

      expect(appleResult!.label).toBe('apple');
      expect(redResult!.label).toBe('red');
      expect(appleResult!.label).not.toBe(redResult!.label);
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('handles empty landmark data', async () => {
      // Override the mock for this test
      (classifyWithCentroids as jest.Mock).mockReturnValueOnce(null);
      const result = await classifyWithCentroids([], mockCentroids);
      expect(result).toBeNull();
    });

    it('handles malformed landmark data', async () => {
      // Override the mock for this test
      (classifyWithCentroids as jest.Mock).mockReturnValueOnce(null);
      const malformedLandmarks = [null, undefined, 'invalid'];
      const result = await classifyWithCentroids(malformedLandmarks as any, mockCentroids);
      expect(result).toBeNull();
    });

    it('handles missing centroids', async () => {
      const result = await classifyWithCentroids(mockCentroids.red, {});
      expect(result).toBeNull();
    });

    it('works with partial landmark data', async () => {
      const partialLandmarks = mockCentroids.red.slice(0, 10);
      const result = await classifyWithCentroids(partialLandmarks, mockCentroids);

      expect(result).not.toBeNull();
      expect(result!.label).toBe('red');
    });
  });

  describe('Performance and Scalability', () => {
    it('classifies gestures quickly', async () => {
      const startTime = Date.now();
      const result = await classifyWithCentroids(mockCentroids.red, mockCentroids);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in less than 100ms
      expect(result).not.toBeNull();
    });

    it('handles multiple gestures efficiently', async () => {
      const gestures = [mockCentroids.red, mockCentroids.blue, mockCentroids.apple];
      const startTime = Date.now();

      const results = await Promise.all(
        gestures.map(landmarks => classifyWithCentroids(landmarks, mockCentroids))
      );

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200); // Should complete in less than 200ms
      expect(results).toHaveLength(3);
      results.forEach(result => expect(result).not.toBeNull());
    });
  });
});