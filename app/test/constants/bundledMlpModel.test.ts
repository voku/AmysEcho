import { createHash } from 'crypto';
import { unzipSync } from 'fflate';
import {
  BUNDLED_MLP_MODEL_BASE64,
  BUNDLED_MLP_MODEL_BYTES,
  BUNDLED_MLP_MODEL_SHA256,
} from '../../src/constants/bundledMlpModel';

function parseArrayData(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 10 || bytes[0] !== 0x93 || bytes[1] !== 0x4e || bytes[2] !== 0x55 || bytes[3] !== 0x4d) {
    throw new Error('Invalid NPY header');
  }
  const major = bytes[6];
  const minor = bytes[7];
  let headerLength: number;
  let dataOffset: number;
  if (major === 1 && minor === 0) {
    headerLength = bytes[8] | (bytes[9] << 8);
    dataOffset = 10 + headerLength;
  } else if (major === 2 && minor === 0) {
    headerLength = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
    dataOffset = 12 + headerLength;
  } else {
    throw new Error(`Unsupported NPY version ${major}.${minor}`);
  }
  return bytes.subarray(dataOffset);
}

function decodeUtf32leString(bytes: Uint8Array): string {
  let result = '';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const codePoint = view.getUint32(offset, true);
    if (codePoint === 0) {
      break;
    }
    result += String.fromCodePoint(codePoint);
  }
  return result;
}

describe('bundledMlpModel fallback payload', () => {
  const decoded = Buffer.from(BUNDLED_MLP_MODEL_BASE64, 'base64');
  const entries = unzipSync(new Uint8Array(decoded));

  it('matches the published metadata', () => {
    expect(decoded.byteLength).toBe(BUNDLED_MLP_MODEL_BYTES);
    const sha = createHash('sha256').update(decoded).digest('hex');
    expect(sha).toBe(BUNDLED_MLP_MODEL_SHA256);
  });

  it('contains the expected arrays with zeroed weights', () => {
    expect(new Set(Object.keys(entries))).toEqual(
      new Set(['labels.npy', 'counts.npy', 'w1.npy', 'b1.npy', 'w2.npy', 'b2.npy']),
    );

    const labelsData = parseArrayData(entries['labels.npy']);
    const labelWidthBytes = 64 * 4;
    const labels: string[] = [];
    for (let offset = 0; offset < labelsData.byteLength; offset += labelWidthBytes) {
      labels.push(decodeUtf32leString(labelsData.subarray(offset, offset + labelWidthBytes)));
    }
    expect(labels).toEqual([
      'alle',
      'blau',
      'essen',
      'fertig',
      'gelb',
      'gruen',
      'nochmal',
      'rot',
      'satt',
      'schwester',
      'spielen',
      'trinken',
    ]);

    const zeroArrays: Array<[string, number]> = [
      ['counts.npy', 12 * 4],
      ['w1.npy', 256 * 126 * 4],
      ['b1.npy', 256 * 4],
      ['w2.npy', 12 * 256 * 4],
      ['b2.npy', 12 * 4],
    ];
    for (const [name, expectedLength] of zeroArrays) {
      const data = parseArrayData(entries[name]);
      expect(data.byteLength).toBe(expectedLength);
      expect(data.every((value) => value === 0)).toBe(true);
    }
  });
});
