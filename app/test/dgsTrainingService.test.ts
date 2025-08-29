jest.mock('../src/constants', () => ({
  API_URL: 'http://test',
  API_TOKEN: 'token',
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true });

import { sendDgsSample } from '../src/services/dgsTrainingService';

describe('sendDgsSample', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('flattens landmarks before posting', async () => {
    const frame = [
      Array.from({ length: 21 }, () => [1, 2, 3]),
      Array.from({ length: 21 }, () => [4, 5, 6]),
    ];
    const ok = await sendDgsSample('test', frame);
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.landmarks).toHaveLength(42);
    expect(body.landmarks[0]).toEqual([1, 2, 3]);
    expect(body.landmarks[21]).toEqual([4, 5, 6]);
  });
});
