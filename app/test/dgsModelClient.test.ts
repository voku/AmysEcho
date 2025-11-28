import { onMlpModelUpdated, fetchMlpModel } from '../src/services/dgsModelClient';

describe('dgsModelClient', () => {

  it('emits update when new model downloaded', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'ETag' ? 'v1' : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const events: string[] = [];
    const unsub = onMlpModelUpdated(() => events.push('updated'));
    await fetchMlpModel();
    expect(events).toEqual(['updated']);
    unsub();
  });

  it('does not emit on 304', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      status: 304,
      headers: { get: () => null },
    });
    const events: string[] = [];
    const unsub = onMlpModelUpdated(() => events.push('updated'));
    await fetchMlpModel();
    expect(events).toEqual([]);
    unsub();
  });
});
