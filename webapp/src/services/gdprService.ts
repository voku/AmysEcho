/**
 * GDPR Service for Web
 * Provides data protection and privacy compliance features.
 */

import type { ApiClientConfig } from './apiClient';
import { buildAuthHeaders } from './apiClient';
import { logger } from './logger';

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
    const resp = await request(`${apiUrl}/api/profiles/${profileId}/export`, token);
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
    const resp = await request(`${apiUrl}/api/profiles/${profileId}`, token, { method: 'DELETE' });
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
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken ?? null;
    if (!apiUrl) {
      logger.error('[gdprService] API-Basis fehlt.');
      return;
    }
    try {
      await request(`${apiUrl}/api/audit/profiles/${profileId}/access`, token, {
        method: 'POST',
        body: JSON.stringify({
          accessorId,
          accessType,
          timestamp: new Date().toISOString(),
          ipAddress: 'browser',
          userAgent: navigator.userAgent
        })
      });
    } catch (e) {
      logger.error('[gdprService] Failed to log data access audit', e);
    }
  },

  async scheduleDataDeletion(profileId: string, retentionDays: number, config: ApiClientConfig): Promise<boolean> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken ?? null;
    if (!apiUrl) {
      logger.error('[gdprService] API-Basis fehlt.');
      return false;
    }
    try {
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + retentionDays);

      const resp = await request(`${apiUrl}/api/profiles/${profileId}/schedule-deletion`, token, {
        method: 'POST',
        body: JSON.stringify({
          deletionDate: deletionDate.toISOString(),
          reason: 'data_retention_policy'
        })
      });
      return !!resp;
    } catch (e) {
      logger.error('[gdprService] Failed to schedule data deletion', e);
      return false;
    }
  },

  async anonymizeProfileData(profileId: string, config: ApiClientConfig): Promise<boolean> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken ?? null;
    if (!apiUrl) {
      logger.error('[gdprService] API-Basis fehlt.');
      return false;
    }
    try {
      const resp = await request(`${apiUrl}/api/profiles/${profileId}/anonymize`, token, {
        method: 'POST'
      });
      if (resp) {
        logger.info(`[gdprService] Profile ${profileId} data anonymized for privacy`);
      }
      return !!resp;
    } catch (e) {
      logger.error('[gdprService] Failed to anonymize profile data', e);
      return false;
    }
  },

  async getDataRetentionStatus(profileId: string, config: ApiClientConfig): Promise<{
    retentionDays: number;
    scheduledDeletion?: string;
    lastAccessed: string;
    dataSize: number;
  } | null> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken ?? null;
    if (!apiUrl) {
      logger.error('[gdprService] API-Basis fehlt.');
      return null;
    }
    try {
      const resp = await request(`${apiUrl}/api/profiles/${profileId}/retention-status`, token);
      if (!resp) return null;
      return await resp.json();
    } catch (e) {
      logger.error('[gdprService] Failed to get retention status', e);
      return null;
    }
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
