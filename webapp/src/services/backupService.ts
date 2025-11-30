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
      logger.info('Keine geschützten Gesten zum Sichern gefunden.');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      logger.error('Ungültige JSON-Daten, Sicherung nicht möglich', error);
      throw new Error('Sicherung nicht möglich, Daten beschädigt');
    }

    if (!Array.isArray(parsed)) {
      logger.error('Ungültige Datenstruktur für Sicherung');
      throw new Error('Sicherung nicht möglich, Daten beschädigt');
    }

    const key = await getOrCreateKey();
    const cipher = await encryptJson(data, key);
    localStorage.setItem(BACKUP_STORAGE_KEY, cipher);
    logger.info('Sicherung der geschützten Gesten erstellt.');
    return createDownload(cipher, 'protectedGesturesBackup.dat');
  },

  async restoreProtectedGestures(): Promise<boolean> {
    const cipher = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!cipher) {
      logger.warn('Keine Sicherungsdatei gefunden.');
      return false;
    }

    const key = await getOrCreateKey();
    let plain: string;
    try {
      plain = await decryptJson<string>(cipher, key);
    } catch (error) {
      logger.error('Entschlüsselung der Sicherung fehlgeschlagen', error);
      return false;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(plain);
    } catch (error) {
      logger.error('Sicherungsdatei enthält ungültiges JSON', error);
      return false;
    }

    if (!Array.isArray(parsed)) {
      logger.error('Sicherungsdatei enthält ungültige Datenstruktur');
      return false;
    }

    try {
      localStorage.setItem(PROTECTED_GESTURES_KEY, plain);
      return true;
    } catch (error) {
      logger.error('Wiederherstellung konnte nicht gespeichert werden', error);
      return false;
    }
  },

  async exportProtectedGestures(): Promise<BackupArtifact | null> {
    const raw = localStorage.getItem(PROTECTED_GESTURES_KEY);
    if (!raw) {
      logger.info('Keine geschützten Gesten zum Exportieren gefunden.');
      return null;
    }

    let records: unknown;
    try {
      records = JSON.parse(raw);
    } catch (error) {
      logger.error('Ungültige JSON-Daten, Export nicht möglich', error);
      throw new Error('Export nicht möglich, Daten beschädigt');
    }

    if (!Array.isArray(records)) {
      logger.error('Ungültige Datenstruktur für Export');
      throw new Error('Export nicht möglich, Daten beschädigt');
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
        logger.error('Gesten konnten nicht entschlüsselt werden', res.reason);
      }
    });

    const payload = JSON.stringify(decrypted, null, 2);
    logger.info('Export der geschützten Gesten erstellt.');
    return createDownload(payload, 'protectedGesturesExport.json', 'application/json');
  },
};

export type BackupService = typeof backupService;
