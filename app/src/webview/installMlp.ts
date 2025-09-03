export function installMlp() {
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
    labels: string[];
  };
  let mlp: MlpModel | null = null; // { w1,b1,w2,b2,labels }
  function parseNPY(buf: Uint8Array) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (view.getUint8(0) !== 0x93) throw new Error('bad npy');
    const major = view.getUint8(6);
    const _minor = view.getUint8(7); // unused but kept for completeness
    const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
    const headerStart = major === 1 ? 10 : 12;
    const headerBytes = buf.subarray(headerStart, headerStart + headerLen);
    const headerStr = new TextDecoder().decode(headerBytes);
    const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/);
    const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
    const shapeMatch = headerStr.match(/'shape':\s*\(([^\)]*)\)/);
    if (!dtypeMatch || !fortranMatch || !shapeMatch) throw new Error('npy header');
    const descr = dtypeMatch[1];
    const endian = descr[0];
    if (endian !== '<' && endian !== '|') {
      throw new Error('big-endian dtype not supported');
    }
    const fortran = fortranMatch[1] === 'True';
    const shapeStr = shapeMatch[1].trim();
    const shape = shapeStr.length
      ? shapeStr
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : [1];
    const offset = headerStart + headerLen;
    const type = descr.slice(1);
    if (fortran) throw new Error('fortran not supported');
    const size = shape.reduce((a, b) => a * b, 1);
    if (type === 'f8') {
      return { data: new Float64Array(buf.buffer, buf.byteOffset + offset, size), shape };
    }
    if (type === 'f4') {
      return { data: new Float32Array(buf.buffer, buf.byteOffset + offset, size), shape };
    }
    if (type === 'f2') {
      const src = new Uint16Array(buf.buffer, buf.byteOffset + offset, size);
      const out = new Float32Array(size);
      for (let i = 0; i < size; i++) out[i] = f16ToF32(src[i]);
      return { data: out, shape };
    }
    if (type === 'i4') {
      return { data: new Int32Array(buf.buffer, buf.byteOffset + offset, size), shape };
    }
    if (type === 'i2') {
      return { data: new Int16Array(buf.buffer, buf.byteOffset + offset, size), shape };
    }
    if (type === 'u1') {
      return { data: new Uint8Array(buf.buffer, buf.byteOffset + offset, size), shape };
    }
    if (type.startsWith('U')) {
      const itemSize = parseInt(type.slice(1), 10);
      const raw = new Uint32Array(buf.buffer, buf.byteOffset + offset, size * itemSize);
      const out: string[] = [];
      for (let i = 0; i < size; i++) {
        const start = i * itemSize;
        let s = '';
        for (let j = 0; j < itemSize; j++) {
          const code = raw[start + j];
          if (code === 0) break;
          s += String.fromCodePoint(code);
        }
        out.push(s);
      }
      return { data: out, shape };
    }
    throw new Error('dtype ' + type);
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
      const bits = s | 0x7F800000 | (f << 13);
      return new Float32Array(new Uint32Array([bits]).buffer)[0];
    }
    e = e + (127 - 15);
    const bits = s | (e << 23) | (f << 13);
    return new Float32Array(new Uint32Array([bits]).buffer)[0];
  }
  async function loadMlpFromB64(b64: string) {
    try {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const unzip = window.fflate?.unzip;
      if (!unzip) throw new Error('fflate unavailable');
      const files: Record<string, Uint8Array> = await new Promise((resolve, reject) => {
        unzip(u8, (err: any, data: Record<string, Uint8Array>) => {
          if (err) reject(err); else resolve(data);
        });
      });
      const entries = Object.keys(files);
      if (entries.length > 32) throw new Error('too many entries');
      const map: Record<string, Uint8Array> = {};
      for (const name of entries) {
        map[name.replace(/.*\//, '')] = files[name];
      }
      function npzFind(m: Record<string, Uint8Array>, prefix: string) {
        const k = Object.keys(m).find((n) => n === prefix || n === prefix + '.npy');
        return k ? m[k] : undefined;
      }
      const w1b = npzFind(map, 'w1');
      const b1b = npzFind(map, 'b1');
      const w2b = npzFind(map, 'w2');
      const b2b = npzFind(map, 'b2');
      if (!w1b || !b1b || !w2b || !b2b) throw new Error('missing weights');
      const w1 = parseNPY(w1b);
      const b1 = parseNPY(b1b);
      const w2 = parseNPY(w2b);
      const b2 = parseNPY(b2b);
      let labels: string[] = [];
      const lb = npzFind(map, 'labels');
      if (lb) {
        const parsed = parseNPY(lb);
        labels = parsed.data as string[];
      }
      mlp = {
        w1: { data: Float32Array.from(w1.data as ArrayLike<number>), shape: w1.shape },
        b1: { data: Float32Array.from(b1.data as ArrayLike<number>), shape: b1.shape },
        w2: { data: Float32Array.from(w2.data as ArrayLike<number>), shape: w2.shape },
        b2: { data: Float32Array.from(b2.data as ArrayLike<number>), shape: b2.shape },
        labels,
      };
      return true;
    } catch (e: any) {
      console.warn('MLP load failed:', e?.message ?? e);
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'telemetry',
            event: 'mlp_load_failed',
            reason: e?.message ?? String(e),
          })
        );
      } catch (err) {
        console.warn("Failed to send 'mlp_load_failed' telemetry event:", err);
      }
      mlp = null;
      return false;
    }
  }
  function relu(x: Float32Array) {
    for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
    return x;
  }
  function softmax(x: Float32Array) {
    let max = -Infinity;
    for (let i = 0; i < x.length; i++) if (x[i] > max) max = x[i];
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      x[i] = Math.exp(x[i] - max);
      s += x[i];
    }
    for (let i = 0; i < x.length; i++) {
      x[i] /= s;
    }
    return x;
  }
  function affineMV(mat: Float32Array, rows: number, cols: number, vec: Float32Array, bias: Float32Array) {
    const out = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let c = 0; c < cols; c++) sum += mat[r * cols + c] * vec[c];
      out[r] = sum + bias[r];
    }
    return out;
  }
  const EMPTY_HAND = new Array(21).fill(0).map(() => [0, 0, 0] as const);

  function normalizeLandmarks(all: Hand[], handednesses: Handedness) {
    const flat = new Float32Array(21 * 2 * 3);
    function normHand(hand: Hand | null): Hand | null {
      if (!hand || hand.length < 21) return null;
      const [wx, wy, wz] = hand[0];
      const centered = hand.map(
        (p) => [p[0] - wx, p[1] - wy, p[2] - wz] as const,
      );
      const maxd = centered.reduce(
        (currentMax, [x, y, z]) =>
          Math.max(currentMax, Math.abs(x) + Math.abs(y) + Math.abs(z)),
        0,
      );
      if (maxd === 0) return null;
      return centered.map(
        ([x, y, z]) => [x / maxd, y / maxd, z / maxd] as const,
      );
    }

    const leftHandIndex = handednesses?.findIndex(
      (h) => h?.[0]?.categoryName === 'Left',
    );
    const rightHandIndex = handednesses?.findIndex(
      (h) => h?.[0]?.categoryName === 'Right',
    );

    const leftHand = leftHandIndex > -1 ? all[leftHandIndex] : null;
    const rightHand = rightHandIndex > -1 ? all[rightHandIndex] : null;

    const left = normHand(leftHand) ?? EMPTY_HAND;
    const right = normHand(rightHand);
    const r = right ?? EMPTY_HAND;
    const both = left.concat(r);
    let k = 0;
    for (const p of both) {
      flat[k++] = p[0];
      flat[k++] = p[1];
      flat[k++] = p[2];
    }
    return flat;
  }
  function mlpPredict(all: Hand[], handednesses: Handedness) {
    if (!mlp) return null;
    const x = normalizeLandmarks(all, handednesses);
    if (!x) return null;
    const cols1 = x.length;
    if (mlp.w1.shape[1] !== cols1) throw new Error('Input dimension mismatch');
    const rows1 = mlp.w1.shape[0];
    if (mlp.b1.shape[0] !== rows1) throw new Error('b1 dimension mismatch');
    const z1 = affineMV(mlp.w1.data, rows1, cols1, x, mlp.b1.data);
    const a1 = relu(z1);
    const rows2 = mlp.w2.shape[0];
    const cols2 = mlp.w2.shape[1];
    if (cols2 !== a1.length) throw new Error('Hidden layer size mismatch');
    if (mlp.b2.shape[0] !== rows2) throw new Error('b2 dimension mismatch');
    const z2 = affineMV(mlp.w2.data, rows2, cols2, a1, mlp.b2.data);
    const probs = softmax(z2);
    let bestI = 0;
    let best = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > best) {
        best = probs[i];
        bestI = i;
      }
    }
    const label = mlp.labels?.[bestI] ?? String(bestI);
    return { label, score: best };
  }
  window.__setMlpModelB64 = async (b64: string) => {
    const ok = await loadMlpFromB64(b64);
    if (ok) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'mlp_loaded' })
        );
      } catch (e) {
        console.warn("Failed to send 'mlp_loaded' telemetry event:", e);
      }
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
        if (!window.__setMlpModelB64) {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: 'telemetry',
              event: 'mlp_transfer_failed',
              reason: 'setter_missing',
            }),
          );
          return;
        }
        const ms = Math.round(performance.now() - start);
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'mlp_transfer', bytes, ms })
        );
        await window.__setMlpModelB64(transferBuf);
      } else {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_skipped' })
        );
      }
    } catch (err) {
      console.warn('mlp_transfer failed:', err);
    } finally {
      transferBuf = '';
      transferStart = 0;
      transferLock = false;
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_complete' }),
        );
      } catch (e) {
        console.warn(
          "Failed to send 'mlp_transfer_complete' telemetry event:",
          e,
        );
      }
    }
  };
}
