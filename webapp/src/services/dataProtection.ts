import { decryptJson, encryptJson, generateKeyBase64, sha256Base64 } from './cryptoUtils';

export interface GestureData {
  gestureClass: string;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface AnonymizedGestureData {
  gestureClass: string;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface StoredRecord {
  data: string;
  expires: number;
}

class GestureDataProtector {
  private encryptionKey: string | null = null;
  private keyPromise: Promise<string>;
  private readonly STORAGE_KEY = 'protectedGestures';
  private readonly KEY_ID = 'gestureEncryptionKey';

  constructor() {
    this.keyPromise = this.getOrCreateEncryptionKey();
  }

  private async getOrCreateEncryptionKey(): Promise<string> {
    const stored = localStorage.getItem(this.KEY_ID);
    if (stored) {
      this.encryptionKey = stored;
      return stored;
    }
    const generated = generateKeyBase64();
    localStorage.setItem(this.KEY_ID, generated);
    this.encryptionKey = generated;
    return generated;
  }

  private async getKey(): Promise<string> {
    if (!this.encryptionKey) {
      this.encryptionKey = await this.keyPromise;
    }
    return this.encryptionKey;
  }

  private async hashSessionId(sessionId: string): Promise<string> {
    return sha256Base64(sessionId);
  }

  private async anonymizeGestureData(data: GestureData): Promise<AnonymizedGestureData> {
    return {
      gestureClass: data.gestureClass,
      confidence: data.confidence,
      timestamp: Math.floor(data.timestamp / (24 * 60 * 60 * 1000)),
      sessionId: await this.hashSessionId(data.sessionId),
    };
  }

  private async encrypt(data: unknown): Promise<string> {
    const key = await this.getKey();
    return encryptJson(data, key);
  }

  private async decrypt(cipher: string): Promise<AnonymizedGestureData> {
    const key = await this.getKey();
    return decryptJson<AnonymizedGestureData>(cipher, key);
  }

  private async storeWithRetention(data: string, days: number): Promise<void> {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    let records: StoredRecord[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          records = parsed.filter((r) => typeof r?.expires === 'number' && typeof r?.data === 'string');
        }
      } catch (error) {
        console.warn('Gespeicherte geschützte Gesten konnten nicht geparst werden, verwende frische Liste.', error);
      }
    }
    records.push({ data, expires: Date.now() + days * 24 * 60 * 60 * 1000 });
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
  }

  async storeGesture(gestureData: GestureData): Promise<void> {
    const anonymized = await this.anonymizeGestureData(gestureData);
    const encrypted = await this.encrypt(anonymized);
    await this.storeWithRetention(encrypted, 30);
  }

  async cleanupExpiredData(): Promise<number> {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return 0;

    let records: StoredRecord[] = [];
    try {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Gespeicherte geschützte Gesten konnten nicht bereinigt werden.', error);
      return 0;
    }

    const now = Date.now();
    const validRecords = records.filter((record) => record.expires > now);

    const expiredCount = records.length - validRecords.length;
    if (expiredCount > 0) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(validRecords));
    }

    return expiredCount;
  }

  async decryptGesture(cipher: string): Promise<AnonymizedGestureData> {
    return this.decrypt(cipher);
  }
}

export const gestureDataProtector = new GestureDataProtector();
