import { API_URL, API_TOKEN } from '../constants';
import { flattenHands } from './handUtils';

type Landmark = number[];
type Hand = Landmark[]; // 21 points
type Frame = Hand[]; // one timestep of hands

export async function sendDgsSample(
  label: string,
  frame: Frame,
  profileId?: string,
): Promise<boolean> {
  try {
    const landmarks = flattenHands(frame || []);
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
