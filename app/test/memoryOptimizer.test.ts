describe('MemoryOptimizer', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('uses reduced buffer on low-memory devices', () => {
    jest.doMock('expo-device', () => ({
      __esModule: true,
      totalMemory: 512 * 1024 * 1024,
    }), { virtual: true });
    const { recommendedBufferSize } = require('../src/services/MemoryOptimizer');
    expect(recommendedBufferSize()).toBe(2);
  });

  it('uses default buffer on higher-memory devices', () => {
    jest.doMock('expo-device', () => ({
      __esModule: true,
      totalMemory: 4096 * 1024 * 1024,
    }), { virtual: true });
    const { recommendedBufferSize } = require('../src/services/MemoryOptimizer');
    expect(recommendedBufferSize()).toBe(3);
  });
});
