import { API_URL, API_TOKEN } from '../constants';

export const correctionService = {
  async logCorrection(gesture: string): Promise<void> {
    await fetch(`${API_URL}/api/corrections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ gesture }),
    });
  },

  async logNegativeSample(gesture: string): Promise<void> {
    await fetch(`${API_URL}/api/negative-samples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ gesture }),
    });
  },
};

export default correctionService;
