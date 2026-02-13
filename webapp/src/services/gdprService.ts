/**
 * GDPR Service for Web
 * Provides data protection and privacy compliance features.
 */

import type { ApiClientConfig } from './apiClient';
import { buildAuthHeaders } from './apiClient';
import { logger } from './logger';
import { resolveApiUrl } from './resolveApiUrl';

export interface ExportedProfileData {
  profile: unknown;
  usageStats: unknown[];
  corrections: unknown[];
}

async function request(url: string, token: string | null | undefined, options: RequestInit = {}): Promise<Response | null> {
  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(token),
        ...(options.headers ?? {}),
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
  async exportProfile(profileId: string, config: ApiClientConfig): Promise<ExportedProfileData | null> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken ?? null;
    if (!apiUrl) {
      logger.error('[gdprService] API-Basis fehlt.');
      return null;
    }
    const resp = await request(resolveApiUrl(`/api/v1/profiles/${profileId}/export`, apiUrl), token);
    if (!resp) return null;
    try {
      const data = (await resp.json()) as ExportedProfileData;
      return data;
    } catch (e) {
      logger.error('[gdprService] Failed to parse export', e);
      return null;
    }
  },

  async deleteProfile(profileId: string, config: ApiClientConfig): Promise<boolean> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken ?? null;
    if (!apiUrl) {
      logger.error('[gdprService] API-Basis fehlt.');
      return false;
    }
    const resp = await request(resolveApiUrl(`/api/v1/profiles/${profileId}`, apiUrl), token, { method: 'DELETE' });
    if (resp) {
      logger.info(`[gdprService] Profile ${profileId} deleted for privacy compliance`);
    }
    return !!resp;
  },

  async auditDataAccess(
    profileId: string,
    accessorId: string,
    accessType: 'view' | 'export' | 'modify' | 'delete',
    config: ApiClientConfig,
  ): Promise<void> {
    void profileId;
    void accessorId;
    void accessType;
    void config;
    logger.warn('[gdprService] Server unterstützt aktuell kein Audit-Access-Ende im Webapp-Client.');
  },

  async scheduleDataDeletion(profileId: string, retentionDays: number, config: ApiClientConfig): Promise<boolean> {
    void profileId;
    void retentionDays;
    void config;
    logger.warn('[gdprService] Geplante Löschung wird vom Server derzeit nicht angeboten.');
    return false;
  },

  async anonymizeProfileData(profileId: string, config: ApiClientConfig): Promise<boolean> {
    void profileId;
    void config;
    logger.warn('[gdprService] Anonymisierung wird vom Server derzeit nicht angeboten.');
    return false;
  },

  async getDataRetentionStatus(profileId: string, config: ApiClientConfig): Promise<{
    retentionDays: number;
    scheduledDeletion?: string;
    lastAccessed: string;
    dataSize: number;
  } | null> {
    void profileId;
    void config;
    logger.warn('[gdprService] Retention-Status wird vom Server derzeit nicht angeboten.');
    return null;
  },

  /**
   * Export all local data for GDPR compliance
   */
  exportLocalData(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    
    // Collect all localStorage items that belong to Amy's Echo
    const keys = [
      'amys_echo_gesture_history',
      'amy_haptic_preferences',
      'selectedTheme',
      'apiUrl',
      'webapp:api-config',
      'webapp:api-config:persisted-token',
      'webapp:api-config:persisted-key',
      'webapp:api-config:session',
      'webapp:api-config:session:key',
    ];
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      }
    }
    
    return data;
  },

  /**
   * Delete all local data for GDPR compliance
   */
  deleteLocalData(): void {
    const keys = [
      'amys_echo_gesture_history',
      'amy_haptic_preferences',
      'selectedTheme',
      'apiUrl',
      'webapp:api-config',
      'webapp:api-config:persisted-token',
      'webapp:api-config:persisted-key',
      'webapp:api-config:session',
      'webapp:api-config:session:key',
    ];
    for (const key of keys) {
      localStorage.removeItem(key);
    }
    sessionStorage.clear();
    logger.info('[gdprService] All local data deleted');
  }
};
