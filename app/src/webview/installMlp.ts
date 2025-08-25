export function installMlp() {
  const loadFflate = () =>
    new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/fflate/umd/index.min.js';
      s.onload = () => res(null);
      s.onerror = () => rej(new Error('fflate load failed'));
      document.head.appendChild(s);
    });
  type MlpModel = {
    w1: Float64Array;
    b1: Float64Array;
    w2: Float64Array;
    b2: Float64Array;
    labels: string[];
  };
  let mlp: MlpModel | null = null; // { w1,b1,w2,b2,labels }
  const maxSize = 5 * 1024 * 1024; // 5MB safety
  function parseNPY(buf: Uint8Array) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (view.getUint8(0) !== 0x93) throw new Error('bad npy');
    const ver = view.getUint8(2);
    const headerLen = ver === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
    const headerStart = ver === 1 ? 10 : 12;
    const headerBytes = buf.subarray(headerStart, headerStart + headerLen);
    const headerStr = new TextDecoder().decode(headerBytes);
    const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/);
    const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
    const shapeMatch = headerStr.match(/'shape':\s*\(([^\)]*)\)/);
    if (!dtypeMatch || !fortranMatch || !shapeMatch) throw new Error('npy header');
    const descr = dtypeMatch[1];
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
  async function loadMlpFromB64(b64: string) {
    try {
      const bin = atob(b64);
      if (bin.length > maxSize) throw new Error('too big');
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      if (!(window as any).fflate || !(window as any).fflate.unzipSync) await loadFflate();
      const files = (window as any).fflate.unzipSync(u8);
      const entries = Object.keys(files);
      if (entries.length > 32) throw new Error('too many entries');
      const map: Record<string, Uint8Array> = {};
      for (const name of entries) {
        map[name.replace(/.*\//, '')] = files[name];
      }
      function npzFind(prefix: string) {
        const k = Object.keys(map).find((n) => n === prefix || n === prefix + '.npy');
        return k ? map[k] : undefined;
      }
      const w1b = npzFind('w1');
      const b1b = npzFind('b1');
      const w2b = npzFind('w2');
      const b2b = npzFind('b2');
      if (!w1b || !b1b || !w2b || !b2b) throw new Error('missing weights');
      const w1 = parseNPY(w1b);
      const b1 = parseNPY(b1b);
      const w2 = parseNPY(w2b);
      const b2 = parseNPY(b2b);
      let labels: string[] = [];
      const lb = npzFind('labels');
      if (lb) {
        const parsed = parseNPY(lb);
        labels = parsed.data as string[];
      }
      mlp = {
        w1: Float64Array.from(w1.data as ArrayLike<number>),
        b1: Float64Array.from(b1.data as ArrayLike<number>),
        w2: Float64Array.from(w2.data as ArrayLike<number>),
        b2: Float64Array.from(b2.data as ArrayLike<number>),
        labels,
      };
      return true;
    } catch (e: any) {
      console.warn('mlp load failed', e?.message || e);
      mlp = null;
      return false;
    }
  }
  function relu(x: Float64Array) {
    for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
    return x;
  }
  function softmax(x: number[]) {
    const max = Math.max(...x);
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
  function dotMV(mat: Float64Array, rows: number, cols: number, vec: Float64Array) {
    const out = new Float64Array(rows);
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let c = 0; c < cols; c++) {
        sum += mat[r * cols + c] * vec[c];
      }
      out[r] = sum;
    }
    return out;
  }
  function addBias(vec: Float64Array, bias: Float64Array) {
    const out = new Float64Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      out[i] = vec[i] + bias[i % bias.length];
    }
    return out;
  }
  function normalizeLandmarks(all: any[]) {
    const flat: number[] = [];
    function normHand(hand: any[]) {
      if (!hand || hand.length < 21) return null;
      const wrist = hand[0];
      const centered = hand.map((p) => [p[0] - wrist[0], p[1] - wrist[1], (p[2] || 0) - (wrist[2] || 0)]);
      let maxd = 0;
      for (let i = 0; i < centered.length; i++) {
        const d = Math.abs(centered[i][0]) + Math.abs(centered[i][1]);
        if (d > maxd) maxd = d;
      }
      if (maxd === 0) return null;
      for (let i = 0; i < centered.length; i++) {
        centered[i][0] /= maxd;
        centered[i][1] /= maxd;
      }
      return centered;
    }
    const left = normHand(all[0] || []);
    const right = normHand(all[1] || []);
    if (!left) return null;
    const r = right || new Array(21).fill(0).map(() => [0, 0, 0]);
    const both = left.concat(r);
    for (const p of both) {
      flat.push(p[0], p[1], p[2] || 0);
    }
    return new Float64Array(flat);
  }
  function mlpPredict(all: any) {
    if (!mlp) return null;
    const x = normalizeLandmarks(all);
    if (!x) return null;
    const cols1 = x.length;
    const rows1 = mlp.b1.length;
    const z1 = addBias(dotMV(mlp.w1, rows1, cols1, x), mlp.b1);
    const a1 = relu(z1);
    const rows2 = mlp.b2.length;
    const cols2 = a1.length;
    const z2 = addBias(dotMV(mlp.w2, rows2, cols2, a1), mlp.b2);
    const probs = softmax(Array.from(z2));
    let bestI = 0;
    let best = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > best) {
        best = probs[i];
        bestI = i;
      }
    }
    const label = (mlp.labels && (mlp.labels as any)[bestI]) || String(bestI);
    return { label, score: best };
  }
  (window as any).__setMlpModelB64 = (b64: string) => {
    loadMlpFromB64(b64).then(() => {
      try {
        (window as any).ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'mlp_loaded' })
        );
      } catch {}
    });
  };
  (window as any).__mlpPredict = mlpPredict;
}
