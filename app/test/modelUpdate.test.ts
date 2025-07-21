const Module = require('module');

(async () => {
  let saved = '';
  const orig = (Module as any)._load;
  (Module as any)._load = (req: string, parent: any, isMain: boolean) => {
    if (req === 'expo-file-system') {
      return {
        documentDirectory: '/tmp/',
        downloadAsync: async (_url: string, dest: string) => ({ uri: dest }),
      };
    }
    if (req === '@react-native-community/netinfo') {
      return { fetch: async () => ({ isConnected: true, type: 'wifi' }) };
    }
    if (req.includes('../storage')) {
      return {
        loadBackendApiToken: async () => 'token',
        saveCustomModelUri: async (uri: string) => { saved = uri; },
      };
    }
    return orig(req, parent, isMain);
  };

  delete require.cache[require.resolve('../src/services/modelUpdate')];
  const { checkForModelUpdate } = require('../src/services/modelUpdate');
  (Module as any)._load = orig;

  const result = await checkForModelUpdate();
  if (!result || saved !== '/tmp/custom_model.tflite') {
    throw new Error('model update should succeed');
  }
  console.log('model update success');
})();

(async () => {
  const orig = (Module as any)._load;
  let called = false;
  (Module as any)._load = (req: string, parent: any, isMain: boolean) => {
    if (req === 'expo-file-system') {
      return {
        documentDirectory: '/tmp/',
        downloadAsync: async () => { called = true; return { uri: '/tmp/f' }; },
      };
    }
    if (req === '@react-native-community/netinfo') {
      return { fetch: async () => ({ isConnected: true, type: 'cellular' }) };
    }
    if (req.includes('../storage')) {
      return {
        loadBackendApiToken: async () => 'token',
        saveCustomModelUri: async () => {},
      };
    }
    return orig(req, parent, isMain);
  };

  delete require.cache[require.resolve('../src/services/modelUpdate')];
  const { checkForModelUpdate } = require('../src/services/modelUpdate');
  (Module as any)._load = orig;

  const result = await checkForModelUpdate();
  if (result || called) {
    throw new Error('should skip update when not on wifi');
  }
  console.log('model update wifi skip');
})();
