"use strict";
(() => {
  // node_modules/fflate/esm/browser.js
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (; i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          var sv = i << 4 | cd[i];
          var r_1 = mb - cd[i];
          var v = le[cd[i] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  };
  var flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
      if (a[i] > m)
        m = a[i];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u8(sl * 3);
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u8(tl);
          var clt = new u8(19);
          for (var i = 0; i < hcLen; ++i) {
            clt[clim[i]] = bits(dat, pos + i * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i = 0; i < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i = sym - 257, b = fleb[i];
            add = bits(dat, pos, (1 << b) - 1) + fl[i];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (; bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var et = /* @__PURE__ */ new u8(0);
  var b2 = function(d, b) {
    return d[b] | d[b + 1] << 8;
  };
  var b4 = function(d, b) {
    return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
  };
  var b8 = function(d, b) {
    return b4(d, b) + b4(d, b + 4) * 4294967296;
  };
  function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
  }
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }
  var dutf8 = function(d) {
    for (var r = "", i = 0; ; ) {
      var c = d[i++];
      var eb = (c > 127) + (c > 223) + (c > 239);
      if (i + eb > d.length)
        return { s: r, r: slc(d, i - 1) };
      if (!eb)
        r += String.fromCharCode(c);
      else if (eb == 3) {
        c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
      } else if (eb & 1)
        r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
      else
        r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
    }
  };
  function strFromU8(dat, latin1) {
    if (latin1) {
      var r = "";
      for (var i = 0; i < dat.length; i += 16384)
        r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
      return r;
    } else if (td) {
      return td.decode(dat);
    } else {
      var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
      if (r.length)
        err(8);
      return s;
    }
  }
  var slzh = function(d, b) {
    return b + 30 + b2(d, b + 26) + b2(d, b + 28);
  };
  var zh = function(d, b, z) {
    var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
    var _a2 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a2[0], su = _a2[1], off = _a2[2];
    return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
  };
  var z64e = function(d, b) {
    for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
      ;
    return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
  };
  function unzipSync(data, opts) {
    var files = {};
    var e = data.length - 22;
    for (; b4(data, e) != 101010256; --e) {
      if (!e || data.length - e > 65558)
        err(13);
    }
    ;
    var c = b2(data, e + 8);
    if (!c)
      return {};
    var o = b4(data, e + 16);
    var z = o == 4294967295 || c == 65535;
    if (z) {
      var ze = b4(data, e - 12);
      z = b4(data, ze) == 101075792;
      if (z) {
        c = b4(data, ze + 32);
        o = b4(data, ze + 48);
      }
    }
    var fltr = opts && opts.filter;
    for (var i = 0; i < c; ++i) {
      var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
      o = no;
      if (!fltr || fltr({
        name: fn,
        size: sc,
        originalSize: su,
        compression: c_2
      })) {
        if (!c_2)
          files[fn] = slc(data, b, b + sc);
        else if (c_2 == 8)
          files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
        else
          err(14, "unknown compression type " + c_2);
      }
    }
    return files;
  }

  // src/webview/installMlp.ts
  function installMlp() {
    let mlp = null;
    function parseNPY(buf) {
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      if (view.getUint8(0) !== 147) throw new Error("bad npy");
      const major = view.getUint8(6);
      const _minor = view.getUint8(7);
      const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
      const headerStart = major === 1 ? 10 : 12;
      const headerBytes = buf.subarray(headerStart, headerStart + headerLen);
      const headerStr = new TextDecoder().decode(headerBytes);
      const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/);
      const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
      const shapeMatch = headerStr.match(/'shape':\s*\(([^\)]*)\)/);
      if (!dtypeMatch || !fortranMatch || !shapeMatch) throw new Error("npy header");
      const descr = dtypeMatch[1];
      const endian = descr[0];
      if (endian !== "<" && endian !== "|") {
        throw new Error("big-endian dtype not supported");
      }
      const fortran = fortranMatch[1] === "True";
      const shapeStr = shapeMatch[1].trim();
      const shape = shapeStr.length ? shapeStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)) : [1];
      const offset = headerStart + headerLen;
      const type = descr.slice(1);
      if (fortran) throw new Error("fortran not supported");
      const size = shape.reduce((a, b) => a * b, 1);
      if (type === "f8") {
        return { data: new Float64Array(buf.buffer, buf.byteOffset + offset, size), shape };
      }
      if (type === "f4") {
        return { data: new Float32Array(buf.buffer, buf.byteOffset + offset, size), shape };
      }
      if (type === "i4") {
        return { data: new Int32Array(buf.buffer, buf.byteOffset + offset, size), shape };
      }
      if (type === "i2") {
        return { data: new Int16Array(buf.buffer, buf.byteOffset + offset, size), shape };
      }
      if (type === "u1") {
        return { data: new Uint8Array(buf.buffer, buf.byteOffset + offset, size), shape };
      }
      if (type.startsWith("U")) {
        const itemSize = parseInt(type.slice(1), 10);
        const raw = new Uint32Array(buf.buffer, buf.byteOffset + offset, size * itemSize);
        const out = [];
        for (let i = 0; i < size; i++) {
          const start = i * itemSize;
          let s = "";
          for (let j = 0; j < itemSize; j++) {
            const code = raw[start + j];
            if (code === 0) break;
            s += String.fromCodePoint(code);
          }
          out.push(s);
        }
        return { data: out, shape };
      }
      throw new Error("dtype " + type);
    }
    async function loadMlpFromB64(b64) {
      try {
        let npzFind2 = function(prefix) {
          const k = Object.keys(map).find((n) => n === prefix || n === prefix + ".npy");
          return k ? map[k] : void 0;
        };
        var npzFind = npzFind2;
        const bin = atob(b64);
        const u82 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u82[i] = bin.charCodeAt(i);
        const unzip = window.fflate?.unzipSync;
        if (!unzip) throw new Error("fflate unavailable");
        const files = unzip(u82);
        const entries = Object.keys(files);
        if (entries.length > 32) throw new Error("too many entries");
        const map = {};
        for (const name of entries) {
          map[name.replace(/.*\//, "")] = files[name];
        }
        const w1b = npzFind2("w1");
        const b1b = npzFind2("b1");
        const w2b = npzFind2("w2");
        const b2b = npzFind2("b2");
        if (!w1b || !b1b || !w2b || !b2b) throw new Error("missing weights");
        const w1 = parseNPY(w1b);
        const b1 = parseNPY(b1b);
        const w2 = parseNPY(w2b);
        const b22 = parseNPY(b2b);
        let labels = [];
        const lb = npzFind2("labels");
        if (lb) {
          const parsed = parseNPY(lb);
          labels = parsed.data;
        }
        mlp = {
          w1: { data: Float64Array.from(w1.data), shape: w1.shape },
          b1: { data: Float64Array.from(b1.data), shape: b1.shape },
          w2: { data: Float64Array.from(w2.data), shape: w2.shape },
          b2: { data: Float64Array.from(b22.data), shape: b22.shape },
          labels
        };
        return true;
      } catch (e) {
        console.warn("mlp load failed", e?.message ?? e);
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "telemetry",
              event: "mlp_load_failed",
              reason: e?.message ?? String(e)
            })
          );
        } catch (err2) {
          console.warn("mlp_load_failed postMessage failed", err2);
        }
        mlp = null;
        return false;
      }
    }
    function relu(x) {
      for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
      return x;
    }
    function softmax(x) {
      const max2 = Math.max(...x);
      let s = 0;
      for (let i = 0; i < x.length; i++) {
        x[i] = Math.exp(x[i] - max2);
        s += x[i];
      }
      for (let i = 0; i < x.length; i++) {
        x[i] /= s;
      }
      return x;
    }
    function dotMV(mat, rows, cols, vec) {
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
    function addBias(vec, bias) {
      const out = new Float64Array(vec.length);
      for (let i = 0; i < vec.length; i++) {
        out[i] = vec[i] + bias[i % bias.length];
      }
      return out;
    }
    const EMPTY_HAND = new Array(21).fill(0).map(() => [0, 0, 0]);
    function normalizeLandmarks(all, handednesses) {
      const flat = [];
      function normHand(hand) {
        if (!hand || hand.length < 21) return null;
        const [wx, wy, wz] = hand[0];
        const centered = hand.map(
          (p) => [p[0] - wx, p[1] - wy, p[2] - wz]
        );
        const maxd = centered.reduce(
          (currentMax, [x, y]) => Math.max(currentMax, Math.abs(x) + Math.abs(y)),
          0
        );
        if (maxd === 0) return null;
        return centered.map(([x, y, z]) => [x / maxd, y / maxd, z / maxd]);
      }
      const leftHandIndex = handednesses?.findIndex((h) => h?.[0]?.categoryName === "Left");
      const rightHandIndex = handednesses?.findIndex((h) => h?.[0]?.categoryName === "Right");
      const leftHand = leftHandIndex > -1 ? all[leftHandIndex] : null;
      const rightHand = rightHandIndex > -1 ? all[rightHandIndex] : null;
      const left = normHand(leftHand);
      if (!left) return null;
      const right = normHand(rightHand);
      const r = right ?? EMPTY_HAND;
      const both = left.concat(r);
      for (const p of both) {
        flat.push(p[0], p[1], p[2]);
      }
      return new Float64Array(flat);
    }
    function mlpPredict(all, handednesses) {
      if (!mlp) return null;
      const x = normalizeLandmarks(all, handednesses);
      if (!x) return null;
      const cols1 = x.length;
      if (mlp.w1.shape[1] !== cols1) throw new Error("Input dimension mismatch");
      const rows1 = mlp.w1.shape[0];
      if (mlp.b1.shape[0] !== rows1) throw new Error("b1 dimension mismatch");
      const z1 = addBias(dotMV(mlp.w1.data, rows1, cols1, x), mlp.b1.data);
      const a1 = relu(z1);
      const rows2 = mlp.w2.shape[0];
      const cols2 = mlp.w2.shape[1];
      if (cols2 !== a1.length) throw new Error("Hidden layer size mismatch");
      if (mlp.b2.shape[0] !== rows2) throw new Error("b2 dimension mismatch");
      const z2 = addBias(dotMV(mlp.w2.data, rows2, cols2, a1), mlp.b2.data);
      const probs = softmax(Array.from(z2));
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
    window.__setMlpModelB64 = (b64) => {
      loadMlpFromB64(b64).then((ok) => {
        if (ok) {
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({ type: "telemetry", event: "mlp_loaded" })
            );
          } catch (e) {
            console.warn("mlp_loaded postMessage failed", e);
          }
        }
      });
    };
    window.__mlpPredict = mlpPredict;
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: "telemetry", event: "mlp_ready" })
      );
    } catch (e) {
      console.warn("mlp_ready postMessage failed", e);
    }
  }

  // webview/gestureDetector.ts
  window.fflate = { unzipSync };
  installMlp();
  var tapToStartText = window.__tapToStart || "";
  var recognizerInitFailed = window.__recognizerInitFailed || "Recognizer init failed: ";
  var predictionError = window.__predictionError || "Prediction error: ";
  var cameraError = window.__cameraError || "Camera error: ";
  var facingMode = window.__facingMode || "user";
  var mirrorOverlay = window.__mirrorOverlay === true;
  var MLP_CONFIDENCE_THRESHOLD = window.__mlpThreshold ?? 0.6;
  var FALLBACK_CONFIDENCE_THRESHOLD = window.__fallbackThreshold ?? 0.5;
  async function loadTasksVision() {
    async function resolvePinnedBase() {
      const cdns = ["https://cdn.jsdelivr.net/npm", "https://unpkg.com"];
      for (const base of cdns) {
        try {
          const pkg = await fetch(base + "/@mediapipe/tasks-vision/package.json", { method: "GET" });
          if (pkg.ok) {
            const json = await pkg.json().catch(() => null);
            const v = json?.version;
            if (typeof v === "string" && v.length) {
              return { base, version: v };
            }
          }
        } catch {
        }
      }
      return null;
    }
    function tryLoadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Failed to load script: " + src));
        document.head.appendChild(s);
      });
    }
    const haveUMD = () => window.fileset_resolver && window.fileset_resolver.FilesetResolver && (window.vision && window.vision.GestureRecognizer);
    const pinned = await resolvePinnedBase();
    const candidates = [];
    if (pinned) {
      candidates.push({
        umd: pinned.base + "/@mediapipe/tasks-vision@" + pinned.version + "/vision_bundle.js",
        esm: pinned.base + "/@mediapipe/tasks-vision@" + pinned.version + "/vision_bundle.mjs",
        wasm: pinned.base + "/@mediapipe/tasks-vision@" + pinned.version + "/wasm"
      });
    }
    candidates.push({
      umd: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js",
      esm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs",
      wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    });
    candidates.push({
      umd: "https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.js",
      esm: "https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs",
      wasm: "https://unpkg.com/@mediapipe/tasks-vision/wasm"
    });
    let lastError = null;
    for (const c of candidates) {
      try {
        if (!haveUMD()) {
          await tryLoadScript(c.umd);
        }
        if (haveUMD()) {
          return {
            FilesetResolver: window.fileset_resolver.FilesetResolver,
            GestureRecognizer: window.vision.GestureRecognizer,
            wasmBase: c.wasm
          };
        }
        try {
          const mod = await import(
            /* @vite-ignore */
            c.esm
          );
          if (mod?.FilesetResolver && mod?.GestureRecognizer) {
            return { FilesetResolver: mod.FilesetResolver, GestureRecognizer: mod.GestureRecognizer, wasmBase: c.wasm };
          }
        } catch (e) {
          lastError = e;
        }
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error("Tasks Vision globals not available" + (lastError ? ": " + (lastError.message || lastError) : ""));
  }
  var gestureRecognizer;
  var runningMode = "VIDEO";
  var video = document.createElement("video");
  var overlay = document.createElement("canvas");
  overlay.id = "overlay";
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(video);
    document.body.appendChild(overlay);
    const tap = document.createElement("div");
    tap.id = "tapToStart";
    tap.innerText = tapToStartText;
    tap.addEventListener("click", async () => {
      try {
        await startCamera();
        tap.classList.add("hidden");
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "telemetry", event: "tap_start" }));
      } catch {
      }
    });
    document.body.appendChild(tap);
    window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "telemetry", event: "dom_ready" }));
  });
  async function createGestureRecognizer() {
    try {
      const visionStart = performance.now();
      const { FilesetResolver, GestureRecognizer, wasmBase } = await loadTasksVision();
      const vision = await FilesetResolver.forVisionTasks(wasmBase || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU"
        },
        runningMode,
        numHands: 2
      });
      const initMs = Math.round(performance.now() - visionStart);
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "telemetry", event: "recognizer_init", ms: initMs }));
      video.addEventListener("loadeddata", predictWebcam);
    } catch (e) {
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "error", message: recognizerInitFailed + (e?.message || e) }));
    }
  }
  var lastVideoTime = -1;
  var frameCount = 0;
  var lastSentAt = 0;
  var lastSentGesture = null;
  var lastSentScore = 0;
  function predictWebcam() {
    try {
      if (gestureRecognizer && video.currentTime > 0 && !video.paused && !video.ended) {
        if (lastVideoTime !== video.currentTime) {
          lastVideoTime = video.currentTime;
          const start = performance.now();
          const results = gestureRecognizer.recognizeForVideo(video, start);
          const frameLatency = Math.round(performance.now() - start);
          frameCount++;
          if (frameCount % 30 === 0) {
            window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "telemetry", event: "frame_latency", ms: frameLatency }));
          }
          const allLandmarks = (results?.landmarks || []).map(
            (hand) => hand.map((lm) => [lm.x, lm.y, lm.z ?? 0])
          );
          let outGesture = null;
          let outScore = 0;
          const perHand = [];
          const handedArr = (results?.handednesses || []).map((h) => h?.[0]?.categoryName || "unknown");
          if (results?.gestures?.length) {
            for (let i = 0; i < results.gestures.length; i++) {
              const handGestures = results.gestures[i] || [];
              const top = handGestures?.[0];
              const handed = handedArr[i] || "unknown";
              if (top) {
                perHand.push({ hand: handed, label: top.categoryName, score: top.score });
                if (top.score > outScore) {
                  outGesture = top.categoryName;
                  outScore = top.score;
                }
              }
            }
            if (perHand.length >= 2) {
              const left = perHand.find((h) => /left/i.test(h.hand)) || perHand[0];
              const right = perHand.find((h) => /right/i.test(h.hand)) || perHand[1];
              if (left && right) {
                outGesture = left.label + "+" + right.label;
                outScore = Math.min(left.score, right.score);
              }
            }
          }
          if (window.__mlpPredict) {
            const mlpResult = window.__mlpPredict(allLandmarks, results.handednesses);
            if (mlpResult && mlpResult.score > MLP_CONFIDENCE_THRESHOLD) {
              outGesture = mlpResult.label;
              outScore = mlpResult.score;
            }
          }
          const firstHand = allLandmarks[0] || [];
          if ((!outGesture || outScore < FALLBACK_CONFIDENCE_THRESHOLD) && firstHand.length === 21) {
            const thumbUp = firstHand[4][1] < firstHand[2][1];
            const indexUp = firstHand[8][1] < firstHand[6][1];
            const middleUp = firstHand[12][1] < firstHand[10][1];
            const ringUp = firstHand[16][1] < firstHand[14][1];
            const pinkyUp = firstHand[20][1] < firstHand[18][1];
            const allUp = indexUp && middleUp && ringUp && pinkyUp;
            const noneUp = !indexUp && !middleUp && !ringUp && !pinkyUp;
            if (thumbUp && !indexUp && !middleUp) {
              outGesture = "thumbs_up";
              outScore = 0.8;
            } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
              outGesture = "point";
              outScore = 0.7;
            } else if (allUp) {
              outGesture = "open_palm";
              outScore = 0.6;
            } else if (noneUp) {
              outGesture = "fist";
              outScore = 0.6;
            }
          }
          try {
            const w = video.clientWidth || window.innerWidth;
            const h = video.clientHeight || window.innerHeight;
            if (overlay.width !== w || overlay.height !== h) {
              overlay.width = w;
              overlay.height = h;
            }
            const ctx = overlay.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, overlay.width, overlay.height);
              ctx.save();
              if (mirrorOverlay) {
                ctx.scale(-1, 1);
                ctx.translate(-overlay.width, 0);
              }
              const HAND_CONNECTIONS = [
                [0, 1],
                [1, 2],
                [2, 3],
                [3, 4],
                [0, 5],
                [5, 6],
                [6, 7],
                [7, 8],
                [5, 9],
                [9, 10],
                [10, 11],
                [11, 12],
                [9, 13],
                [13, 14],
                [14, 15],
                [15, 16],
                [13, 17],
                [17, 18],
                [18, 19],
                [19, 20],
                [0, 17]
              ];
              ctx.lineWidth = 3;
              ctx.strokeStyle = "rgba(0, 255, 180, 0.9)";
              ctx.fillStyle = "rgba(0, 255, 180, 0.9)";
              for (const hand of results?.landmarks || []) {
                ctx.beginPath();
                for (const [a, b] of HAND_CONNECTIONS) {
                  const pa = hand[a];
                  const pb = hand[b];
                  if (!pa || !pb) continue;
                  ctx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
                  ctx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
                }
                ctx.stroke();
                for (const lm of hand) {
                  ctx.beginPath();
                  ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 4, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              ctx.restore();
            }
          } catch {
          }
          const now = performance.now();
          const confidence = allLandmarks.length ? outScore : 0;
          const changed = outGesture !== lastSentGesture || Math.abs(confidence - lastSentScore) >= 0.05;
          if (changed || now - lastSentAt >= 100) {
            lastSentGesture = outGesture;
            lastSentScore = confidence;
            lastSentAt = now;
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: "gesture",
                gesture: outGesture || null,
                confidence,
                landmarks: allLandmarks,
                handednesses: handedArr
              })
            );
          }
        }
      }
    } catch (e) {
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "warn", message: predictionError + (e?.message || e) }));
    }
    window.requestAnimationFrame(predictWebcam);
  }
  function resizeOverlay() {
    try {
      const w = video.clientWidth || window.innerWidth;
      const h = video.clientHeight || window.innerHeight;
      if (overlay.width !== w || overlay.height !== h) {
        overlay.width = w;
        overlay.height = h;
      }
    } catch {
    }
  }
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      try {
        video.muted = true;
        await video.play();
        resizeOverlay();
      } catch {
      }
      const tracks = stream.getVideoTracks();
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "telemetry", event: "camera_started", tracks: tracks.map((t) => t.label) }));
    } catch (err2) {
      const msg = err2 && err2.name + ": " + err2.message || String(err2);
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "error", message: cameraError + msg }));
    }
  }
  startCamera();
  createGestureRecognizer();
  function stopCamera() {
    try {
      const s = video.srcObject;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    } catch {
    }
  }
  window.addEventListener("pagehide", stopCamera);
  window.addEventListener("beforeunload", stopCamera);
  window.addEventListener("resize", () => {
    try {
      resizeOverlay();
    } catch {
    }
  });
})();
