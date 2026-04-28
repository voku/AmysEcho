const encoder = new TextEncoder();

type Base64Encoder = (data: string) => string;
type Base64Decoder = (data: string) => string;

const getBtoa = (): Base64Encoder => {
  if (typeof btoa === 'function') {
    return btoa;
  }
  return (data: string) => Buffer.from(data, 'binary').toString('base64');
};

const getAtob = (): Base64Decoder => {
  if (typeof atob === 'function') {
    return atob;
  }
  return (data: string) => Buffer.from(data, 'base64').toString('binary');
};

const btoaImpl = getBtoa();
const atobImpl = getAtob();

export function generateKeyBase64(): string {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoaImpl(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atobImpl(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(base64Key);
  // Cast to BufferSource to satisfy TypeScript while maintaining runtime compatibility
  return crypto.subtle.importKey('raw', keyBytes as unknown as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sha256Base64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToBase64(new Uint8Array(digest));
}

export async function encryptJson<T>(payload: T, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)));
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuffer))}`;
}

export async function decryptJson<T>(cipherText: string, base64Key: string): Promise<T> {
  const [ivBase64, payloadBase64] = cipherText.split(':');
  if (!ivBase64 || !payloadBase64) {
    throw new Error('Invalid cipher format');
  }
  const key = await importAesKey(base64Key);
  const iv = base64ToBytes(ivBase64);
  const payloadBytes = base64ToBytes(payloadBase64);
  // Cast to BufferSource to satisfy TypeScript while maintaining runtime compatibility
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, payloadBytes as unknown as BufferSource);
  const text = new TextDecoder().decode(plainBuffer);
  return JSON.parse(text) as T;
}
