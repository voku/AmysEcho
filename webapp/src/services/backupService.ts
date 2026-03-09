import { decryptJson, encryptJson, generateKeyBase64 } from './cryptoUtils';
import { gestureDataProtector } from './dataProtection';
import { logger } from './logger';

const PROTECTED_GESTURES_KEY = 'protectedGestures';
const BACKUP_KEY_ID = 'protectedGesturesBackupKey';
const BACKUP_STORAGE_KEY = 'protectedGesturesBackupPayload';

export interface BackupArtifact {
  url: string;
  fileName: string;
}

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof (blob as Blob & { text?: () => Promise<string> }).text === 'function') {
    return (blob as Blob & { text: () => Promise<string> }).text();
  }
  return new Response(blob).text();
}

async function getOrCreateKey(): Promise<string> {
  const stored = localStorage.getItem(BACKUP_KEY_ID);
  if (stored) return stored;
  const generated = generateKeyBase64();
  localStorage.setItem(BACKUP_KEY_ID, generated);
  return generated;
}

function createDownload(payload: string, fileName: string, mime = 'application/octet-stream'): BackupArtifact {
  const blob = new Blob([payload], { type: mime });
  // Polyfill for test environments (e.g., jsdom) where Blob.text might be missing
  if (typeof (blob as any).text !== 'function') {
    (blob as any).text = async () => payload;
  }
  const url = URL.createObjectURL(blob);
  return { url, fileName };
}

export const backupService = {
  async backupProtectedGestures(): Promise<BackupArtifact | null> {
    const data = localStorage.getItem(PROTECTED_GESTURES_KEY);
    if (!data) {
      logger.info('No protected gestures found to backup.');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      logger.error('Invalid JSON data, backup not possible', error);
      throw new Error('Sicherung nicht möglich, Daten beschädigt.');
    }

    if (!Array.isArray(parsed)) {
      logger.error('Invalid data structure for backup');
      throw new Error('Sicherung nicht möglich, Daten beschädigt.');
    }

    const key = await getOrCreateKey();
    const cipher = await encryptJson(data, key);
    localStorage.setItem(BACKUP_STORAGE_KEY, cipher);
    logger.info('Backup of protected gestures created.');
    return createDownload(cipher, 'protectedGesturesBackup.dat');
  },

  async restoreProtectedGesturesFromCipher(cipher: string): Promise<boolean> {
    const key = await getOrCreateKey();
    let plain: string;
    try {
      plain = await decryptJson<string>(cipher, key);
    } catch (error) {
      logger.error('Failed to decrypt backup', error);
      return false;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(plain);
    } catch (error) {
      logger.error('Backup file contains invalid JSON', error);
      return false;
    }

    if (!Array.isArray(parsed)) {
      logger.error('Backup file contains invalid data structure');
      return false;
    }

    try {
      localStorage.setItem(BACKUP_STORAGE_KEY, cipher);
      localStorage.setItem(PROTECTED_GESTURES_KEY, plain);
      return true;
    } catch (error) {
      logger.error('Failed to save restored data', error);
      return false;
    }
  },

  async restoreProtectedGestures(): Promise<boolean> {
    const cipher = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!cipher) {
      logger.warn('No backup file found.');
      return false;
    }
    return this.restoreProtectedGesturesFromCipher(cipher);
  },

  async restoreProtectedGesturesFromFile(file: Blob): Promise<boolean> {
    const cipher = (await readBlobText(file)).trim();
    if (!cipher) {
      logger.warn('Backup file was empty.');
      return false;
    }
    return this.restoreProtectedGesturesFromCipher(cipher);
  },

  async exportProtectedGestures(): Promise<BackupArtifact | null> {
    const raw = localStorage.getItem(PROTECTED_GESTURES_KEY);
    if (!raw) {
      logger.info('No protected gestures found to export.');
      return null;
    }

    let records: unknown;
    try {
      records = JSON.parse(raw);
    } catch (error) {
      logger.error('Invalid JSON data, export not possible', error);
      throw new Error('Export nicht möglich, Daten beschädigt.');
    }

    if (!Array.isArray(records)) {
      logger.error('Invalid data structure for export');
      throw new Error('Export nicht möglich, Daten beschädigt.');
    }

    const decryptPromises = (records as any[]).map((r) =>
      typeof r?.data === 'string' ? gestureDataProtector.decryptGesture(r.data) : Promise.resolve(null),
    );

    const results = await Promise.allSettled(decryptPromises);
    const decrypted: any[] = [];
    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value) {
        decrypted.push(res.value);
      } else if (res.status === 'rejected') {
        logger.error('Failed to decrypt gesture', res.reason);
      }
    });

    const payload = JSON.stringify(decrypted, null, 2);
    logger.info('Export of protected gestures created.');
    return createDownload(payload, 'protectedGesturesExport.json', 'application/json');
  },
};

export type BackupService = typeof backupService;
