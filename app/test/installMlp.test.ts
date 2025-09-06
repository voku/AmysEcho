import { installMlp } from '../src/webview/installMlp';
import { unzip, zipSync, strToU8 } from 'fflate';
import { MINIMAL_MLP_ZIP_B64 } from './fixtures/minimalMlpZipB64';

describe('installMlp', () => {
  let postMessage: jest.Mock;
  const TEST_HAND = Array.from({ length: 21 }, (_, i) =>
    i === 0 ? ([1, 0, 0] as const) : ([0, 0, 0] as const),
  );

  beforeEach(() => {
    postMessage = jest.fn();
    (global as any).window = {} as any;
    (global as any).atob = (b64: string) =>
      Buffer.from(b64, 'base64').toString('binary');
    (window as any).fflate = { unzip };
    window.ReactNativeWebView = { postMessage } as any;
    installMlp();
  });

  it('posts mlp_load_failed when unzip fails', async () => {
    window.fflate = {
      unzip: (_buf: Uint8Array, cb: (err: Error) => void) =>
        cb(new Error('boom')),
    } as any;
    expect(postMessage).not.toHaveBeenCalled();

    await window.__setMlpModelB64!('YQ==');
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(postMessage.mock.calls[0][0]);
    expect(msg.event).toBe('mlp_load_failed');
    expect(msg.reason).toBe('boom');
  });

  it('loads minimal model and predicts', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    const evt = JSON.parse(postMessage.mock.calls[0][0]);
    expect(evt.event).toBe('mlp_loaded');

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
  });

  it('transfers model in chunks', async () => {
    expect(window.__beginMlpTransfer!()).toBe(true);
    const mid = Math.floor(MINIMAL_MLP_ZIP_B64.length / 2);
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64.slice(0, mid));
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64.slice(mid));
    await window.__commitMlpTransfer!();

    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual(['mlp_transfer', 'mlp_loaded', 'mlp_transfer_complete']);

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
  });

  it('fails oversized chunked transfer', async () => {
    expect(window.__beginMlpTransfer!()).toBe(true);
    const oversizeZip = zipSync(
      Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => [`f${i}.txt`, strToU8('0')]),
      ),
    );
    const oversizeB64 = Buffer.from(oversizeZip).toString('base64');
    window.__pushMlpChunk!(oversizeB64);
    await window.__commitMlpTransfer!();

    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual(['mlp_transfer', 'mlp_load_failed', 'mlp_transfer_complete']);
    const failCall = postMessage.mock.calls.find((c) => JSON.parse(c[0]).event === 'mlp_load_failed')!;
    const msg = JSON.parse(failCall[0]);
    expect(msg.reason).toMatch(/too many entries/);
    expect(
      window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]])
    ).toBeNull();
  });

  it('skips commit when transfer not begun', async () => {
    await window.__commitMlpTransfer!();
    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual(['mlp_transfer_skipped', 'mlp_transfer_complete']);
    expect(
      window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]])
    ).toBeNull();
  });

  it('reports missing loader', async () => {
    expect(window.__beginMlpTransfer!()).toBe(true);
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64);
    // simulate missing loader
    // @ts-ignore
    delete window.__setMlpModelB64;
    await window.__commitMlpTransfer!();
    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual(['mlp_transfer_failed', 'mlp_transfer_complete']);
    const msg = JSON.parse(postMessage.mock.calls[0][0]);
    expect(msg.reason).toBe('setter_missing');
    expect(
      window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Left' }]])
    ).toBeNull();
  });

  it('handles right hand prediction', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    const res = window.__mlpPredict!([TEST_HAND], [[{ categoryName: 'Right' }]]);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
  });

  it('handles no handedness', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    const res = window.__mlpPredict!([TEST_HAND], []);
    expect(res?.label).toBe('hi');
    expect(res?.score).toBeCloseTo(1, 6);
  });

  it('handles invalid hand data', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // Test with hand that has fewer than 21 landmarks
    const invalidHand = Array.from({ length: 20 }, () => [0, 0, 0] as const);
    const res = window.__mlpPredict!([invalidHand], [[{ categoryName: 'Left' }]]);
    // Should still work because it falls back to EMPTY_HAND
    expect(res?.label).toBe('hi');
  });

  it('handles zero max distance in normalization', async () => {
    const ok = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    expect(ok).toBe(true);

    // Create hand with all points at origin (after centering)
    const zeroHand = Array.from({ length: 21 }, () => [0, 0, 0] as const);
    const res = window.__mlpPredict!([zeroHand], [[{ categoryName: 'Left' }]]);
    // Should still work because it falls back to EMPTY_HAND
    expect(res?.label).toBe('hi');
  });

  it('handles missing fflate', async () => {
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

  it('handles transfer lock', () => {
    expect(window.__beginMlpTransfer!()).toBe(true);
    expect(window.__beginMlpTransfer!()).toBe(false); // Should fail when locked

    window.__pushMlpChunk!('test');
    expect(window.__pushMlpChunk!('test')).toBeUndefined(); // Should work when locked

    // Reset lock
    (window as any).__commitMlpTransfer();
  });

  it('handles telemetry send failures', async () => {
    // Mock postMessage to throw
    const originalPostMessage = window.ReactNativeWebView?.postMessage;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage = jest.fn(() => {
        throw new Error('PostMessage failed');
      });
    }

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await window.__setMlpModelB64!('invalid');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Failed to send 'mlp_load_failed' telemetry event:",
      expect.any(Error)
    );

    // Restore
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage = originalPostMessage;
    }
    consoleWarnSpy.mockRestore();
  });
});
