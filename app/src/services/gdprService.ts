import { API_URL, API_TOKEN } from '../constants';
import { logger } from '../utils/logger';

export interface ExportedProfileData {
  profile: any;
  usageStats: any[];
  corrections: any[];
  kindergartenMetadata?: {
    exportDate: string;
    kindergartenId?: string;
    teacherId?: string;
    exportReason: 'parent_request' | 'school_transfer' | 'legal_requirement' | 'maintenance';
    dataRetention: 'active' | 'archived' | 'scheduled_deletion';
  };
}

export interface KindergartenSecurityConfig {
  dataRetentionDays: number;
  requireParentalConsent: boolean;
  allowDataSharing: boolean;
  encryptionLevel: 'basic' | 'enhanced' | 'military';
  auditLogging: boolean;
  emergencyDataAccess: boolean;
}

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
  async exportProfile(profileId: string, reason: 'parent_request' | 'school_transfer' | 'legal_requirement' | 'maintenance' = 'parent_request'): Promise<ExportedProfileData | null> {
    const resp = await request(`${API_URL}/api/profiles/${profileId}/export`);
    if (!resp) return null;
    try {
      const data = (await resp.json()) as ExportedProfileData;
      // Add kindergarten metadata
      data.kindergartenMetadata = {
        exportDate: new Date().toISOString(),
        exportReason: reason,
        dataRetention: 'active'
      };
      return data;
    } catch (e) {
      logger.error('[gdprService] Failed to parse export', e);
      return null;
    }
  },

  async deleteProfile(profileId: string): Promise<boolean> {
    const resp = await request(`${API_URL}/api/profiles/${profileId}`, { method: 'DELETE' });
    if (resp) {
      // Log deletion for audit trail
      logger.info(`[gdprService] Profile ${profileId} deleted for privacy compliance`);
    }
    return !!resp;
  },

  // Kindergarten-specific security functions
  async enableKindergartenMode(profileId: string, config: KindergartenSecurityConfig): Promise<boolean> {
    try {
      const resp = await request(`${API_URL}/api/profiles/${profileId}/kindergarten-mode`, {
        method: 'POST',
        body: JSON.stringify(config)
      });
      return !!resp;
    } catch (e) {
      logger.error('[gdprService] Failed to enable kindergarten mode', e);
      return false;
    }
  },

  async auditDataAccess(profileId: string, accessorId: string, accessType: 'view' | 'export' | 'modify' | 'delete'): Promise<void> {
    try {
      await request(`${API_URL}/api/audit/profiles/${profileId}/access`, {
        method: 'POST',
        body: JSON.stringify({
          accessorId,
          accessType,
          timestamp: new Date().toISOString(),
          ipAddress: 'device_local', // Would be actual IP in production
          userAgent: 'Amy\'s Echo App'
        })
      });
    } catch (e) {
      logger.error('[gdprService] Failed to log data access audit', e);
    }
  },

  async scheduleDataDeletion(profileId: string, retentionDays: number): Promise<boolean> {
    try {
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + retentionDays);

      const resp = await request(`${API_URL}/api/profiles/${profileId}/schedule-deletion`, {
        method: 'POST',
        body: JSON.stringify({
          deletionDate: deletionDate.toISOString(),
          reason: 'kindergarten_data_retention_policy'
        })
      });
      return !!resp;
    } catch (e) {
      logger.error('[gdprService] Failed to schedule data deletion', e);
      return false;
    }
  },

  async anonymizeProfileData(profileId: string): Promise<boolean> {
    try {
      const resp = await request(`${API_URL}/api/profiles/${profileId}/anonymize`, {
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

  async getDataRetentionStatus(profileId: string): Promise<{
    retentionDays: number;
    scheduledDeletion?: string;
    lastAccessed: string;
    dataSize: number;
  } | null> {
    try {
      const resp = await request(`${API_URL}/api/profiles/${profileId}/retention-status`);
      if (!resp) return null;
      return await resp.json();
    } catch (e) {
      logger.error('[gdprService] Failed to get retention status', e);
      return null;
    }
  }
};
