import { mlService } from '../src/services';

describe('MachineLearningService', () => {
  it('should load models successfully', async () => {
    // @ts-ignore
    const landmarkTflite: TfliteModel = {
      runSync: () => [[1, 2, 3]],
    };
    // @ts-ignore
    const gestureTflite: TfliteModel = {
      runSync: () => [[0.1, 0.9]],
    };
    await mlService.loadModels(landmarkTflite, gestureTflite);
    expect(mlService.isServiceReady()).toBe(true);
  });
});
