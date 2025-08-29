import { API_URL, API_TOKEN } from '../constants';
import { flattenHands } from './handUtils';

type Landmark = number[];
type Hand = Landmark[]; // 21 points
type Frame = Hand[]; // one timestep of hands

export async function sendDgsSample(
  label: string,
  frame: Frame,
  profileId?: string,
): Promise<void> {
  const landmarks = flattenHands(frame || []);
  const resp = await fetch(`${API_URL}/api/v1/dgs/samples`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ label, landmarks, profileId }),
  }).catch((e: any) => {
    throw new Error(
      `Netzwerkfehler beim Senden der DGS-Probe: ${e?.message ?? e}`,
    );
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Senden der DGS-Probe fehlgeschlagen. Status: ${resp.status}. Antwort: ${text}`,
    );
  }
}
