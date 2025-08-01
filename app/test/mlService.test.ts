const Module = require('module');

const origLoad = (Module as any)._load;
(Module as any)._load = (req: string, parent: any, isMain: boolean) => {
  if (req === 'react-native-fast-tflite') {
    return {
      TensorflowModel: class { runSync() { return [[0]]; } },
      loadTensorflowModel: async () => ({ runSync: () => [[0]] }),
    };
  }
  if (req === 'react-native-worklets-core') {
    return { runOnJS: (fn: any) => fn };
  }
  if (req === 'expo-file-system') {
    return { downloadAsync: async () => ({ uri: 'test' }), documentDirectory: '/tmp/' };
  }
  if (req === 'react') {
    return { useCallback: (fn: any) => fn, useRef: (v: any) => ({ current: v }) };
  }
  if (req === 'react-native-vision-camera') {
    return { useFrameProcessor: () => {} };
  }
  if (req === 'react-native-reanimated') {
    return { useSharedValue: () => ({ value: 0 }) };
  }
  if (req.startsWith('../../db')) {
    return { database: { write: async () => {}, get: () => ({ create: () => {}, query: () => ({ fetch: async () => [] }) }) }, InteractionLog: class {} };
  }
  return origLoad(req, parent, isMain);
};

const { mlService } = require('../src/services/mlService');

(async () => {
  // @ts-ignore
  const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
  // @ts-ignore
  const gestureTflite: any = { runSync: () => [[0.1, 0.9]] };
  await mlService.loadModels(landmarkTflite, gestureTflite, []);
  if (!mlService.isServiceReady()) {
    throw new Error('mlService did not initialize');
  }
  console.log('mlService ready');
  (Module as any)._load = origLoad;
})();
