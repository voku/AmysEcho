import { arrayBufferToBase64, base64ToArrayBuffer, base64ToUint8Array, uint8ArrayToBase64 } from '../../src/utils/base64';

function toArrayBuffer(values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

describe('base64 utilities', () => {
  it('encodes and decodes round-trip for arbitrary data', () => {
    const original = Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const encoded = uint8ArrayToBase64(original);
    const decoded = base64ToUint8Array(encoded);

    expect(decoded).toEqual(original);
  });

  it('handles empty payloads', () => {
    expect(uint8ArrayToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0));
  });

  it('decodes array buffers correctly', () => {
    const source = toArrayBuffer([10, 20, 30]);
    const encoded = arrayBufferToBase64(source);
    const decoded = base64ToArrayBuffer(encoded);

    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(source));
  });

  it('rejects invalid characters', () => {
    expect(() => base64ToUint8Array('@@@')).toThrow('Ungültiges Zeichen in Base64-Zeichenkette.');
  });

  it('rejects invalid lengths', () => {
    expect(() => base64ToUint8Array('abcde')).toThrow('Ungültige Base64-Eingabelänge.');
  });
});
