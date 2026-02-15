import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { unzip, zipSync, strToU8 } from 'fflate';
import { installMlp } from './installMlp';
import { MULTIMODAL_FEATURES_SIZE } from './utils/featureSchema';

describe('installMlp', () => {
  const TEST_HAND = Array.from({ length: 21 }, (_, i) =>
    i === 0 ? ([1, 0, 0] as number[]) : ([0, 0, 0] as number[]),
  ) as number[][];

  // Helper to generate a mock NPY buffer for tests
  function createMockNpy(data: Float32Array | string[], shape: number[]): Uint8Array {
    const isString = Array.isArray(data) && typeof data[0] === 'string';
    let header = '';
    const STR_LEN = 16;
    
    if (isString) {
      header = `{'descr': '<U${STR_LEN}', 'fortran_order': False, 'shape': (${shape.join(',')},), }`;
    } else {
      header = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shape.join(',')},), }`;
    }
    
    // Pad header to multiple of 64
    header = header.padEnd(Math.ceil((header.length + 11) / 64) * 64 - 11, ' ');
    header += '\n';
    
    const headerBytes = strToU8(header);
    const headerLen = headerBytes.length;
    
    let totalLen = 10 + headerLen;
    if (isString) {
      totalLen += (data as string[]).length * STR_LEN * 4;
    } else {
      totalLen += (data as Float32Array).byteLength;
    }
    
    const buf = new Uint8Array(totalLen);
    buf[0] = 0x93;
    buf.set(strToU8('NUMPY'), 1);
    buf[6] = 1; // major
    buf[7] = 0; // minor
    buf[8] = headerLen & 0xFF;
    buf[9] = (headerLen >> 8) & 0xFF;
    buf.set(headerBytes, 10);
    
    if (isString) {
      const dataView = new DataView(buf.buffer, buf.byteOffset + 10 + headerLen);
      (data as string[]).forEach((s, i) => {
        for (let charIdx = 0; charIdx < Math.min(s.length, STR_LEN); charIdx++) {
          dataView.setUint32((i * STR_LEN + charIdx) * 4, s.charCodeAt(charIdx), true);
        }
      });
    } else {
      buf.set(new Uint8Array((data as Float32Array).buffer, (data as Float32Array).byteOffset, (data as Float32Array).byteLength), 10 + headerLen);
    }
    
    return buf;
  }

  function create3LayerZipB64(
    inputDim: number,
    layer1: number,
    layer2: number,
    output: number,
    labels: string[],
    options: { windowSize?: number; audioFeatureSize?: number; includeWindowMetadata?: boolean } = {},
  ) {
    const windowSize = options.windowSize ?? 1;
    const includeWindowMetadata = options.includeWindowMetadata ?? true;
    const w1 = new Float32Array(layer1 * inputDim).fill(0.1);
    const b1 = new Float32Array(layer1).fill(0);
    const w2 = new Float32Array(layer2 * layer1).fill(0.1);
    const b2 = new Float32Array(layer2).fill(0);
    const w3 = new Float32Array(output * layer2).fill(0.1);
    const b3 = new Float32Array(output).fill(0);
    
    const zipEntries: Record<string, Uint8Array> = {
      'w1.npy': createMockNpy(w1, [layer1, inputDim]),
      'b1.npy': createMockNpy(b1, [layer1]),
      'w2.npy': createMockNpy(w2, [layer2, layer1]),
      'b2.npy': createMockNpy(b2, [layer2]),
      'w3.npy': createMockNpy(w3, [output, layer2]),
      'b3.npy': createMockNpy(b3, [output]),
      'labels.npy': createMockNpy(labels, [labels.length]),
      'input_dim.npy': createMockNpy(new Float32Array([inputDim]), [1])
    };

    if (includeWindowMetadata) {
      zipEntries['window_size.npy'] = createMockNpy(new Float32Array([windowSize]), [1]);
    }

    if (options.audioFeatureSize !== undefined) {
      zipEntries['audio_feature_size.npy'] = createMockNpy(
        new Float32Array([options.audioFeatureSize]),
        [1],
      );
    }

    const zip = zipSync(zipEntries);
    
    return Buffer.from(zip).toString('base64');
  }

  const MINIMAL_3LAYER_ZIP_B64 = create3LayerZipB64(126, 10, 5, 1, ['hi']);
  const MULTIMODAL_3LAYER_ZIP_B64 = create3LayerZipB64(1629, 10, 5, 1, ['multimodal']);

  // Helper to create realistic pose data (33 landmarks with x,y,z,visibility)
  function createPoseLandmarks(): number[][] {
    const pose: number[][] = [];
    for (let i = 0; i < 33; i++) {
      pose.push([
        0.5 + i * 0.01,
        0.5 + i * 0.01,
        0.1 + i * 0.001,
        0.9 // visibility
      ]);
    }
    // Ensure shoulders exist at indices 11 and 12
    pose[11] = [0.4, 0.3, 0.1, 0.95];
    pose[12] = [0.6, 0.3, 0.1, 0.95];
    // Ensure hips exist at indices 23 and 24
    pose[23] = [0.4, 0.7, 0.15, 0.9];
    pose[24] = [0.6, 0.7, 0.15, 0.9];
    return pose;
  }

  // Helper to create realistic face data (468 landmarks)
  function createFaceLandmarks(): number[][] {
    const face: number[][] = [];
    for (let i = 0; i < 468; i++) {
      face.push([0.5 + i * 0.0001, 0.5 + i * 0.0001, 0.01]);
    }
    face[1] = [0.5, 0.5, 0.05]; // nose tip
    face[33] = [0.45, 0.45, 0.05]; // left eye
    face[263] = [0.55, 0.45, 0.05]; // right eye
    face[13] = [0.5, 0.55, 0.05]; // upper lip
    face[14] = [0.5, 0.58, 0.05]; // lower lip
    return face;
  }

  beforeEach(() => {
    // Reset window state
    (window as any).__setMlpModelB64 = undefined;
    (window as any).__mlpPredict = undefined;
    (window as any).__beginMlpTransfer = undefined;
    (window as any).__pushMlpChunk = undefined;
    (window as any).__commitMlpTransfer = undefined;
    (window as any).fflate = { unzip };
    (window as any).ReactNativeWebView = { postMessage: vi.fn() };
    installMlp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('meldet mlp_load_failed, wenn Entpacken fehlschlägt', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    window.fflate = {
      unzip: (_buf: Uint8Array, cb: (err: Error) => void) =>
        cb(new Error('boom')),
    } as any;
    expect(postMessage).not.toHaveBeenCalled();

    await window.__setMlpModelB64!('YQ==');
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const firstCall = postMessage.mock.calls[0];
    if (firstCall && firstCall[0]) {
      const msg = JSON.parse(firstCall[0]);
      expect(msg.event).toBe('mlp_load_failed');
      expect(msg.reason).toContain('boom');
    }
  });

  it('lädt minimales Modell und führt Vorhersage durch', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    const ok = await window.__setMlpModelB64!(MINIMAL_3LAYER_ZIP_B64);
    expect(ok).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    const firstCall = postMessage.mock.calls[0];
    if (firstCall && firstCall[0]) {
      const evt = JSON.parse(firstCall[0]);
      expect(evt.event).toBe('mlp_loaded');
    }

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeDefined();
  });

  it('überträgt Modell in Chunks', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    expect(window.__beginMlpTransfer!()).toBe(true);
    const mid = Math.floor(MINIMAL_3LAYER_ZIP_B64.length / 2);
    window.__pushMlpChunk!(MINIMAL_3LAYER_ZIP_B64.slice(0, mid));
    window.__pushMlpChunk!(MINIMAL_3LAYER_ZIP_B64.slice(mid));
    await window.__commitMlpTransfer!();

    const events = postMessage.mock.calls.map((c) => c[0] ? JSON.parse(c[0]).event : null);
    expect(events).toEqual(['mlp_transfer', 'mlp_loaded', 'mlp_transfer_complete']);

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeDefined();
  });

  it('schlägt bei überdimensioniertem Chunked-Transfer fehl', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    
    // Use dynamic import for fflate functions only available in test
    const fflate = await import('fflate');
    
    expect(window.__beginMlpTransfer!()).toBe(true);
    const oversizeZip = fflate.zipSync(
      Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => [`f${i}.txt`, fflate.strToU8('0')]),
      ),
    );
    const oversizeB64 = Buffer.from(oversizeZip).toString('base64');
    window.__pushMlpChunk!(oversizeB64);
    await window.__commitMlpTransfer!();

    const events = postMessage.mock.calls.map((c) => c[0] ? JSON.parse(c[0]).event : null);
    expect(events).toEqual(['mlp_transfer', 'mlp_load_failed', 'mlp_transfer_complete']);
    const failCall = postMessage.mock.calls.find((c) => c[0] && JSON.parse(c[0]).event === 'mlp_load_failed');
    if (failCall && failCall[0]) {
      const msg = JSON.parse(failCall[0]);
      expect(msg.reason).toMatch(/too many entries/);
    }
    expect(
      window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]])
    ).toBeNull();
  });

  it('überspringt Commit, wenn Transfer nicht begonnen', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    await window.__commitMlpTransfer!();
    const events = postMessage.mock.calls.map((c) => c[0] ? JSON.parse(c[0]).event : null);
    expect(events).toEqual(['mlp_transfer_skipped', 'mlp_transfer_complete']);
    expect(
      window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]])
    ).toBeNull();
  });

  it('meldet fehlenden Loader', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    expect(window.__beginMlpTransfer!()).toBe(true);
    window.__pushMlpChunk!(MINIMAL_3LAYER_ZIP_B64);
    // simulate missing loader
    delete (window as any).__setMlpModelB64;
    await window.__commitMlpTransfer!();
    const events = postMessage.mock.calls.map((c) => c[0] ? JSON.parse(c[0]).event : null);
    expect(events).toEqual(['mlp_transfer_failed', 'mlp_transfer_complete']);
    const firstCall = postMessage.mock.calls[0];
    if (firstCall && firstCall[0]) {
      const msg = JSON.parse(firstCall[0]);
      expect(msg.reason).toBe('setter_missing');
    }
    expect(
      window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]])
    ).toBeNull();
  });

  it('behandelt rechte Hand Vorhersage', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_3LAYER_ZIP_B64);
    expect(ok).toBe(true);

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Right' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeDefined();
  });

  it('behandelt fehlende Händigkeit', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_3LAYER_ZIP_B64);
    expect(ok).toBe(true);

    // With empty handedness, no hand is assigned to left or right, so all zeros
    const res = window.__mlpPredict!([TEST_HAND], []);
    // Returns null because input is all zeros (no hands detected)
    expect(res).toBeNull();
  });

  describe('Multimodal prediction', () => {
    beforeEach(async () => {
      // Load multimodal model (1629 features)
      const ok = await window.__setMlpModelB64!(MULTIMODAL_3LAYER_ZIP_B64);
      expect(ok).toBe(true);
    });

    it('führt multimodale Vorhersage mit Pose-Landmarks durch', async () => {
      const pose = createPoseLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        undefined
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('multimodal');
    });

    it('führt multimodale Vorhersage mit Gesichts-Landmarks durch', async () => {
      const face = createFaceLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        undefined,
        face
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('multimodal');
    });

    it('führt multimodale Vorhersage mit allen Modalitäten durch', async () => {
      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        face
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('multimodal');
    });

    it('behandelt rechte Hand mit multimodalen Features', async () => {
      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Right' }]],
        pose,
        face
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('multimodal');
    });

    it('behandelt beide Hände mit multimodalen Features', async () => {
      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND, TEST_HAND],
        [[{ categoryName: 'Left' }], [{ categoryName: 'Right' }]],
        pose,
        face
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('multimodal');
    });


    it('leitet Fenstergröße aus Input-Dimension ohne window_size-Metadaten ab', async () => {
      const inferredWindowModel = create3LayerZipB64(
        MULTIMODAL_FEATURES_SIZE * 6,
        10,
        5,
        1,
        ['inferred-window'],
        { includeWindowMetadata: false },
      );
      const ok = await window.__setMlpModelB64!(inferredWindowModel);
      expect(ok).toBe(true);

      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        face,
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('inferred-window');
    });

    it('nutzt die Audio-Feature-Größe aus dem Modell', async () => {
      const audioFeatureSize = 7;
      const richHand = Array.from({ length: 21 }, (_, i) => [
        0.1 + i * 0.01,
        0.2 + i * 0.01,
        0.3 + i * 0.01,
      ]) as number[][];
      const audioModelB64 = create3LayerZipB64(
        MULTIMODAL_FEATURES_SIZE + audioFeatureSize,
        10,
        5,
        1,
        ['audio'],
        { audioFeatureSize },
      );
      const ok = await window.__setMlpModelB64!(audioModelB64);
      expect(ok).toBe(true);

      const audioFeatures = new Float32Array(audioFeatureSize).fill(0.2);
      const pose = createPoseLandmarks();
      const res = window.__mlpPredict!(
        [richHand],
        [[{ categoryName: 'Left' }]],
        pose,
        undefined,
        audioFeatures,
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('audio');
    });

    it('verwendet hand-only Normalisierung für hand-only Modell', async () => {
      const ok = await window.__setMlpModelB64!(MINIMAL_3LAYER_ZIP_B64);
      expect(ok).toBe(true);

      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        face
      );

      expect(res).not.toBeNull();
      expect(res?.label).toBe('hi'); // Original model label
    });
  });
});
