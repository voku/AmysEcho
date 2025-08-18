import { API_URL, API_TOKEN } from '../constants';

export async function sendDgsSample(label: string, landmarks: number[][]): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/api/v1/dgs/samples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ label, landmarks }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

