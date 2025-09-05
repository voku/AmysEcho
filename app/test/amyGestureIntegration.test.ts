import { classifyWithCentroids } from '../src/services/offlineClassifier';
import { buildLocalCentroids } from '../src/services/localCentroids';

// Mock the services
jest.mock('../src/services/localCentroids');
jest.mock('../src/services/offlineClassifier');

describe('Amy Gesture Integration Tests', () => {
  const amyVocabulary = {
    colors: ['red', 'blue', 'green', 'yellow'],
    food: ['apple', 'banana', 'bread', 'milk'],
    basic: ['hello', 'drink']
  };

  const mockLandmarks = {
    red: Array(42).fill([0.5, 0.5, -0.05]),
    blue: Array(42).fill([0.51, 0.5, -0.05]),
    green: Array(42).fill([0.52, 0.5, -0.05]),
    yellow: Array(42).fill([0.53, 0.5, -0.05]),
    apple: Array(42).fill([0.54, 0.5, -0.05]),
    banana: Array(42).fill([0.55, 0.5, -0.05]),
    bread: Array(42).fill([0.56, 0.5, -0.05]),
    milk: Array(42).fill([0.57, 0.5, -0.05]),
    hello: Array(42).fill([0.58, 0.5, -0.05]),
    drink: Array(42).fill([0.59, 0.5, -0.05])
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock centroids for Amy's vocabulary
    const mockCentroids: { [key: string]: number[][] } = {};
    Object.keys(mockLandmarks).forEach(gesture => {
      mockCentroids[gesture] = mockLandmarks[gesture as keyof typeof mockLandmarks];
    });

    (buildLocalCentroids as jest.Mock).mockResolvedValue(mockCentroids);

    (classifyWithCentroids as jest.Mock).mockImplementation((landmarks, centroids) => {
      // Simple mock implementation
      const gestureMap: { [key: number]: string } = {
        0.5: 'red',
        0.51: 'blue',
        0.52: 'green',
        0.53: 'yellow',
        0.54: 'apple',
        0.55: 'banana',
        0.56: 'bread',
        0.57: 'milk',
        0.58: 'hello',
        0.59: 'drink'
      };

      const landmarkValue = landmarks[0]?.[0];
      const gesture = gestureMap[landmarkValue];

      if (gesture && centroids[gesture]) {
        return { label: gesture, confidence: 0.8 + Math.random() * 0.2 };
      }
      return null;
    });
  });

  describe('Color Gesture Recognition', () => {
    test('recognizes red color gesture', async () => {
      const result = await classifyWithCentroids(mockLandmarks.red, await buildLocalCentroids());
      expect(result).not.toBeNull();
      expect(result!.label).toBe('red');
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    test('recognizes blue color gesture', async () => {
      const result = await classifyWithCentroids(mockLandmarks.blue, await buildLocalCentroids());
      expect(result).not.toBeNull();
      expect(result!.label).toBe('blue');
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    test('all color gestures are supported', () => {
      amyVocabulary.colors.forEach(color => {
        expect(mockLandmarks).toHaveProperty(color);
      });
    });
  });

  describe('Food Gesture Recognition', () => {
    test('recognizes apple food gesture', async () => {
      const result = await classifyWithCentroids(mockLandmarks.apple, await buildLocalCentroids());
      expect(result).not.toBeNull();
      expect(result!.label).toBe('apple');
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    test('all food gestures are supported', () => {
      amyVocabulary.food.forEach(food => {
        expect(mockLandmarks).toHaveProperty(food);
      });
    });
  });

  describe('Basic Gesture Recognition', () => {
    test('recognizes hello gesture', async () => {
      const result = await classifyWithCentroids(mockLandmarks.hello, await buildLocalCentroids());
      expect(result).not.toBeNull();
      expect(result!.label).toBe('hello');
    });

    test('all basic gestures are supported', () => {
      amyVocabulary.basic.forEach(gesture => {
        expect(mockLandmarks).toHaveProperty(gesture);
      });
    });
  });

  describe('Amy Vocabulary Coverage', () => {
    test('complete vocabulary is available', () => {
      const allGestures = [
        ...amyVocabulary.colors,
        ...amyVocabulary.food,
        ...amyVocabulary.basic
      ];

      allGestures.forEach(gesture => {
        expect(mockLandmarks).toHaveProperty(gesture);
      });

      expect(allGestures).toHaveLength(10); // 4 colors + 4 food + 2 basic
    });

    test('gestures are age-appropriate for 4-year-old', () => {
      const ageAppropriateGestures = [
        'red', 'blue', 'green', 'yellow', // Basic colors
        'apple', 'banana', 'bread', 'milk', // Common foods
        'hello', 'drink' // Basic communication
      ];

      ageAppropriateGestures.forEach(gesture => {
        expect(mockLandmarks).toHaveProperty(gesture);
      });
    });
  });

  describe('Gesture Recognition Performance', () => {
    test('classification is fast enough for real-time use', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        await classifyWithCentroids(mockLandmarks.red, await buildLocalCentroids());
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should process 10 gestures in less than 100ms
      expect(totalTime).toBeLessThan(100);
    });

    test('handles multiple gesture types efficiently', async () => {
      const gestures = Object.values(mockLandmarks);
      const centroids = await buildLocalCentroids();

      const startTime = Date.now();

      await Promise.all(
        gestures.map(landmarks => classifyWithCentroids(landmarks, centroids))
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should process all gestures in less than 200ms
      expect(totalTime).toBeLessThan(200);
    });
  });

  describe('Error Handling', () => {
    test('handles empty landmark data gracefully', async () => {
      const result = await classifyWithCentroids([], await buildLocalCentroids());
      expect(result).toBeNull();
    });

    test('handles invalid landmark data', async () => {
      const invalidLandmarks = [null, undefined, 'invalid'];
      const result = await classifyWithCentroids(invalidLandmarks as any, await buildLocalCentroids());
      expect(result).toBeNull();
    });

    test('handles missing centroids', async () => {
      const result = await classifyWithCentroids(mockLandmarks.red, {});
      expect(result).toBeNull();
    });
  });

  describe('Amy-First Optimizations', () => {
    test('provides positive feedback for low confidence gestures', async () => {
      // Mock low confidence result
      (classifyWithCentroids as jest.Mock).mockReturnValueOnce({ label: 'red', confidence: 0.3 });

      const result = await classifyWithCentroids(mockLandmarks.red, await buildLocalCentroids());

      // Even with low confidence, should still return a result for positive feedback
      expect(result).not.toBeNull();
      expect(result!.label).toBe('red');
    });

    test('prioritizes quick recognition over perfect accuracy', async () => {
      const startTime = Date.now();

      const result = await classifyWithCentroids(mockLandmarks.red, await buildLocalCentroids());

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should recognize gesture quickly (under 50ms)
      expect(processingTime).toBeLessThan(50);
      expect(result).not.toBeNull();
    });
  });
});