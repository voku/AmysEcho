import { API_URL, API_TOKEN } from '../constants';
import { flattenHandsWithHandedness } from './handUtils';
import type { FrameData } from '../types/frames';

export async function sendDgsSample(
  label: string,
  frame: FrameData,
  profileId?: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<void> {
  if (!frame || !frame.landmarks?.length) {
    throw new Error('Ungültiger DGS-Frame: landmarks fehlen oder sind leer');
  }
  const landmarks = flattenHandsWithHandedness(
    frame.landmarks,
    frame.handedness ?? [],
  );

  const controller = opts.signal ? undefined : new AbortController();
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000)
    : undefined;

  let resp: Response;
  try {
    const body = profileId ? { label, landmarks, profileId } : { label, landmarks };
    resp = await fetch(`${API_URL}/api/v1/dgs/samples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal ?? controller?.signal,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Zeitüberschreitung beim Senden der DGS-Probe');
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Netzwerkfehler beim Senden der DGS-Probe: ${msg}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Senden der DGS-Probe fehlgeschlagen. Status: ${resp.status}. Antwort: ${text}`,
    );
  }
}
