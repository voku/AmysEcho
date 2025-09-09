import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
// import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AccessLogEntry {
  timestamp: string;
  userId: string;
  action: 'login' | 'logout' | 'dataAccess' | 'exportData' | 'delete';
  ipAddress?: string;
  deviceId?: string;
}

export interface KindergartenProfile {
  id: string;
  name: string;
  kindergartenId: string;
  teacherId: string;
  parentalConsent: boolean;
  dataRetentionPolicy: 'strict' | 'standard' | 'extended';
  emergencyContacts: string[];
  accessLog: AccessLogEntry[];
}

export interface KindergartenSecuritySettings {
  sessionTimeoutMinutes: number;
  requirePinForDataAccess: boolean;
  allowOfflineMode: boolean;
  encryptSensitiveData: boolean;
  auditAllActions: boolean;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

interface FailedLoginAttempt {
  count: number;
  lastAttempt: number;
}

class KindergartenSecurityService {
  private static instance: KindergartenSecurityService;
  private currentProfile: KindergartenProfile | null = null;
  private securitySettings: KindergartenSecuritySettings;
  private sessionStartTime: number = 0;
  private failedLoginAttempts: Map<string, FailedLoginAttempt> = new Map();

  private readonly STORAGE_KEYS = {
    SECURITY_SETTINGS: 'kindergarten_security_settings',
    ACCESS_LOG: 'kindergarten_access_log',
    SESSION_DATA: 'kindergarten_session_data'
  };

  private constructor() {
    this.securitySettings = this.getDefaultSecuritySettings();
    this.loadSecuritySettings();
  }

  static getInstance(): KindergartenSecurityService {
    if (!KindergartenSecurityService.instance) {
      KindergartenSecurityService.instance = new KindergartenSecurityService();
    }
    return KindergartenSecurityService.instance;
  }

  private getDefaultSecuritySettings(): KindergartenSecuritySettings {
    return {
      sessionTimeoutMinutes: 60, // 1 hour for kindergarten safety
      requirePinForDataAccess: true,
      allowOfflineMode: true,
      encryptSensitiveData: true,
      auditAllActions: true,
      maxLoginAttempts: 3,
      lockoutDurationMinutes: 15
    };
  }

  private async loadSecuritySettings(): Promise<void> {
    try {
      const stored = null; // await AsyncStorage.getItem(this.STORAGE_KEYS.SECURITY_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.securitySettings = { ...this.getDefaultSecuritySettings(), ...parsed };
      }
    } catch (error) {
      logger.warn('Failed to load kindergarten security settings', error);
    }
  }

  async updateSecuritySettings(settings: Partial<KindergartenSecuritySettings>): Promise<void> {
    this.securitySettings = { ...this.securitySettings, ...settings };
    // await AsyncStorage.setItem(this.STORAGE_KEYS.SECURITY_SETTINGS, JSON.stringify(this.securitySettings));
    logger.info('Kindergarten security settings updated');
  }

  getSecuritySettings(): KindergartenSecuritySettings {
    return { ...this.securitySettings };
  }

  async startSession(profile: KindergartenProfile): Promise<boolean> {
    // Check if profile has required consents
    if (!profile.parentalConsent) {
      logger.warn('Cannot start session: parental consent required');
      return false;
    }

    // Check session timeout
    if (this.isSessionExpired()) {
      await this.endSession();
    }

    this.currentProfile = profile;
    this.sessionStartTime = Date.now();

    // Log session start
    await this.logAccess('login', profile.id);

    logger.info(`Kindergarten session started for profile: ${profile.name}`);
    return true;
  }

  async endSession(): Promise<void> {
    if (this.currentProfile) {
      await this.logAccess('logout', this.currentProfile.id);
      logger.info(`Kindergarten session ended for profile: ${this.currentProfile.name}`);
    }

    this.currentProfile = null;
    this.sessionStartTime = 0;

    // Clear sensitive session data
    // await AsyncStorage.removeItem(this.STORAGE_KEYS.SESSION_DATA);
  }

