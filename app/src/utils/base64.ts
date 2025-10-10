const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(256).fill(255);

for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
  BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(i)] = i;
}

function sanitize(input: string): string {
  return input.replace(/\s+/g, '');
}

function toUint8Array(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const sanitized = sanitize(base64);
  if (sanitized.length === 0) {
    return new Uint8Array(0);
  }

  if (sanitized.length % 4 === 1) {
    throw new Error('Invalid base64 input length.');
  }

  const padding = (sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0);
  const outputLength = Math.floor((sanitized.length * 3) / 4) - padding;
  const output = new Uint8Array(outputLength);

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized.charCodeAt(i);
    if (sanitized[i] === '=') {
      break;
    }

    const value = BASE64_LOOKUP[char];
    if (value === 255) {
      throw new Error('Invalid character in base64 string.');
    }

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  if (index !== outputLength) {
    return output.slice(0, index);
  }

  return output;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToUint8Array(base64).buffer;
}

export function uint8ArrayToBase64(data: ArrayBuffer | ArrayBufferView): string {
  const bytes = toUint8Array(data);
  if (bytes.length === 0) {
    return '';
  }

  let base64 = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const byte2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const byte3 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

    const enc1 = (triplet >> 18) & 63;
    const enc2 = (triplet >> 12) & 63;
    const enc3 = (triplet >> 6) & 63;
    const enc4 = triplet & 63;

    base64 +=
      BASE64_ALPHABET[enc1] +
      BASE64_ALPHABET[enc2] +
      (i + 1 < bytes.length ? BASE64_ALPHABET[enc3] : '=') +
      (i + 2 < bytes.length ? BASE64_ALPHABET[enc4] : '=');
  }

  return base64;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(buffer);
}
