import path from 'path';

describe('Offline Recognizer', () => {
  it('should classify gestures using the offline model', async () => {
    process.env.OFFLINE_MODEL_PATH = path.join(__dirname, '../../server/src/offlineModel.json');
    jest.resetModules();
    const { classifyGesture } = require('../../server/src/recognizer');
    const result = await classifyGesture([0,0]);
    expect(result.label).toBe('g1');
    expect(result.processedBy).toBe('local');
  });
});