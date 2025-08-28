import { API_URL, API_TOKEN } from '../constants';
import { logger } from '../utils/logger';

import { ExportedProfileData } from '../types';

async function request(url: string, options: RequestInit = {}): Promise<Response | null> {
  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!resp.ok) {
      logger.error(`[gdprService] Request failed: ${resp.status}`);
      return null;
    }
    return resp;
  } catch (e) {
    logger.error('[gdprService] Network error', e);
    return null;
  }
}

export const gdprService = {
  async exportProfile(profileId: string): Promise<ExportedProfileData | null> {
    const resp = await request(`${API_URL}/api/profiles/${profileId}/export`);
    if (!resp) return null;
    try {
      return (await resp.json()) as ExportedProfileData;
    } catch (e) {
      logger.error('[gdprService] Failed to parse export', e);
      return null;
    }
  },

  async deleteProfile(profileId: string): Promise<boolean> {
    const resp = await request(`${API_URL}/api/profiles/${profileId}`, { method: 'DELETE' });
    return !!resp;
  },
};
