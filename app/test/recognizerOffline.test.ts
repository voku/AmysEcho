describe('Offline Recognizer', () => {
  it('should classify gestures using the offline model', async () => {
    // Mock the server recognizer module
    jest.doMock('../../server/src/recognizer', () => ({
      classifyGesture: jest.fn(async () => ({
        label: 'g1',
        processedBy: 'local',
        confidence: 0.9
      }))
    }));

    const { classifyGesture } = require('../../server/src/recognizer');
    const result = await classifyGesture([0, 0]);
    expect(result.label).toBe('g1');
    expect(result.processedBy).toBe('local');
  });
});