import { vi } from 'vitest';

/**
 * Mock implementation of MediaPipe components for testing
 */

export const mockGestureRecognizer = {
  recognizeForVideo: vi.fn(),
  close: vi.fn(),
};

export const mockFilesetResolver = {
  forVisionTasks: vi.fn().mockResolvedValue({}),
};

export const mockComponents: any = {
  FilesetResolver: mockFilesetResolver,
  GestureRecognizer: {
    createFromOptions: vi.fn().mockResolvedValue(mockGestureRecognizer),
  },
  wasmBase: 'mock-wasm-base',
};

export const loadTasksVision = vi.fn().mockResolvedValue(mockComponents);

// Export for use in tests
export { mockComponents as MediaPipeComponents };