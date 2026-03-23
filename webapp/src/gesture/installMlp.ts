import { sendTelemetryEvent } from '../telemetry/sendTelemetryEvent';
import { prepareMultimodalForMLP, MULTIMODAL_FEATURES_SIZE, HAND_PRIORITY_FACTOR } from './utils/landmarkNormalizer';
import { enhancePredictionWithFeedback } from './performanceFeedback';
import { logger } from '../services/logger';
import type { MLPPrediction, PrototypePrediction } from './types/MediaPipeTypes';


export type ModelMetadata = {
  window_size?: number;
  input_dim?: number;
  arch?: string;
  feature_size?: number;
  audio_feature_size?: number;
  labels?: string[];
};

type ModelInputPlan = {
  windowSize: number;
  featuresPerFrame: number;
  isMultimodal: boolean;
};

type PrototypeBank = {
  vectors: Float32Array;
  shape: number[];
  labels: string[];
  support: Float32Array;
};

const PROTOTYPE_CONFIDENCE_FLOOR = 0.55;
const PROTOTYPE_BLEND_WEIGHT = 0.2;
export type MlpFeatureMode = 'absolute' | 'relative_delta';

export function buildWindowedVisualFeatures({
  rollingBuffer,
  currentFrameVec,
  windowSize,
  featureSizePerFrame,
  featureMode,
}: {
  rollingBuffer: Float32Array[];
  currentFrameVec: Float32Array;
  windowSize: number;
  featureSizePerFrame: number;
  featureMode: MlpFeatureMode;
}): Float32Array {
  const visualFeatures = new Float32Array(windowSize * featureSizePerFrame);
  const paddingFrame = rollingBuffer[rollingBuffer.length - 1] ?? currentFrameVec;

  for (let i = 0; i < windowSize; i++) {
    const frame = rollingBuffer[i] ?? paddingFrame;
    const offset = i * featureSizePerFrame;

    if (featureMode === 'relative_delta') {
      if (i === 0) {
        continue;
      }
      const previous = rollingBuffer[i - 1] ?? paddingFrame;
      for (let j = 0; j < featureSizePerFrame; j++) {
        visualFeatures[offset + j] = (frame[j] ?? 0) - (previous[j] ?? 0);
      }
      continue;
    }

    visualFeatures.set(frame, offset);
  }

  return visualFeatures;
}

