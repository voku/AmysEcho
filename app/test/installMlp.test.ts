import { installMlp } from '../src/webview/installMlp';
import { unzip, zipSync, strToU8 } from 'fflate';

// Base64 encoded minimal valid MLP model archive with w1, b1, w2, b2 and labels
const MINIMAL_MLP_ZIP_B64 =
  'UEsDBBQAAAAIACoyI1squXNbTQAAAHgCAAAGAAAAdzEubnB5m+wX6hsQychQxlCtnpJanFykbqWgbpNmoq6joJ6WX1RSlJgXn1+UkgoSd0vMKU4FihdnJBakAvkahjoKhkZmmjoKtQpkAi6GUTAiAQBQSwMEFAAAAAgAKjIjWyeDsv5HAAAAhAAAAAYAAABiMS5ucHmb7BfqGxDJyFDGUK2eklqcXKRupaBuk2airqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RqGOpo6CrUKFAAuBiAAAFBLAwQUAAAACAAqMiNbisbwbkkAAACEAAAABgAAAHcyLm5weZvsF+obEMnIUMZQrZ6SWpxcpG6loG6TZqKuo6Cell9UUpSYF59flJIKEndLzClOBYoXZyQWpAL5GoY6CoaaOgq1CmQDLgYgAABQSwMEFAAAAAgAKjIjWyeDsv5HAAAAhAAAAAYAAABiMi5ucHmb7BfqGxDJyFDGUK2eklqcXKRupaBuk2airqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RqGOpo6CrUKFAAuBiAAAFBLAwQUAAAACAAqMiNbPYS1+ksAAACIAAAACgAAAGxhYmVscy5ucHmb7BfqGxDJyFDGUK2eklqcXKRupaBuE2qkrqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RqGOpo6CrUKFACuDAYGhkwgBgBQSwECFAMUAAAACAAqMiNbKrlzW00AAAB4AgAABgAAAAAAAAAAAAAAgAEAAAAAdzEubnB5UEsBAhQDFAAAAAgAKjIjWyeDsv5HAAAAhAAAAAYAAAAAAAAAAAAAAIABcQAAAGIxLm5weVBLAQIUAxQAAAAIACoyI1uKxvBuSQAAAIQAAAAGAAAAAAAAAAAAAACAAdwAAAB3Mi5ucHlQSwECFAMUAAAACAAqMiNbJ4Oy/kcAAACEAAAABgAAAAAAAAAAAAAAgAFJAQAAYjIubnB5UEsBAhQDFAAAAAgAKjIjWz2EtfpLAAAAiAAAAAoAAAAAAAAAAAAAAIABtAEAAGxhYmVscy5ucHlQSwUGAAAAAAUABQAIAQAAJwIAAAAA';

describe('installMlp', () => {
  beforeEach(() => {
    (global as any).window = {} as any;
    (global as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
    (window as any).fflate = { unzip };
  });

  it('posts mlp_load_failed when loading fails', async () => {
    const postMessage = jest.fn();
    window.ReactNativeWebView = { postMessage } as any;
    window.fflate = { unzipSync: () => ({}) } as any;
    installMlp();
    expect(postMessage).not.toHaveBeenCalled();

    await window.__setMlpModelB64!('YQ==');
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(postMessage.mock.calls[0][0]);
    expect(msg.event).toBe('mlp_load_failed');
  });

  it('loads minimal model and predicts', async () => {
    const postMessage = jest.fn();
    window.ReactNativeWebView = { postMessage } as any;
    window.fflate = { unzip } as any;
    installMlp();

    window.__setMlpModelB64!(MINIMAL_MLP_ZIP_B64);
    await new Promise((r) => setImmediate(r));

    expect(postMessage).toHaveBeenCalledTimes(1);
    const evt = JSON.parse(postMessage.mock.calls[0][0]);
    expect(evt.event).toBe('mlp_loaded');

    const hand = Array.from({ length: 21 }, (_, i) =>
      i === 0 ? ([1, 0, 0] as const) : ([0, 0, 0] as const),
    );
    const res = window.__mlpPredict!([hand], [[{ categoryName: 'Left' }]]);
    expect(res).toEqual({ label: 'hi', score: 1 });
  });

  it('transfers model in chunks', async () => {
    const postMessage = jest.fn();
    window.ReactNativeWebView = { postMessage } as any;
    window.fflate = { unzip } as any;
    installMlp();

    expect(window.__beginMlpTransfer!()).toBe(true);
    const mid = Math.floor(MINIMAL_MLP_ZIP_B64.length / 2);
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64.slice(0, mid));
    window.__pushMlpChunk!(MINIMAL_MLP_ZIP_B64.slice(mid));
    window.__commitMlpTransfer!();
    await new Promise((r) => setImmediate(r));

    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual([
      'mlp_transfer',
      'mlp_transfer_complete',
      'mlp_loaded',
    ]);

    const hand = Array.from({ length: 21 }, (_, i) =>
      i === 0 ? ([1, 0, 0] as const) : ([0, 0, 0] as const),
    );
    const res = window.__mlpPredict!([hand], [[{ categoryName: 'Left' }]]);
    expect(res).toEqual({ label: 'hi', score: 1 });
  });

  it('fails oversized chunked transfer', async () => {
    const postMessage = jest.fn();
    window.ReactNativeWebView = { postMessage } as any;
    window.fflate = { unzip } as any;
    installMlp();

    expect(window.__beginMlpTransfer!()).toBe(true);
    const oversizeZip = zipSync(
      Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => [`f${i}.txt`, strToU8('0')]),
      ),
    );
    const oversizeB64 = Buffer.from(oversizeZip).toString('base64');
    window.__pushMlpChunk!(oversizeB64);
    window.__commitMlpTransfer!();
    await new Promise((r) => setImmediate(r));

    const events = postMessage.mock.calls.map((c) => JSON.parse(c[0]).event);
    expect(events).toEqual([
      'mlp_transfer',
      'mlp_transfer_complete',
      'mlp_load_failed',
    ]);
    const hand = Array.from({ length: 21 }, (_, i) =>
      i === 0 ? ([1, 0, 0] as const) : ([0, 0, 0] as const),
    );
    expect(window.__mlpPredict!([hand], [[{ categoryName: 'Left' }]])).toBeNull();
  });
});
