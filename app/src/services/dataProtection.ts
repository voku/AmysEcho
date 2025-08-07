import AsyncStorage from '@react-native-async-storage/async-storage';

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

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

class GestureDataProtector {
  private encryptionKey: string;

  constructor() {
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  private getOrCreateEncryptionKey(): string {
    // In a real implementation this would be device specific
    return 'amys-echo-gesture-key';
  }

  private hashSessionId(sessionId: string): string {
    return sessionId.split('').reverse().join('');
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
    const json = JSON.stringify(data) + this.encryptionKey;
    return simpleHash(json);
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
}

export const gestureDataProtector = new GestureDataProtector();
