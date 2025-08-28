import { API_URL, API_TOKEN } from '../constants';

import { RecognitionResponse } from '../types';

export async function recognizeGestureRemotely(base64Image: string, profileId?: string): Promise<RecognitionResponse | null> {
  try {
    const resp = await fetch(`${API_URL}/api/v1/recognize-gesture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ image: base64Image, profileId }),
    });
    if (!resp.ok) {
      let msg = 'Unknown error';
      try { msg = (await resp.json()).error || msg; } catch {}
      throw new Error(`Server error: ${resp.status} - ${msg}`);
    }
    return (await resp.json()) as RecognitionResponse;
  } catch (e) {
    console.error('[remoteGestureRecognitionService] Error:', (e as any)?.message || e);
    return null;
  }
}
