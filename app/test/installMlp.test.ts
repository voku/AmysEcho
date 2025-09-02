import { installMlp } from '../src/webview/installMlp';

describe('installMlp', () => {
  beforeEach(() => {
    (global as any).window = {} as any;
    (global as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
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
});
