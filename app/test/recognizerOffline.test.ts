import path from 'path';

(async () => {
  process.env.OFFLINE_MODEL_PATH = path.join(__dirname, '../../server/src/offlineModel.json');
  delete require.cache[require.resolve('../../server/src/recognizer')];
  const { classifyGesture } = require('../../server/src/recognizer');
  const result = await classifyGesture([0,0]);
  if (result.label !== 'g1' || result.processedBy !== 'local') {
    throw new Error('offline model classification failed');
  }
  console.log('offline model ok');
})();
