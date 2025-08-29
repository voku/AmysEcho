import { API_URL, API_TOKEN } from '../constants';
import { flattenHandsWithHandedness } from './handUtils';
import type { FrameData } from '../types/frames';

export async function sendDgsSample(
  label: string,
  frame: FrameData,
  profileId?: string,
): Promise<void> {
  const landmarks = flattenHandsWithHandedness(
    frame?.landmarks || [],
    frame?.handedness || [],
  );
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
