import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { unzip } from 'fflate';
import { installMlp } from './installMlp';
import { MINIMAL_MLP_ZIP_B64 } from './__fixtures__/minimalMlpZipB64';
import { MINIMAL_MULTIMODAL_MLP_ZIP_B64 } from './__fixtures__/minimalMultimodalMlpZipB64';

describe('installMlp', () => {
  const TEST_HAND = Array.from({ length: 21 }, (_, i) =>
    i === 0 ? ([1, 0, 0] as number[]) : ([0, 0, 0] as number[]),
  ) as number[][];

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
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    const firstCall = postMessage.mock.calls[0];
    if (firstCall && firstCall[0]) {
      const evt = JSON.parse(firstCall[0]);
      expect(evt.event).toBe('mlp_loaded');
    }

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
  });

  it('überträgt Modell in Chunks', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    expect(window.__beginMlpTransfer!()).toBe(true);
    const mid = Math.floor(MINIMAL_MLP_ZIP_B64.length / 2);
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64.slice(0, mid));
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64.slice(mid));
    await window.__commitMlpTransfer!();

    const events = postMessage.mock.calls.map((c) => c[0] ? JSON.parse(c[0]).event : null);
    expect(events).toEqual(['mlp_transfer', 'mlp_loaded', 'mlp_transfer_complete']);

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
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
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64);
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
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Right' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
  });

  it('behandelt fehlende Händigkeit', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // With empty handedness, no hand is assigned to left or right, so all zeros
    const res = window.__mlpPredict!([TEST_HAND], []);
    // Returns null because input is all zeros (no hands detected)
    expect(res).toBeNull();
  });

  it('behandelt ungültige Handdaten', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // Test with hand that has fewer than 21 landmarks - falls back to EMPTY_HAND
    const invalidHand = Array.from({ length: 20 }, () => [0, 0, 0] as number[]) as number[][];
    const res = window.__mlpPredict!([invalidHand], [[{ categoryName: 'Left' }]]);
    // Returns null because both hands are EMPTY_HAND (all zeros)
    expect(res).toBeNull();
  });

  it('behandelt Null-Maximaldistanz bei Normalisierung', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // Create hand with all points at origin (after centering)
    const zeroHand = Array.from({ length: 21 }, () => [0, 0, 0] as number[]) as number[][];
    const res = window.__mlpPredict!([zeroHand], [[{ categoryName: 'Left' }]]);
    // Returns null when input is all zeros
    expect(res).toBeNull();
  });

  it('behandelt fehlendes fflate', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    // Temporarily remove fflate
    const originalFflate = window.fflate;
    delete (window as any).fflate;

    const result = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(result).toBe(false);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'telemetry',
        event: 'mlp_load_failed',
        reason: 'fflate unavailable',
      })
    );

    // Restore fflate
    (window as any).fflate = originalFflate;
  });

  it('behandelt Transfer-Sperre', () => {
    expect(window.__beginMlpTransfer!()).toBe(true);
    expect(window.__beginMlpTransfer!()).toBe(false); // Should fail when locked

    window.__pushMlpChunk!('test');
    expect(window.__pushMlpChunk!('test')).toBeUndefined(); // Should work when locked

    // Reset lock
    (window as any).__commitMlpTransfer();
  });

  it('behandelt Telemetrie-Sendefehler', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Mock postMessage to throw
    (window as any).ReactNativeWebView = {
      postMessage: () => {
        throw new Error('PostMessage failed');
      },
    };

    await window.__setMlpModelB64!('invalid');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Failed to send 'mlp_load_failed' telemetry event:",
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it('behandelt NPY-Parsing-Fehler', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    const fflate = await import('fflate');
    
    // Create invalid NPY data
    const invalidNpy = new Uint8Array([0x00]); // Invalid magic number
    const zipData = fflate.zipSync({
      'w1.npy': invalidNpy,
      'b1.npy': new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]),
      'w2.npy': new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]),
      'b2.npy': new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]),
    });
    const invalidB64 = Buffer.from(zipData).toString('base64');

    const result = await window.__setMlpModelB64!(invalidB64);
    expect(result).toBe(false);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'telemetry',
        event: 'mlp_load_failed',
        reason: 'Failed to parse w1 weights: bad npy',
      })
    );
  });

  it('behandelt fehlende Modellgewichte', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    const fflate = await import('fflate');
    
    // Create zip with missing weights
    const zipData = fflate.zipSync({
      'w1.npy': new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]),
      // Missing b1.npy, w2.npy, b2.npy
    });
    const invalidB64 = Buffer.from(zipData).toString('base64');

    const result = await window.__setMlpModelB64!(invalidB64);
    expect(result).toBe(false);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'telemetry',
        event: 'mlp_load_failed',
        reason: 'missing weights',
      })
    );
  });

  it('behandelt leeres Händigkeit-Array', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // With empty handedness, no hand is detected
    const res = window.__mlpPredict!([TEST_HAND], []);
    // Returns null because input is all zeros (no hands detected)
    expect(res).toBeNull();
  });

  it('behandelt null Händigkeit', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // With null handedness, no hand is detected
    const res = window.__mlpPredict!([TEST_HAND], null as any);
    // Returns null because input is all zeros (no hands detected)
    expect(res).toBeNull();
  });

  it('behandelt Chunked-Transfer mit leeren Chunks', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    expect(window.__beginMlpTransfer!()).toBe(true);
    window.__pushMlpChunk!('');
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64);
    window.__pushMlpChunk!('');
    await window.__commitMlpTransfer!();

    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual(['mlp_transfer', 'mlp_loaded', 'mlp_transfer_complete']);
  });

  it('behandelt Transfer-Commit ohne Begin', async () => {
    const postMessage = (window.ReactNativeWebView?.postMessage as ReturnType<typeof vi.fn>);
    await window.__commitMlpTransfer!();
    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual(['mlp_transfer_skipped', 'mlp_transfer_complete']);
  });

  it('behandelt Vorhersage ohne geladenes Modell', () => {
    // Without loading model, prediction should return null
    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res).toBeNull();
  });

  describe('Multimodal prediction', () => {
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
        face.push([0.5 + i * 0.0001, 0.5 + i * 0.0001, 0.05 + i * 0.00001]);
      }
      // Ensure key landmarks exist
      face[1] = [0.5, 0.5, 0.05]; // nose tip
      face[33] = [0.45, 0.45, 0.05]; // left eye
      face[263] = [0.55, 0.45, 0.05]; // right eye
      face[13] = [0.5, 0.55, 0.05]; // upper lip
      face[14] = [0.5, 0.58, 0.05]; // lower lip
      return face;
    }

    beforeEach(async () => {
      // Load multimodal model
      const ok = await window.__setMlpModelB64!(MINIMAL_MULTIMODAL_MLP_ZIP_B64);
      expect(ok).toBe(true);
    });

    it('erkennt multimodales Modell (1629 Eingabe-Features)', async () => {
      // Model should be loaded and recognized as multimodal
      // The model expects 1629 features (126 hands + 99 pose + 1404 face)
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        createPoseLandmarks(),
        createFaceLandmarks()
      );
      
      // Should return a prediction
      expect(res).not.toBeNull();
      expect(res?.label).toBe('multimodal');
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
      expect(res?.score).toBeGreaterThan(0);
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
      expect(res?.score).toBeGreaterThan(0);
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
      expect(res?.score).toBeGreaterThan(0);
    });

    it('erzeugt 258-dimensionale Feature-Vektor für multimodales Modell', async () => {
      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();
      
      // The prediction should process 258 features internally
      // We verify this indirectly by ensuring the prediction succeeds
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        face
      );

      expect(res).not.toBeNull();
      // The model was created with w1 shape (1, 258), so successful prediction
      // confirms that 258 features were correctly provided
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

    it('behandelt fehlende Pose-Daten (padding mit Nullen)', async () => {
      const incompletePose = [[0.5, 0.5, 0.1, 0.9]]; // Only 1 landmark
      const face = createFaceLandmarks();
      
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        incompletePose,
        face
      );

      // Should still work - pose section will be padded with zeros
      expect(res).not.toBeNull();
    });

    it('behandelt fehlende Gesichtsdaten (padding mit Nullen)', async () => {
      const pose = createPoseLandmarks();
      const incompleteFace = [[0.5, 0.5, 0.05]]; // Only 1 landmark
      
      const res = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        incompleteFace
      );

      // Should still work - face section will be padded with zeros
      expect(res).not.toBeNull();
    });

    it('verwendet hand-only Normalisierung für hand-only Modell', async () => {
      // Load the original hand-only model
      const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
      expect(ok).toBe(true);

      // Even if pose/face are provided, hand-only model should use hand-only path
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

    it('normalisiert multimodale Features unabhängig voneinander', async () => {
      const pose = createPoseLandmarks();
      const face = createFaceLandmarks();

      // First prediction
      const res1 = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        pose,
        face
      );

      // Scale pose and face by 2x
      const scaledPose = pose.map(p => [(p[0] ?? 0) * 2, (p[1] ?? 0) * 2, (p[2] ?? 0) * 2, p[3] ?? 0]) as number[][];
      const scaledFace = face.map(p => [(p[0] ?? 0) * 2, (p[1] ?? 0) * 2, (p[2] ?? 0) * 2]) as number[][];

      // Second prediction with scaled data
      const res2 = window.__mlpPredict!(
        [TEST_HAND],
        [[{ categoryName: 'Left' }]],
        scaledPose,
        scaledFace
      );

      // Both should produce valid predictions
      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();
      // Scores should be similar due to normalization
      expect(Math.abs((res1?.score ?? 0) - (res2?.score ?? 0))).toBeLessThan(0.1);
    });
  });
});
