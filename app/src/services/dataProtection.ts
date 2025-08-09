import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

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

class GestureDataProtector {
  private encryptionKey: string | null = null;
  private keyPromise: Promise<string>;

  constructor() {
    this.keyPromise = this.getOrCreateEncryptionKey();
  }

  private async getOrCreateEncryptionKey(): Promise<string> {
    let key = await SecureStore.getItemAsync('gestureEncryptionKey');
    if (!key) {
      key = CryptoJS.lib.WordArray.random(32).toString();
      await SecureStore.setItemAsync('gestureEncryptionKey', key);
    }
    this.encryptionKey = key;
    return key as string;
  }

  private async getKey(): Promise<string> {
    if (!this.encryptionKey) {
      this.encryptionKey = await this.keyPromise;
    }
    return this.encryptionKey;
  }

  private hashSessionId(sessionId: string): string {
    return CryptoJS.SHA256(sessionId).toString();
  }

  private anonymizeGestureData(data: GestureData): AnonymizedGestureData {
    return {
      gestureClass: data.gestureClass,
      confidence: data.confidence,
      timestamp: Math.floor(data.timestamp / (24 * 60 * 60 * 1000)),
      sessionId: this.hashSessionId(data.sessionId),
    };
  }

  private async encrypt(data: any): Promise<string> {
    const key = await this.getKey();
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  }

  private async decrypt(cipher: string): Promise<AnonymizedGestureData> {
    const key = await this.getKey();
    const bytes = CryptoJS.AES.decrypt(cipher, key);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  }

  private async storeWithRetention(data: string, days: number): Promise<void> {
    const raw = await AsyncStorage.getItem('protectedGestures');
    const records = raw ? JSON.parse(raw) : [];
    records.push({ data, expires: Date.now() + days * 24 * 60 * 60 * 1000 });
    await AsyncStorage.setItem('protectedGestures', JSON.stringify(records));
  }

  async storeGesture(gestureData: GestureData): Promise<void> {
    const anonymized = this.anonymizeGestureData(gestureData);
    const encrypted = await this.encrypt(anonymized);
    await this.storeWithRetention(encrypted, 30);
  }

  // Exposed for testing to verify anonymization
  async decryptGesture(cipher: string): Promise<AnonymizedGestureData> {
    return this.decrypt(cipher);
  }
}

export const gestureDataProtector = new GestureDataProtector();