export function installMlp(customModelData?: string): Promise<boolean> {
  type Tensor = { data: Float32Array; shape: number[] };
  type Landmark = readonly [number, number, number];
  type Hand = ReadonlyArray<Landmark>;
  type HandednessEntry = ReadonlyArray<{ categoryName: 'Left' | 'Right' }>;
  type Handedness = ReadonlyArray<HandednessEntry>;
  type MlpModel = {
    w1: Tensor;
    b1: Tensor;
    w2: Tensor;
    b2: Tensor;
    w3: Tensor;
    b3: Tensor;
    labels: string[];
    window_size?: number;
    input_dim?: number;
    audio_feature_size?: number;
    inferredInputPlan?: ModelInputPlan;
    prototypeBank?: PrototypeBank;
  };
  const forwardTelemetry = (event: string, data?: Record<string, unknown>) => {
    void sendTelemetryEvent(event, data ?? {}).catch((err) => {
      console.warn(`Failed to send '${event}' telemetry event:`, err);
    });
  };
  let mlp: MlpModel | null = null; // { w1,b1,w2,b2,w3,b3,labels }
  let WINDOW_SIZE = 30; // Default, will be updated from model metadata
  let rollingBuffer: Float32Array[] = [];
  let activeFeatureMode: MlpFeatureMode = 'absolute';

  function inferInputPlan(
    inputSize: number,
    metadataWindowSize: number | undefined,
    metadataAudioFeatureSize: number | undefined,
  ): ModelInputPlan {
    const audioFeatureSize = resolveAudioFeatureSize(metadataAudioFeatureSize);
    const visualInputSize = Math.max(0, inputSize - audioFeatureSize);
    const metadataWindow =
      typeof metadataWindowSize === 'number' && Number.isFinite(metadataWindowSize) && metadataWindowSize > 0
        ? Math.round(metadataWindowSize)
        : 0;

    if (metadataWindow > 0) {
      const featuresPerFrame = visualInputSize / metadataWindow;
      return {
        windowSize: metadataWindow,
        featuresPerFrame,
        isMultimodal: featuresPerFrame === MULTIMODAL_FEATURES_SIZE,
      };
    }

    const multimodalWindow = visualInputSize / MULTIMODAL_FEATURES_SIZE;
    if (Number.isInteger(multimodalWindow) && multimodalWindow > 0) {
      return {
        windowSize: multimodalWindow,
        featuresPerFrame: MULTIMODAL_FEATURES_SIZE,
        isMultimodal: true,
      };
    }

    const handOnlyWindow = visualInputSize / (21 * 2 * 3);
    if (Number.isInteger(handOnlyWindow) && handOnlyWindow > 0) {
      return {
        windowSize: handOnlyWindow,
        featuresPerFrame: 21 * 2 * 3,
        isMultimodal: false,
      };
    }

    return {
      windowSize: 1,
      featuresPerFrame: visualInputSize,
      isMultimodal: visualInputSize === MULTIMODAL_FEATURES_SIZE,
    };
  }

  function normalizeVector(vec: Float32Array): Float32Array | null {
    let squaredSum = 0;
    for (let i = 0; i < vec.length; i++) {
      const value = vec[i] ?? 0;
      squaredSum += value * value;
    }

    if (!Number.isFinite(squaredSum) || squaredSum <= 1e-12) {
      return null;
    }

    const norm = Math.sqrt(squaredSum);
    const normalized = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      normalized[i] = (vec[i] ?? 0) / norm;
    }
    return normalized;
  }

  function similarityToConfidence(similarity: number): number {
    if (!Number.isFinite(similarity) || similarity <= PROTOTYPE_CONFIDENCE_FLOOR) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(1, (similarity - PROTOTYPE_CONFIDENCE_FLOOR) / (1 - PROTOTYPE_CONFIDENCE_FLOOR)),
    );
  }

  function parseNPY(buf: Uint8Array) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (view.getUint8(0) !== 0x93) throw new Error('bad npy');
    const major = view.getUint8(6);
    view.getUint8(7); // read minor version for validation
    const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
    const headerStart = major === 1 ? 10 : 12;
    const headerBytes = buf.subarray(headerStart, headerStart + headerLen);
    const headerStr = new TextDecoder().decode(headerBytes);
    const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/);
    const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
    const shapeMatch = headerStr.match(/'shape':\s*\(([^\)]*)\)/);
    if (!dtypeMatch || !fortranMatch || !shapeMatch) throw new Error('npy header');
    const descr = dtypeMatch[1];
    if (!descr) {
      throw new Error('npy header missing descriptor');
    }
    const endian = descr[0];
    if (endian !== '<' && endian !== '|') {
      throw new Error('big-endian dtype not supported');
    }
    const fortran = fortranMatch[1] === 'True';
    const shapeCaptured = shapeMatch[1];
    if (shapeCaptured === undefined) {
      throw new Error('npy header missing shape');
    }
    const shapeStr = shapeCaptured.trim();
    let shape = shapeStr.length
      ? shapeStr
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : [1];
    const offset = headerStart + headerLen;
    const type = descr.slice(1);
    const size = shape.reduce((a, b) => a * b, 1);
    let data: Float32Array | string[];
    if (type === 'f8') {
      data = new Float32Array(new Float64Array(buf.buffer, buf.byteOffset + offset, size));
    } else if (type === 'f4') {
      data = new Float32Array(buf.buffer, buf.byteOffset + offset, size);
    } else if (type === 'f2') {
      const src = new Uint16Array(buf.buffer, buf.byteOffset + offset, size);
      data = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        const value = src[i] ?? 0;
        data[i] = f16ToF32(value);
      }
    } else if (type === 'i8') {
      data = new Float32Array(size);
      const dataView = new DataView(buf.buffer, buf.byteOffset + offset, size * 8);
      for (let i = 0; i < size; i++) {
        const value = Number(dataView.getBigInt64(i * 8, true));
        if (!Number.isSafeInteger(value)) {
          throw new Error('int64 value exceeds safe integer range');
        }
        data[i] = value;
      }
    } else if (type === 'i4') {
      const src = new Int32Array(buf.buffer, buf.byteOffset + offset, size);
      data = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = src[i] ?? 0;
      }
    } else if (type === 'i2') {
      const src = new Int16Array(buf.buffer, buf.byteOffset + offset, size);
      data = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = src[i] ?? 0;
      }
    } else if (type === 'u1') {
      const src = new Uint8Array(buf.buffer, buf.byteOffset + offset, size);
      data = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = src[i] ?? 0;
      }
    } else if (type.startsWith('U')) {
      const itemSize = parseInt(type.slice(1), 10);
      const raw = new Uint32Array(buf.buffer, buf.byteOffset + offset, size * itemSize);
      const out: string[] = [];
      for (let i = 0; i < size; i++) {
        const start = i * itemSize;
        let s = '';
        for (let j = 0; j < itemSize; j++) {
          const code = raw[start + j];
          if (!code) break;
          s += String.fromCodePoint(code);
        }
        out.push(s);
      }
      return { data: out, shape };
    } else {
      throw new Error('dtype ' + type);
    }
    if (fortran && shape.length === 2) {
      const rows = shape[0];
      const cols = shape[1];
      if (rows === undefined || cols === undefined) {
        throw new Error('Invalid shape for Fortran array');
      }
      const newData = new Float32Array(size);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const fromIndex = j * rows + i; // column-major read
          const toIndex = i * cols + j; // row-major write
          newData[toIndex] = (data as Float32Array)[fromIndex] ?? 0;
        }
      }
      data = newData;
    }
    return { data, shape };
  }

  // IEEE-754 half -> float conversion
  function f16ToF32(h: number): number {
    const s = (h & 0x8000) << 16;
    let e = (h & 0x7C00) >> 10;
    let f = h & 0x03FF;
    if (e === 0) {
      if (f === 0) return s ? -0 : 0;
      while ((f & 0x0400) === 0) { f <<= 1; e--; }
      e++;
      f &= ~0x0400;
    } else if (e === 0x1F) {
      const computedBits = s | 0x7F800000 | (f << 13);
      const view = new Float32Array(new Uint32Array([computedBits]).buffer);
      return view[0] ?? 0;
    }
    e = e + (127 - 15);
    const bits = s | (e << 23) | (f << 13);
    const view = new Float32Array(new Uint32Array([bits]).buffer);
    return view[0] ?? 0;
  }
  async function loadMlpFromB64(b64: string) {
    try {
      // Validate base64 input
      if (!b64 || typeof b64 !== 'string' || b64.length === 0) {
        throw new Error('Invalid base64 data: empty or not a string');
      }

      // Check if base64 data looks valid (basic validation)
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
        throw new Error('Invalid base64 format: contains invalid characters');
      }

      let bin: string;
      try {
        bin = atob(b64);
      } catch (e) {
        throw new Error('Failed to decode base64: ' + (e instanceof Error ? e.message : String(e)));
      }

      if (bin.length === 0) {
        throw new Error('Decoded base64 is empty');
      }

      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);

      const unzip = window.fflate?.unzip;
      if (!unzip) throw new Error('fflate unavailable');

      const files: Record<string, Uint8Array> = await new Promise((resolve, reject) => {
        unzip(u8, (err: any, data: Record<string, Uint8Array>) => {
          if (err) {
            // Provide more specific error messages for common issues
            if (err.code === 20) {
              reject(new Error('Invalid zip data: corrupted or incomplete file'));
            } else if (err.code === 13) {
              reject(new Error('Invalid zip data: not a valid zip archive'));
            } else {
              reject(new Error('Zip extraction failed: ' + (err.message || String(err))));
            }
          } else resolve(data);
        });
      });
      const entries = Object.keys(files);
      if (entries.length > 32) throw new Error('too many entries');
      const map: Record<string, Uint8Array> = {};
      for (const name of entries) {
        const file = files[name];
        if (file) {
          map[name.replace(/.*\//, '')] = file;
        }
      }
      function npzFind(m: Record<string, Uint8Array>, prefix: string) {
        const k = Object.keys(m).find((n) => n === prefix || n === prefix + '.npy');
        return k ? m[k] : undefined;
      }
      const w1b = npzFind(map, 'w1');
      const b1b = npzFind(map, 'b1');
      const w2b = npzFind(map, 'w2');
      const b2b = npzFind(map, 'b2');
      const w3b = npzFind(map, 'w3');
      const b3b = npzFind(map, 'b3');
      
      if (!w1b || !b1b || !w2b || !b2b || !w3b || !b3b) throw new Error('missing weights for 3-layer model');
      
      // Parse and validate model weights
      let w1, b1, w2, b2, w3, b3, labels: string[] = [];

       try {
         w1 = parseNPY(w1b);
         if (!w1.data || w1.shape.length !== 2) {
           throw new Error('Invalid w1 tensor: expected 2D array');
         }
       } catch (e) {
         throw new Error('Failed to parse w1 weights: ' + (e instanceof Error ? e.message : String(e)));
       }

      try {
        b1 = parseNPY(b1b);
        if (!b1.data || b1.shape.length !== 1) {
          throw new Error('Invalid b1 tensor: expected 1D array');
        }
      } catch (e) {
        throw new Error('Failed to parse b1 biases: ' + (e instanceof Error ? e.message : String(e)));
      }

       try {
         w2 = parseNPY(w2b);
         if (!w2.data || w2.shape.length !== 2) {
           throw new Error('Invalid w2 tensor: expected 2D array');
         }
       } catch (e) {
         throw new Error('Failed to parse w2 weights: ' + (e instanceof Error ? e.message : String(e)));
       }

      try {
        b2 = parseNPY(b2b);
        if (!b2.data || b2.shape.length !== 1) {
          throw new Error('Invalid b2 tensor: expected 1D array');
        }
      } catch (e) {
        throw new Error('Failed to parse b2 biases: ' + (e instanceof Error ? e.message : String(e)));
      }

      try {
        w3 = parseNPY(w3b);
        if (!w3.data || w3.shape.length !== 2) {
          throw new Error('Invalid w3 tensor: expected 2D array');
        }
      } catch (e) {
        throw new Error('Failed to parse w3 weights: ' + (e instanceof Error ? e.message : String(e)));
      }

     try {
       b3 = parseNPY(b3b);
       if (!b3.data || b3.shape.length !== 1) {
         throw new Error('Invalid b3 tensor: expected 1D array');
       }
     } catch (e) {
       throw new Error('Failed to parse b3 biases: ' + (e instanceof Error ? e.message : String(e)));
     }

      // Parse labels if available
      const lb = npzFind(map, 'labels');
      if (lb) {
        try {
          const parsed = parseNPY(lb);
          if (parsed.data && Array.isArray(parsed.data)) {
            labels = parsed.data as string[];
          } else {
            console.warn('Labels data is not an array, using empty labels');
            labels = [];
          }
        } catch (e) {
          console.warn('Failed to parse labels, using empty labels:', e);
          labels = [];
        }
      }

      // Parse metadata if available
      let window_size: number | undefined;
      let input_dim: number | undefined;
      let audio_feature_size: number | undefined;
      let prototypeBank: PrototypeBank | undefined;
      
      const wsb = npzFind(map, 'window_size');
      if (wsb) {
        try {
          const parsed = parseNPY(wsb);
          window_size = Number(parsed.data[0]);
        } catch (e) {
          console.warn('Failed to parse window_size:', e);
        }
      }

      const idb = npzFind(map, 'input_dim');
      if (idb) {
        try {
          const parsed = parseNPY(idb);
          input_dim = Number(parsed.data[0]);
        } catch (e) {
          console.warn('Failed to parse input_dim:', e);
        }
      }

      const afb = npzFind(map, 'audio_feature_size');
      if (afb) {
        try {
          const parsed = parseNPY(afb);
          audio_feature_size = Number(parsed.data[0]);
        } catch (e) {
          console.warn('Failed to parse audio_feature_size:', e);
        }
      }

      const prototypeVectorsBuffer = npzFind(map, 'prototype_vectors');
      const prototypeLabelsBuffer = npzFind(map, 'prototype_labels');
      const prototypeSupportBuffer = npzFind(map, 'prototype_support');
      if (prototypeVectorsBuffer && prototypeLabelsBuffer) {
        try {
          const parsedVectors = parseNPY(prototypeVectorsBuffer);
          const parsedLabels = parseNPY(prototypeLabelsBuffer);
          const parsedSupport = prototypeSupportBuffer ? parseNPY(prototypeSupportBuffer) : null;

          if (
            parsedVectors.data instanceof Float32Array &&
            parsedVectors.shape.length === 2 &&
            Array.isArray(parsedLabels.data)
          ) {
            const protoCount = parsedVectors.shape[0] ?? 0;
            const protoDim = parsedVectors.shape[1] ?? 0;
            const protoLabels = parsedLabels.data as string[];
            if (protoCount > 0 && protoDim > 0 && protoLabels.length === protoCount) {
              const protoSupport =
                parsedSupport?.data instanceof Float32Array && parsedSupport.shape[0] === protoCount
                  ? Float32Array.from(parsedSupport.data)
                  : new Float32Array(protoCount).fill(1);
              prototypeBank = {
                vectors: Float32Array.from(parsedVectors.data),
                shape: [protoCount, protoDim],
                labels: protoLabels,
                support: protoSupport,
              };
            }
          }
        } catch (e) {
          console.warn('Failed to parse prototype bank:', e);
        }
      }

      // Validate tensor dimensions for MLP compatibility
      const inputSize = w1.shape[1] ?? 0;
      const layer1Size = w1.shape[0];
      const layer2Size = w2.shape[0];
      const outputSize = w3.shape[0];

      if (b1.shape[0] !== layer1Size) {
        throw new Error(`Dimension mismatch: b1 has ${b1.shape[0]} but expected ${layer1Size}`);
      }
      if (w2.shape[1] !== layer1Size) {
        throw new Error(`Dimension mismatch: w2 input ${w2.shape[1]} doesn't match layer1 ${layer1Size}`);
      }
      if (b2.shape[0] !== layer2Size) {
        throw new Error(`Dimension mismatch: b2 has ${b2.shape[0]} but expected ${layer2Size}`);
      }
      if (w3.shape[1] !== layer2Size) {
        throw new Error(`Dimension mismatch: w3 input ${w3.shape[1]} doesn't match layer2 ${layer2Size}`);
      }
      if (b3.shape[0] !== outputSize) {
        throw new Error(`Dimension mismatch: b3 has ${b3.shape[0]} but expected ${outputSize}`);
      }

      const inferredInputPlan = inferInputPlan(inputSize, window_size, audio_feature_size);

      // Update temporal window parameters from model metadata or inferred structure
      WINDOW_SIZE = inferredInputPlan.windowSize;
      rollingBuffer = []; // Reset buffer with new window size
      
      logger.info(`MLP model loaded: ${inputSize} -> ${layer1Size} -> ${layer2Size} -> ${outputSize} (${labels.length} labels)`);
      logger.info(
        `Temporal config: window_size=${WINDOW_SIZE}, input_dim=${input_dim || inputSize}, multimodal=${inferredInputPlan.isMultimodal}`,
      );

      mlp = {
        w1: { data: Float32Array.from(w1.data as ArrayLike<number>), shape: w1.shape },
        b1: { data: Float32Array.from(b1.data as ArrayLike<number>), shape: b1.shape },
        w2: { data: Float32Array.from(w2.data as ArrayLike<number>), shape: w2.shape },
        b2: { data: Float32Array.from(b2.data as ArrayLike<number>), shape: b2.shape },
        w3: { data: Float32Array.from(w3.data as ArrayLike<number>), shape: w3.shape },
        b3: { data: Float32Array.from(b3.data as ArrayLike<number>), shape: b3.shape },
        labels,
        ...(window_size !== undefined ? { window_size } : {}),
        ...(input_dim !== undefined ? { input_dim } : {}),
        ...(audio_feature_size !== undefined ? { audio_feature_size } : {}),
        inferredInputPlan,
        ...(prototypeBank ? { prototypeBank } : {}),
      };
      return true;
    } catch (e: any) {
      console.warn('MLP load failed:', e?.message ?? e);
      forwardTelemetry('mlp_load_failed', { reason: e?.message ?? String(e) });
      mlp = null;
      return false;
    }
  }
  
  function relu(x: Float32Array) {
    for (let i = 0; i < x.length; i++) {
      const value = x[i] ?? 0;
      if (value < 0) {
        x[i] = 0;
      }
    }
    return x;
  }
  function softmax(x: Float32Array) {
    let max = -Infinity;
    for (let i = 0; i < x.length; i++) {
      const value = x[i] ?? -Infinity;
      if (value > max) max = value;
    }
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      const value = x[i] ?? 0;
      const expValue = Math.exp(value - max);
      x[i] = expValue;
      s += expValue;
    }
    const denom = s || 1;
    for (let i = 0; i < x.length; i++) {
      const current = x[i] ?? 0;
      x[i] = current / denom;
    }
    return x;
  }
  function affineMV(mat: Float32Array, rows: number, cols: number, vec: Float32Array, bias: Float32Array) {
    const out = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let c = 0; c < cols; c++) {
        const matValue = mat[r * cols + c] ?? 0;
        const vecValue = vec[c] ?? 0;
        sum += matValue * vecValue;
      }
      const biasValue = bias[r] ?? 0;
      out[r] = sum + biasValue;
    }
    return out;
  }
  const EMPTY_HAND = new Array(21).fill(0).map(() => [0, 0, 0] as const);

  function resolveAudioFeatureSize(metadataAudioFeatureSize?: number) {
    return metadataAudioFeatureSize !== undefined ? Math.max(0, metadataAudioFeatureSize) : 0;
  }

  function predictWithPrototypeBank(input: Float32Array): PrototypePrediction & { candidates: Array<{ label: string; score: number }> } | null {
    const bank = mlp?.prototypeBank;
    if (!bank) {
      return null;
    }

    const [rows, cols] = bank.shape;
    if (!rows || !cols || cols !== input.length) {
      return null;
    }

    const normalizedInput = normalizeVector(input);
    if (!normalizedInput) {
      return null;
    }

    const labelScores = new Map<string, { score: number; support: number; similarity: number }>();
    for (let row = 0; row < rows; row++) {
      let similarity = 0;
      const baseIndex = row * cols;
      for (let col = 0; col < cols; col++) {
        similarity += (bank.vectors[baseIndex + col] ?? 0) * (normalizedInput[col] ?? 0);
      }

      const confidence = similarityToConfidence(similarity);
      const label = bank.labels[row];
      if (!label) {
        continue;
      }

      const current = labelScores.get(label);
      if (!current || confidence > current.score) {
        labelScores.set(label, {
          score: confidence,
          support: bank.support[row] ?? 1,
          similarity,
        });
      }
    }

    const ranked = Array.from(labelScores.entries())
      .map(([label, data]) => ({
        label,
        score: data.score,
        support: data.support,
        similarity: data.similarity,
      }))
      .sort((a, b) => b.score - a.score);

    const top = ranked[0];
    if (!top || top.score <= 0) {
      return null;
    }

    return {
      label: top.label,
      score: top.score,
      support: top.support,
      similarity: top.similarity,
      candidates: ranked.map(({ label, score }) => ({ label, score })),
    };
  }

  function normalizeLandmarks(all: Hand[], handednesses: Handedness, poseLandmarks?: number[][], faceLandmarks?: number[][]) {
    const inferredPlan = mlp?.inferredInputPlan;
    const isMultimodalInModel = inferredPlan?.isMultimodal ?? false;
    
    let frameFeatures: Float32Array;
    
    if (isMultimodalInModel) {
      // Convert Hand[] to number[][] format (42 points for left+right hands)
      const leftHandIndex = handednesses?.findIndex(
        (h) => h?.[0]?.categoryName === 'Left',
      );
      const rightHandIndex = handednesses?.findIndex(
        (h) => h?.[0]?.categoryName === 'Right',
      );
      
      const leftHand = leftHandIndex > -1 ? all[leftHandIndex] ?? null : null;
      const rightHand = rightHandIndex > -1 ? all[rightHandIndex] ?? null : null;
      
      // Convert to number[][] format: [point0, point1, ...] where each point is [x,y,z]
      const handsFlat: number[][] = [];
      
      // Add left hand (21 points)
      for (let i = 0; i < 21; i++) {
        const point = leftHand?.[i];
        handsFlat.push(point ? [point[0], point[1], point[2]] : [0, 0, 0]);
      }
      
      // Add right hand (21 points)
      for (let i = 0; i < 21; i++) {
        const point = rightHand?.[i];
        handsFlat.push(point ? [point[0], point[1], point[2]] : [0, 0, 0]);
      }
      
      frameFeatures = prepareMultimodalForMLP(handsFlat, poseLandmarks, faceLandmarks);
    } else {
      // Use hand-only normalization (legacy)
      const flat = new Float32Array(21 * 2 * 3);
      function normHand(hand: Hand | null): Hand | null {
        if (!hand || hand.length < 21) return null;
        const wrist = hand[0];
        if (!wrist) return null;
        const [wx = 0, wy = 0, wzRaw = 0] = wrist;
        const centered = hand.map((p) => {
          const [x = 0, y = 0, z = 0] = p ?? [0, 0, 0];
          return [x - wx, y - wy, z - wzRaw] as const;
        });
        const maxd = centered.reduce(
          (currentMax, [x, y, z]) => Math.max(currentMax, Math.abs(x) + Math.abs(y) + Math.abs(z)),
          0,
        );
        if (maxd === 0) return null;
        return centered.map(([x, y, z]) => [x / maxd, y / maxd, z / maxd] as const);
      }

      const leftHandIndex = handednesses?.findIndex((h) => h?.[0]?.categoryName === 'Left');
      const rightHandIndex = handednesses?.findIndex((h) => h?.[0]?.categoryName === 'Right');

      const leftHand = leftHandIndex > -1 ? all[leftHandIndex] ?? null : null;
      const rightHand = rightHandIndex > -1 ? all[rightHandIndex] ?? null : null;

      const left = normHand(leftHand) ?? EMPTY_HAND;
      const right = normHand(rightHand) ?? EMPTY_HAND;
      const both = [...left, ...right];
      let k = 0;
      for (const p of both) {
        const [px = 0, py = 0, pz = 0] = p ?? [0, 0, 0];
        flat[k++] = px * HAND_PRIORITY_FACTOR; // Apply priority factor matching backend
        flat[k++] = py * HAND_PRIORITY_FACTOR;
        flat[k++] = pz * HAND_PRIORITY_FACTOR;
      }
      frameFeatures = flat;
    }
    return frameFeatures;
  }

  function mlpPredict(
    all: Hand[],
    handednesses: Handedness,
    poseLandmarks?: number[][],
    faceLandmarks?: number[][],
    audioFeatures?: Float32Array
  ) {
    const startTime = performance.now();
    try {
      if (!mlp) return null;
      
      // 1. Normalize current frame (visual features)
      const currentFrameVec = normalizeLandmarks(all, handednesses, poseLandmarks, faceLandmarks);
      
      // 2. Determine if model expects multimodal input
      const windowSize = mlp.inferredInputPlan?.windowSize ?? mlp.window_size ?? WINDOW_SIZE;
      const audioFeatureSize = resolveAudioFeatureSize(mlp.audio_feature_size);
      // A model is considered multimodal (with audio) if it has audio features.
      const isMultimodalModel = audioFeatureSize > 0;
      
      // 3. Manage rolling buffer (visual features only - audio added later per window)
      rollingBuffer.push(currentFrameVec);
      if (rollingBuffer.length > windowSize) {
        rollingBuffer.shift();
      }
      
      // 4. Prepare input vector: flatten rolling buffer + add audio features once per window
      const [rows1, cols1Expected] = mlp.w1.shape;
      if (rows1 === undefined || cols1Expected === undefined || rows1 === 0) {
        throw new Error('Invalid w1 shape');
      }

      let x: Float32Array;
      
      // Determine actual feature size per frame from current frame
      const featureSizePerFrame = mlp.inferredInputPlan?.featuresPerFrame ?? currentFrameVec.length;
      
      // Check if this is a temporal model or static model
      // Use actual feature size instead of MULTIMODAL_FEATURES_SIZE constant for flexibility
      const actualExpectedVisualSize = windowSize * featureSizePerFrame;
      const actualExpectedMultimodalSize = actualExpectedVisualSize + audioFeatureSize;
      const isTemporal = cols1Expected === actualExpectedVisualSize || cols1Expected === actualExpectedMultimodalSize;
      
      if (isTemporal) {
        // Temporal model: flatten rolling buffer (window_size can be 1)
        const visualFeatures = buildWindowedVisualFeatures({
          rollingBuffer,
          currentFrameVec,
          windowSize,
          featureSizePerFrame,
          featureMode: activeFeatureMode,
        });
        // Match server-side short-clip padding by repeating the latest observed frame
        // instead of introducing zero-only prefixes that bias startup toward _NULL_.

        // Add audio features ONCE per window if multimodal model
        // This matches server training: [visual_window | audio] not [visual+audio] per frame
        if (isMultimodalModel) {
          const audioToAdd = audioFeatures && audioFeatures.length === audioFeatureSize
            ? audioFeatures
            : new Float32Array(audioFeatureSize); // Zero-padding if no audio

          // Concatenate: [flattened_visual_features | audio_features]
          const multimodalFeatures = new Float32Array(visualFeatures.length + audioFeatureSize);
          multimodalFeatures.set(visualFeatures, 0);
          multimodalFeatures.set(audioToAdd, visualFeatures.length);

          x = multimodalFeatures;
        } else {
          x = visualFeatures;
        }
      } else {
        // Static model: use current frame only
        x = currentFrameVec;
      }
      
      const inputDim = x.length;
      
      // Verify input dimension matches model expectations
      if (cols1Expected !== inputDim) {
        throw new Error(`Input dimension mismatch: expected ${cols1Expected}, got ${inputDim}`);
      }
      
      // Skip prediction if current frame has no hands (check last frame in buffer, not padding)
      if (currentFrameVec.every(v => v === 0)) return null;
      
      const cols1 = x.length;
      
      const b1Shape = mlp.b1.shape[0];
      if (b1Shape === undefined || b1Shape !== rows1) throw new Error('b1 dimension mismatch');
      
      // Layer 1: Input -> 1024
      const z1 = affineMV(mlp.w1.data, rows1, cols1, x, mlp.b1.data);
      const a1 = relu(z1);
      
      // Layer 2: 1024 -> 512
      const [rows2Raw, cols2] = mlp.w2.shape;
      const rows2 = rows2Raw ?? 0;
      if (cols2 === undefined || rows2 === 0) throw new Error('Invalid w2 shape');
      if (cols2 !== a1.length) throw new Error('Layer 2 input size mismatch');
      
      const z2 = affineMV(mlp.w2.data, rows2, cols2, a1, mlp.b2.data);
      const a2 = relu(z2);
      
      // Layer 3: 512 -> Output
      const [rows3Raw, cols3] = mlp.w3.shape;
      const rows3 = rows3Raw ?? 0;
      if (cols3 === undefined || rows3 === 0) throw new Error('Invalid w3 shape');
      if (cols3 !== a2.length) throw new Error('Layer 3 input size mismatch');
      
      const z3 = affineMV(mlp.w3.data, rows3, cols3, a2, mlp.b3.data);
      const probs = softmax(z3);
      
      let bestI = 0;
      let best = probs[0] ?? -Infinity;
      for (let i = 1; i < probs.length; i++) {
        const value = probs[i] ?? -Infinity;
        if (value > best) {
          best = value;
          bestI = i;
        }
      }
      if (!Number.isFinite(best)) {
        return null;
      }
      const labels = mlp?.labels ?? [];
      const mlpLabel = labels[bestI] ?? String(bestI);
      const rankedMlpCandidates = Array.from(probs)
        .map((score, index) => ({
          label: labels[index] ?? String(index),
          score,
        }))
        .sort((a, b) => b.score - a.score);
      const prototypePrediction = predictWithPrototypeBank(x);
      const combinedScores = new Map<string, number>();

      for (const candidate of rankedMlpCandidates) {
        combinedScores.set(candidate.label, candidate.score);
      }

      if (prototypePrediction) {
        for (const candidate of prototypePrediction.candidates) {
          const currentScore = combinedScores.get(candidate.label) ?? 0;
          const prototypeBoost = candidate.score + ((currentScore > 0 && currentScore < 1)
            ? Math.min(1 - candidate.score, currentScore * PROTOTYPE_BLEND_WEIGHT)
            : 0);
          combinedScores.set(candidate.label, Math.max(currentScore, prototypeBoost));
        }
      }

      const rankedCandidates = Array.from(combinedScores.entries())
        .map(([label, score]) => ({ label, score }))
        .sort((a, b) => b.score - a.score);
      const topCandidate = rankedCandidates[0];
      if (!topCandidate) {
        return null;
      }

      // Suppress detection if the top candidate is the explicit NULL class
      if (topCandidate.label === '_NULL_') {
        return null;
      }

      // Filter NULL from candidates list to avoid showing it in UI/debug panels
      const uiCandidates = rankedCandidates.filter((c) => c.label !== '_NULL_');

      const prediction: MLPPrediction = {
        label: topCandidate.label,
        score: topCandidate.score,
        candidates: uiCandidates,
        mlpScore: best,
        prototype: prototypePrediction
          ? {
              label: prototypePrediction.label,
              score: prototypePrediction.score,
              ...(prototypePrediction.support !== undefined ? { support: prototypePrediction.support } : {}),
              ...(prototypePrediction.similarity !== undefined ? { similarity: prototypePrediction.similarity } : {}),
            }
          : null,
        source: prototypePrediction
          ? (prototypePrediction.label === mlpLabel ? 'hybrid' : (prototypePrediction.score > best ? 'prototype' : 'mlp'))
          : 'mlp',
      };

      // Record prediction for performance feedback
      enhancePredictionWithFeedback(prediction, performance.now() - startTime);
      
      return prediction;
    } catch (e) {
      console.warn('MLP prediction failed:', e);
      return null;
    }
  }
  window.__setMlpModelB64 = async (b64: string) => {
    activeFeatureMode = window.__mlpFeatureMode === 'relative_delta' ? 'relative_delta' : 'absolute';
    const ok = await loadMlpFromB64(b64);
    if (ok) {
      forwardTelemetry('mlp_loaded');
    }
    return ok;
  };
  window.__mlpPredict = mlpPredict as any;
  let transferBuf = '';
  let transferStart = 0;
  let transferLock = false;
  window.__beginMlpTransfer = () => {
    if (transferLock) return false;
    transferLock = true;
    transferBuf = '';
    transferStart = performance.now();
    return true;
  };
  window.__pushMlpChunk = (chunk: string) => {
    if (!transferLock) return;
    transferBuf += chunk;
  };
  window.__commitMlpTransfer = async () => {
    const active = transferLock;
    const bytes = transferBuf.length;
    const start = transferStart;
    try {
      if (active) {
        if (typeof window.__setMlpModelB64 !== 'function') {
          forwardTelemetry('mlp_transfer_failed', { reason: 'setter_missing' });
          return;
        }
        const loadPromise = window.__setMlpModelB64(transferBuf);
        const ms = Math.round(performance.now() - start);
        forwardTelemetry('mlp_transfer', { bytes, ms });
        await loadPromise;
      } else {
        forwardTelemetry('mlp_transfer_skipped');
      }
    } catch (err) {
      console.warn('mlp_transfer failed:', err);
    } finally {
      transferBuf = '';
      transferStart = 0;
      transferLock = false;
      forwardTelemetry('mlp_transfer_complete');
    }
  };

  // Initial model loading orchestration
  return (async () => {
    // Try custom model data first (for profile models)
    if (customModelData) {
      // Resolve activeFeatureMode from global state before loading,
      // same as __setMlpModelB64 does, to avoid stale feature mode.
      activeFeatureMode = window.__mlpFeatureMode === 'relative_delta' ? 'relative_delta' : 'absolute';
      if (await loadMlpFromB64(customModelData)) {
        forwardTelemetry('mlp_custom_loaded', { size: customModelData.length });
        return true;
      }
      console.warn('Failed to load provided custom model data');
    }

    // Server model fetching is handled by useMlpModelInjection with auth/token refresh.
    // This runtime bootstrap intentionally avoids unauthenticated background requests.
    return false;
  })();
}
