import { API_URL, API_TOKEN } from '../constants';
import { flattenHands } from './handUtils';

export async function sendDgsSample(
  label: string,
  frames: number[][][][],
  profileId?: string,
): Promise<boolean> {
  try {
    const landmarks = flattenHands(frames[0] || []);
    const resp = await fetch(`${API_URL}/api/v1/dgs/samples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ label, landmarks, profileId }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