  isSessionExpired(): boolean {
    if (!this.sessionStartTime) return true;
    const sessionDuration = (Date.now() - this.sessionStartTime) / (1000 * 60); // minutes
    return sessionDuration > this.securitySettings.sessionTimeoutMinutes;
  }

  getCurrentProfile(): KindergartenProfile | null {
    return this.currentProfile;
  }

  async validateDataAccess(action: 'view' | 'export' | 'modify' | 'delete'): Promise<boolean> {
    if (!this.currentProfile) {
      logger.warn('Data access denied: no active session');
      return false;
    }

    if (this.isSessionExpired()) {
      logger.warn('Data access denied: session expired');
      await this.endSession();
      return false;
    }

    // Check parental consent for sensitive actions
    if ((action === 'export' || action === 'delete') && !this.currentProfile.parentalConsent) {
      logger.warn('Data access denied: parental consent required for sensitive action');
      return false;
    }

    // Log the access
    await this.logAccess('dataAccess', this.currentProfile.id);

    return true;
  }

  async logAccess(action: AccessLogEntry['action'], userId: string): Promise<void> {
    if (!this.securitySettings.auditAllActions && action === 'dataAccess') {
      return; // Skip logging routine data access if audit is disabled
    }

    const logEntry: AccessLogEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      deviceId: 'current_device' // Would be actual device ID in production
    };

    try {
      const existingLogs = await this.getAccessLogs();
      existingLogs.push(logEntry);

      // Keep only last 1000 entries for storage efficiency
      // await AsyncStorage.setItem(this.STORAGE_KEYS.ACCESS_LOG, JSON.stringify(existingLogs.slice(-1000)));
    } catch (error) {
      logger.error('Failed to log access', error);
    }
  }

  async getAccessLogs(): Promise<any[]> {
    try {
      const stored = '[]'; // await AsyncStorage.getItem(this.STORAGE_KEYS.ACCESS_LOG);
      let parsed;

    if (stored) {

      parsed = JSON.parse(stored);

    } else {

      parsed = [];

    }

    return parsed;
    } catch (error) {
      logger.error('Failed to load access logs', error);
      return [];
    }
  }
  async checkFailedLoginAttempts(identifier: string): Promise<boolean> {
    const attempts = this.failedLoginAttempts.get(identifier);
    if (!attempts) return true; // No failed attempts

    const now = Date.now();
    const timeSinceLastAttempt = now - attempts.lastAttempt;

    // Check if lockout period has expired
    if (timeSinceLastAttempt > this.securitySettings.lockoutDurationMinutes * 60 * 1000) {
      this.failedLoginAttempts.delete(identifier);
      return true;
    }

    // Check if max attempts exceeded
    if (attempts.count >= this.securitySettings.maxLoginAttempts) {
      logger.warn(`Login blocked for ${identifier}: too many failed attempts`);
      return false;
    }

    return true;
  }

  recordFailedLogin(identifier: string): void {
    const attempts = this.failedLoginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.failedLoginAttempts.set(identifier, attempts);
  }

  async encryptSensitiveData(data: string): Promise<string> {
    if (!this.securitySettings.encryptSensitiveData) {
      return data; // Return unencrypted if encryption is disabled
    }

    // Simple base64 encoding as placeholder
    // In production, this would use proper encryption
    try {
      return btoa(data);
    } catch (error) {
      logger.error('Failed to encrypt data', error);
      return data;
    }
  }

  async decryptSensitiveData(encryptedData: string): Promise<string> {
    if (!this.securitySettings.encryptSensitiveData) {
      return encryptedData;
    }

    // Simple base64 decoding as placeholder
    try {
      return atob(encryptedData);
    } catch (error) {
      logger.error('Failed to decrypt data', error);
      return encryptedData;
    }
  }
}

export const kindergartenSecurityService = KindergartenSecurityService.getInstance();