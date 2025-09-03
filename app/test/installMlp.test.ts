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

    const success = await window.__setMlpModelB64!('YQ==');
    expect(success).toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(postMessage.mock.calls[0][0]);
    expect(msg.event).toBe('mlp_load_failed');
    expect(msg.reason).toBe('boom');
  });

  it('loads minimal model and predicts', async () => {
    const success = await window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);

    expect(success).toBe(true);
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
    expect(events).toEqual([
      'mlp_transfer',
      'mlp_loaded',
      'mlp_transfer_complete',
    ]);

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

    const messages = postMessage.mock.calls.map((c) => JSON.parse(c[0]));
    expect(messages.map((m) => m.event)).toEqual([
      'mlp_transfer',
      'mlp_load_failed',
      'mlp_transfer_complete',
    ]);
    const msg = messages.find((m) => m.event === 'mlp_load_failed')!;
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
});
