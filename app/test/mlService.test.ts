import { mlService } from '../src/services/mlService';

(async () => {
  // @ts-ignore
  const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
  // @ts-ignore
  const gestureTflite: any = { runSync: () => [[0.1, 0.9]] };
  await mlService.loadModels(landmarkTflite, gestureTflite);
  if (!mlService.isServiceReady()) {
    throw new Error('mlService did not initialize');
  }
  console.log('mlService ready');
})();
