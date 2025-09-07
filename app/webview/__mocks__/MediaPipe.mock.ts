/**
 * Mock implementation of MediaPipe components for testing
 */

export const mockGestureRecognizer = {
  recognizeForVideo: jest.fn(),
  close: jest.fn(),
};

export const mockFilesetResolver = {
  forVisionTasks: jest.fn().mockResolvedValue({}),
};

export const mockComponents: any = {
  FilesetResolver: mockFilesetResolver,
  GestureRecognizer: {
    createFromOptions: jest.fn().mockResolvedValue(mockGestureRecognizer),
  },
  wasmBase: 'mock-wasm-base',
};

export const loadTasksVision = jest.fn().mockResolvedValue(mockComponents);

// Export for use in tests
export { mockComponents as MediaPipeComponents };