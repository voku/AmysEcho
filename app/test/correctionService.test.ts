import { correctionService } from '../src/services/correctionService';
import { API_URL, API_TOKEN } from '../src/constants';

describe('correctionService', () => {
  it('sends correction with auth header', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true }) as any;
    (global as any).fetch = mockFetch;

    await correctionService.logCorrection('wave');

    expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/api/corrections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ gesture: 'wave' }),
    });
  });
});
