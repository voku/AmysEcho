jest.mock('../src/constants', () => ({
  API_URL: 'http://test',
  API_TOKEN: 'token',
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });

import { sendDgsSample } from '../src/services/dgsTrainingService';

describe('sendDgsSample', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('flattens landmarks and posts successfully', async () => {
    const frame = [
      Array.from({ length: 21 }, () => [1, 2, 3]),
      Array.from({ length: 21 }, () => [4, 5, 6]),
    ];
    await sendDgsSample('test', frame);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.landmarks).toHaveLength(42);
    expect(body.landmarks[0]).toEqual([1, 2, 3]);
    expect(body.landmarks[21]).toEqual([4, 5, 6]);
  });

  it('throws an error on a failed request', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    });
    await expect(sendDgsSample('test', []))
      .rejects.toThrow('Senden der DGS-Probe fehlgeschlagen. Status: 500. Antwort: Server Error');
  });

  it('throws on network error', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('kaputt'));
    await expect(sendDgsSample('test', []))
      .rejects.toThrow('Netzwerkfehler beim Senden der DGS-Probe: kaputt');
  });
});
