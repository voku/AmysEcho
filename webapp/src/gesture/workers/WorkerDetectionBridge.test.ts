import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerDetectionBridge } from './WorkerDetectionBridge';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeImageBitmap(): ImageBitmap {
  return {
    width: 640,
    height: 480,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkerDetectionBridge', () => {
  let mockWorker: {
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((event: MessageEvent) => void) | null;
    _listeners: Map<string, Set<(event: any) => void>>;
    _emit: (event: any) => void;
  };

  let WorkerConstructorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const listeners = new Map<string, Set<(event: any) => void>>();

    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      _listeners: listeners,
      _emit(event: any) {
        const set = listeners.get(event.type ?? 'message');
        set?.forEach((fn) => fn(event));
        // Also fire generic 'message' listeners for typed events
        if (event.type !== 'message') {
          const genericSet = listeners.get('message');
          genericSet?.forEach((fn) => fn({ type: 'message', data: event } as any));
        }
      },
      addEventListener: vi.fn((type: string, fn: (e: any) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: (e: any) => void) => {
        listeners.get(type)?.delete(fn);
      }),
    };

    WorkerConstructorMock = vi.fn().mockReturnValue(mockWorker);
    // No need to stubGlobal — we inject via workerFactory option
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** Build a bridge with the mock worker injected */
  function makeBridge() {
    return new WorkerDetectionBridge({
      wasmBase: 'https://example.com/wasm',
      gestureModelUrl: 'https://example.com/model.task',
      workerFactory: WorkerConstructorMock,
    });
  }

  describe('init()', () => {
    it('resolves when worker sends ready message', async () => {
      const bridge = makeBridge();

      // Simulate worker sending 'ready' after init message arrives
      mockWorker.postMessage.mockImplementation(() => {
        // Emit a 'message' event with ready payload
        const messageListeners = mockWorker._listeners.get('message');
        messageListeners?.forEach((fn) =>
          fn({ data: { type: 'ready' } } as MessageEvent),
        );
      });

      await expect(bridge.init()).resolves.toBeUndefined();
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'init' }),
      );
    });

    it('rejects when worker sends error during init', async () => {
      const bridge = makeBridge();

      mockWorker.postMessage.mockImplementation(() => {
        const messageListeners = mockWorker._listeners.get('message');
        messageListeners?.forEach((fn) =>
          fn({ data: { type: 'error', message: 'WASM load failed' } } as MessageEvent),
        );
      });

      await expect(bridge.init()).rejects.toThrow('Worker init error: WASM load failed');
    });
  });

  describe('detect()', () => {
    async function initBridge() {
      const bridge = makeBridge();

      // Mock init: reply ready immediately
      mockWorker.postMessage.mockImplementationOnce(() => {
        const messageListeners = mockWorker._listeners.get('message');
        messageListeners?.forEach((fn) =>
          fn({ data: { type: 'ready' } } as MessageEvent),
        );
      });

      await bridge.init();

      // Reset mock so we can inspect detect calls
      mockWorker.postMessage.mockReset();
      return bridge;
    }

    it('resolves with detection result when worker responds', async () => {
      const bridge = await initBridge();
      const bitmap = makeImageBitmap();

      const expectedResult = {
        gestures: [[{ categoryName: 'Hallo', score: 0.9 }]],
        landmarks: [Array(21).fill({ x: 0.1, y: 0.2, z: 0 })],
        handednesses: [[{ categoryName: 'Right' }]],
      };

      mockWorker.postMessage.mockImplementation(
        (msg: { type: string; id: number }) => {
          const messageListeners = mockWorker._listeners.get('message');
          messageListeners?.forEach((fn) =>
            fn({
              data: {
                type: 'detect_result',
                id: msg.id,
                timestampMs: 1000,
                result: expectedResult,
                workerProcessingMs: 12,
              },
            } as MessageEvent),
          );
        },
      );

      const result = await bridge.detect(bitmap, 1000);
      expect(result).toEqual(expectedResult);
      expect(bitmap.close).not.toHaveBeenCalled(); // bridge doesn't close, worker does
    });

    it('resolves with null when worker returns no detections', async () => {
      const bridge = await initBridge();
      const bitmap = makeImageBitmap();

      mockWorker.postMessage.mockImplementation(
        (msg: { type: string; id: number }) => {
          const messageListeners = mockWorker._listeners.get('message');
          messageListeners?.forEach((fn) =>
            fn({
              data: {
                type: 'detect_result',
                id: msg.id,
                timestampMs: 1000,
                result: null,
                workerProcessingMs: 8,
              },
            } as MessageEvent),
          );
        },
      );

      const result = await bridge.detect(bitmap, 1000);
      expect(result).toBeNull();
    });

    it('resolves with null (not reject) when worker sends error for a frame', async () => {
      const bridge = await initBridge();
      const bitmap = makeImageBitmap();

      mockWorker.postMessage.mockImplementation(
        (msg: { type: string; id: number }) => {
          const messageListeners = mockWorker._listeners.get('message');
          messageListeners?.forEach((fn) =>
            fn({
              data: {
                type: 'error',
                id: msg.id,
                message: 'Inference failed',
              },
            } as MessageEvent),
          );
        },
      );

      const result = await bridge.detect(bitmap, 1000);
      expect(result).toBeNull();
    });

    it('rejects if detect called before init', async () => {
      const bridge = makeBridge();
      const bitmap = makeImageBitmap();
      await expect(bridge.detect(bitmap, 1000)).rejects.toThrow('not initialized');
    });
  });

  describe('dispose()', () => {
    it('terminates the worker and resolves pending detects with null', async () => {
      const bridge = makeBridge();

      mockWorker.postMessage.mockImplementationOnce(() => {
        const messageListeners = mockWorker._listeners.get('message');
        messageListeners?.forEach((fn) =>
          fn({ data: { type: 'ready' } } as MessageEvent),
        );
      });

      await bridge.init();

      // Queue a detect that never resolves on its own
      mockWorker.postMessage.mockReset(); // no response

      const detectPromise = bridge.detect(makeImageBitmap(), 1000);
      bridge.dispose();

      const result = await detectPromise;
      expect(result).toBeNull();
      expect(mockWorker.terminate).toHaveBeenCalled();
    });
  });
});
