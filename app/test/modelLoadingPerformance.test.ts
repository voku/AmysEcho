import { promises as fs } from 'fs';
import path from 'path';

describe('model loading performance', () => {
  const models = ['gesture_classifier.tflite', 'hand_landmarker.tflite'];

  models.forEach((modelFile) => {
    it(`loads ${modelFile} under 100ms`, async () => {
      const modelPath = path.resolve(__dirname, '../assets/models', modelFile);
      const start = Date.now();
      await fs.readFile(modelPath);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  it('loads gesture model through bundler', () => {
    expect(() => require('../assets/models/gesture_classifier.tflite')).not.toThrow();
  });

  it('loads task file through bundler', () => {
    expect(() => require('../assets/models/dummy.task')).not.toThrow();
  });
});
