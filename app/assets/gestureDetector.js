// Generated from app/webview/gestureDetector.ts; run npm run build:webview --prefix app
"use strict";
(() => {
  // node_modules/fflate/esm/browser.js
  var ch2 = {};
  var wk = (function(c, id, msg, transfer, cb) {
    var w = new Worker(ch2[id] || (ch2[id] = URL.createObjectURL(new Blob([
      c + ';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'
    ], { type: "text/javascript" }))));
    w.onmessage = function(e) {
      var d = e.data, ed = d.$e$;
      if (ed) {
        var err2 = new Error(ed[0]);
        err2["code"] = ed[1];
        err2.stack = ed[2];
        cb(err2, null);
      } else
        cb(null, d);
    };
    w.postMessage(msg, transfer);
    return w;
  });
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
  var hMap = (function(cd, mb, r) {
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
  });
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
  var mrg = function(a, b) {
    var o = {};
    for (var k in a)
      o[k] = a[k];
    for (var k in b)
      o[k] = b[k];
    return o;
  };
  var wcln = function(fn, fnStr, td2) {
    var dt = fn();
    var st = fn.toString();
    var ks = st.slice(st.indexOf("[") + 1, st.lastIndexOf("]")).replace(/\s+/g, "").split(",");
    for (var i = 0; i < dt.length; ++i) {
      var v = dt[i], k = ks[i];
      if (typeof v == "function") {
        fnStr += ";" + k + "=";
        var st_1 = v.toString();
        if (v.prototype) {
          if (st_1.indexOf("[native code]") != -1) {
            var spInd = st_1.indexOf(" ", 8) + 1;
            fnStr += st_1.slice(spInd, st_1.indexOf("(", spInd));
          } else {
            fnStr += st_1;
            for (var t in v.prototype)
              fnStr += ";" + k + ".prototype." + t + "=" + v.prototype[t].toString();
          }
        } else
          fnStr += st_1;
      } else
        td2[k] = v;
    }
    return fnStr;
  };
  var ch = [];
  var cbfs = function(v) {
    var tl = [];
    for (var k in v) {
      if (v[k].buffer) {
        tl.push((v[k] = new v[k].constructor(v[k])).buffer);
      }
    }
    return tl;
  };
  var wrkr = function(fns, init, id, cb) {
    if (!ch[id]) {
      var fnStr = "", td_1 = {}, m = fns.length - 1;
      for (var i = 0; i < m; ++i)
        fnStr = wcln(fns[i], fnStr, td_1);
      ch[id] = { c: wcln(fns[m], fnStr, td_1), e: td_1 };
    }
    var td2 = mrg({}, ch[id].e);
    return wk(ch[id].c + ";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=" + init.toString() + "}", id, td2, cbfs(td2), cb);
  };
  var bInflt = function() {
    return [u8, u16, i32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev, ec, hMap, max, bits, bits16, shft, slc, err, inflt, inflateSync, pbf, gopt];
  };
  var pbf = function(msg) {
    return postMessage(msg, [msg.buffer]);
  };
  var gopt = function(o) {
    return o && {
      out: o.size && new u8(o.size),
      dictionary: o.dictionary
    };
  };
  var cbify = function(dat, opts, fns, init, id, cb) {
    var w = wrkr(fns, init, id, function(err2, dat2) {
      w.terminate();
      cb(err2, dat2);
    });
    w.postMessage([dat, opts], opts.consume ? [dat.buffer] : []);
    return function() {
      w.terminate();
    };
  };
  var b2 = function(d, b) {
    return d[b] | d[b + 1] << 8;
  };
  var b4 = function(d, b) {
    return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
  };
  var b8 = function(d, b) {
    return b4(d, b) + b4(d, b + 4) * 4294967296;
  };
  function inflate(data, opts, cb) {
    if (!cb)
      cb = opts, opts = {};
    if (typeof cb != "function")
      err(7);
    return cbify(data, opts, [
      bInflt
    ], function(ev) {
      return pbf(inflateSync(ev.data[0], gopt(ev.data[1])));
    }, 1, cb);
  }
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
  var mt = typeof queueMicrotask == "function" ? queueMicrotask : typeof setTimeout == "function" ? setTimeout : function(fn) {
    fn();
  };
  function unzip(data, opts, cb) {
    if (!cb)
      cb = opts, opts = {};
    if (typeof cb != "function")
      err(7);
    var term = [];
    var tAll = function() {
      for (var i2 = 0; i2 < term.length; ++i2)
        term[i2]();
    };
    var files = {};
    var cbd = function(a, b) {
      mt(function() {
        cb(a, b);
      });
    };
    mt(function() {
      cbd = cb;
    });
    var e = data.length - 22;
    for (; b4(data, e) != 101010256; --e) {
      if (!e || data.length - e > 65558) {
        cbd(err(13, 0, 1), null);
        return tAll;
      }
    }
    ;
    var lft = b2(data, e + 8);
    if (lft) {
      var c = lft;
      var o = b4(data, e + 16);
      var z = o == 4294967295 || c == 65535;
      if (z) {
        var ze = b4(data, e - 12);
        z = b4(data, ze) == 101075792;
        if (z) {
          c = lft = b4(data, ze + 32);
          o = b4(data, ze + 48);
        }
      }
      var fltr = opts && opts.filter;
      var _loop_3 = function(i2) {
        var _a2 = zh(data, o, z), c_1 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
        o = no;
        var cbl = function(e2, d) {
          if (e2) {
            tAll();
            cbd(e2, null);
          } else {
            if (d)
              files[fn] = d;
            if (!--lft)
              cbd(null, files);
          }
        };
        if (!fltr || fltr({
          name: fn,
          size: sc,
          originalSize: su,
          compression: c_1
        })) {
          if (!c_1)
            cbl(null, slc(data, b, b + sc));
          else if (c_1 == 8) {
            var infl = data.subarray(b, b + sc);
            if (su < 524288 || sc > 0.8 * su) {
              try {
                cbl(null, inflateSync(infl, { out: new u8(su) }));
              } catch (e2) {
                cbl(e2, null);
              }
            } else
              term.push(inflate(infl, { size: su }, cbl));
          } else
            cbl(err(14, "unknown compression type " + c_1, 1), null);
        } else
          cbl(null, null);
      };
      for (var i = 0; i < c; ++i) {
        _loop_3(i);
      }
    } else
      cbd(null, {});
    return tAll;
  }
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
      if (type === "f2") {
        const src = new Uint16Array(buf.buffer, buf.byteOffset + offset, size);
        const out = new Float32Array(size);
        for (let i = 0; i < size; i++) out[i] = f16ToF32(src[i]);
        return { data: out, shape };
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
    function f16ToF32(h) {
      const s = (h & 32768) << 16;
      let e = (h & 31744) >> 10;
      let f = h & 1023;
      if (e === 0) {
        if (f === 0) return s ? -0 : 0;
        while ((f & 1024) === 0) {
          f <<= 1;
          e--;
        }
        e++;
        f &= ~1024;
      } else if (e === 31) {
        const bits3 = s | 2139095040 | f << 13;
        return new Float32Array(new Uint32Array([bits3]).buffer)[0];
      }
      e = e + (127 - 15);
      const bits2 = s | e << 23 | f << 13;
      return new Float32Array(new Uint32Array([bits2]).buffer)[0];
    }
    async function loadMlpFromB64(b64) {
      try {
        let npzFind2 = function(m, prefix) {
          const k = Object.keys(m).find((n) => n === prefix || n === prefix + ".npy");
          return k ? m[k] : void 0;
        };
        var npzFind = npzFind2;
        const bin = atob(b64);
        const u82 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u82[i] = bin.charCodeAt(i);
        const unzip2 = window.fflate?.unzip;
        if (!unzip2) throw new Error("fflate unavailable");
        const files = await new Promise((resolve, reject) => {
          unzip2(u82, (err2, data) => {
            if (err2) reject(err2);
            else resolve(data);
          });
        });
        const entries = Object.keys(files);
        if (entries.length > 32) throw new Error("too many entries");
        const map = {};
        for (const name of entries) {
          map[name.replace(/.*\//, "")] = files[name];
        }
        const w1b = npzFind2(map, "w1");
        const b1b = npzFind2(map, "b1");
        const w2b = npzFind2(map, "w2");
        const b2b = npzFind2(map, "b2");
        if (!w1b || !b1b || !w2b || !b2b) throw new Error("missing weights");
        const w1 = parseNPY(w1b);
        const b1 = parseNPY(b1b);
        const w2 = parseNPY(w2b);
        const b22 = parseNPY(b2b);
        let labels = [];
        const lb = npzFind2(map, "labels");
        if (lb) {
          const parsed = parseNPY(lb);
          labels = parsed.data;
        }
        mlp = {
          w1: { data: Float32Array.from(w1.data), shape: w1.shape },
          b1: { data: Float32Array.from(b1.data), shape: b1.shape },
          w2: { data: Float32Array.from(w2.data), shape: w2.shape },
          b2: { data: Float32Array.from(b22.data), shape: b22.shape },
          labels
        };
        return true;
      } catch (e) {
        console.warn("MLP load failed:", e?.message ?? e);
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "telemetry",
              event: "mlp_load_failed",
              reason: e?.message ?? String(e)
            })
          );
        } catch (err2) {
          console.warn("Failed to send 'mlp_load_failed' telemetry event:", err2);
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
      let max2 = -Infinity;
      for (let i = 0; i < x.length; i++) if (x[i] > max2) max2 = x[i];
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
    function affineMV(mat, rows, cols, vec, bias) {
      const out = new Float32Array(rows);
      for (let r = 0; r < rows; r++) {
        let sum = 0;
        for (let c = 0; c < cols; c++) sum += mat[r * cols + c] * vec[c];
        out[r] = sum + bias[r];
      }
      return out;
    }
    const EMPTY_HAND = new Array(21).fill(0).map(() => [0, 0, 0]);
    function normalizeLandmarks(all, handednesses) {
      const flat = new Float32Array(21 * 2 * 3);
      function normHand(hand) {
        if (!hand || hand.length < 21) return null;
        const [wx, wy, wz] = hand[0];
        const centered = hand.map(
          (p) => [p[0] - wx, p[1] - wy, p[2] - wz]
        );
        const maxd = centered.reduce(
          (currentMax, [x, y, z]) => Math.max(currentMax, Math.abs(x) + Math.abs(y) + Math.abs(z)),
          0
        );
        if (maxd === 0) return null;
        return centered.map(
          ([x, y, z]) => [x / maxd, y / maxd, z / maxd]
        );
      }
      const leftHandIndex = handednesses?.findIndex(
        (h) => h?.[0]?.categoryName === "Left"
      );
      const rightHandIndex = handednesses?.findIndex(
        (h) => h?.[0]?.categoryName === "Right"
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
    function mlpPredict(all, handednesses) {
      try {
        if (!mlp) return null;
        const x = normalizeLandmarks(all, handednesses);
        if (!x) return null;
        const cols1 = x.length;
        if (mlp.w1.shape[1] !== cols1) throw new Error("Input dimension mismatch");
        const rows1 = mlp.w1.shape[0];
        if (mlp.b1.shape[0] !== rows1) throw new Error("b1 dimension mismatch");
        const z1 = affineMV(mlp.w1.data, rows1, cols1, x, mlp.b1.data);
        const a1 = relu(z1);
        const rows2 = mlp.w2.shape[0];
        const cols2 = mlp.w2.shape[1];
        if (cols2 !== a1.length) throw new Error("Hidden layer size mismatch");
        if (mlp.b2.shape[0] !== rows2) throw new Error("b2 dimension mismatch");
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
      } catch (e) {
        console.warn("MLP prediction failed:", e);
        return null;
      }
    }
    window.__setMlpModelB64 = async (b64) => {
      const ok = await loadMlpFromB64(b64);
      if (ok) {
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({ type: "telemetry", event: "mlp_loaded" })
          );
        } catch (e) {
          console.warn("Failed to send 'mlp_loaded' telemetry event:", e);
        }
      }
      return ok;
    };
    window.__mlpPredict = mlpPredict;
    let transferBuf = "";
    let transferStart = 0;
    let transferLock = false;
    window.__beginMlpTransfer = () => {
      if (transferLock) return false;
      transferLock = true;
      transferBuf = "";
      transferStart = performance.now();
      return true;
    };
    window.__pushMlpChunk = (chunk) => {
      if (!transferLock) return;
      transferBuf += chunk;
    };
    window.__commitMlpTransfer = async () => {
      const active = transferLock;
      const bytes = transferBuf.length;
      const start = transferStart;
      try {
        if (active) {
          if (typeof window.__setMlpModelB64 !== "function") {
            try {
              window.ReactNativeWebView?.postMessage?.(
                JSON.stringify({
                  type: "telemetry",
                  event: "mlp_transfer_failed",
                  reason: "setter_missing"
                })
              );
            } catch (e) {
              console.warn(
                "Failed to send 'mlp_transfer_failed' telemetry event:",
                e
              );
            }
            return;
          }
          const loadPromise = window.__setMlpModelB64(transferBuf);
          const ms = Math.round(performance.now() - start);
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: "telemetry",
                event: "mlp_transfer",
                bytes,
                ms
              })
            );
          } catch (e) {
            console.warn("Failed to send 'mlp_transfer' telemetry event:", e);
          }
          await loadPromise;
        } else {
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: "telemetry",
                event: "mlp_transfer_skipped"
              })
            );
          } catch (e) {
            console.warn(
              "Failed to send 'mlp_transfer_skipped' telemetry event:",
              e
            );
          }
        }
      } catch (err2) {
        console.warn("mlp_transfer failed:", err2);
      } finally {
        transferBuf = "";
        transferStart = 0;
        transferLock = false;
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "telemetry",
              event: "mlp_transfer_complete"
            })
          );
        } catch (e) {
          console.warn(
            "Failed to send 'mlp_transfer_complete' telemetry event:",
            e
          );
        }
      }
    };
  }

  // src/constants/hand.ts
  var HAND_CONNECTIONS = [
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

  // webview/core/MediaPipeLoader.ts
  async function loadTasksVision() {
    async function resolvePinnedBase() {
      const pinnedVersion = window.__mediapipeVersion;
      if (typeof pinnedVersion === "string" && pinnedVersion.length) {
        return { base: "https://cdn.jsdelivr.net/npm", version: pinnedVersion };
      }
      const cdns = ["https://cdn.jsdelivr.net/npm", "https://unpkg.com"];
      const controllers = cdns.map(() => new AbortController());
      const fetches = cdns.map(
        (base, i) => (async () => {
          try {
            const ac = controllers[i];
            const t = setTimeout(() => ac.abort(), 8e3);
            const pkg = await fetch(base + "/@mediapipe/tasks-vision/package.json", {
              method: "GET",
              signal: ac.signal,
              cache: "no-store"
            }).finally(() => clearTimeout(t));
            if (pkg.ok) {
              const json = await pkg.json().catch(() => null);
              const v = json?.version;
              if (typeof v === "string" && v.length) {
                controllers.forEach((c, j) => {
                  if (j !== i) c.abort();
                });
                return { base, version: v };
              }
            }
          } catch (err2) {
            if (err2?.name !== "AbortError") {
              console.warn("Fetch failed:", base, err2);
            }
          }
          return null;
        })()
      );
      const results = await Promise.all(fetches);
      return results.find(Boolean) || null;
    }
    function tryLoadScript(src, integrity, timeoutMs = 8e3) {
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        if (integrity) {
          s.integrity = integrity;
          s.crossOrigin = "anonymous";
        }
        if (window.__visionBundleNonce) {
          s.nonce = window.__visionBundleNonce;
        }
        s.async = true;
        const cleanup2 = () => {
          s.onload = s.onerror = null;
          if (s.parentNode) s.parentNode.removeChild(s);
        };
        const to = setTimeout(() => {
          cleanup2();
          reject(new Error("Script load timeout: " + src));
        }, timeoutMs);
        s.onload = () => {
          clearTimeout(to);
          cleanup2();
          resolve(null);
        };
        s.onerror = () => {
          clearTimeout(to);
          cleanup2();
          reject(new Error("Script failed to load: " + src));
        };
        document.head.appendChild(s);
      });
    }
    const haveUMD = () => window.fileset_resolver && window.fileset_resolver.FilesetResolver && window.vision && window.vision.GestureRecognizer;
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
          const sri = pinned && c.umd.includes(`@${pinned.version}/`) ? window.__visionBundleSri : void 0;
          await tryLoadScript(c.umd, sri);
        }
        if (haveUMD()) {
          return {
            FilesetResolver: window.fileset_resolver.FilesetResolver,
            GestureRecognizer: window.vision.GestureRecognizer,
            wasmBase: c.wasm
          };
        }
        if (window.__allowCdnEsm === true) {
          try {
            const mod = await import(
              /* @vite-ignore */
              c.esm
            );
            if (mod?.FilesetResolver && mod?.GestureRecognizer) {
              return {
                FilesetResolver: mod.FilesetResolver,
                GestureRecognizer: mod.GestureRecognizer,
                wasmBase: c.wasm
              };
            }
          } catch (e) {
            lastError = e;
          }
        }
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error(
      "Tasks Vision globals not available" + (lastError ? ": " + (lastError.message || lastError) : "")
    );
  }

  // webview/core/CameraManager.ts
  var CameraManager = class {
    constructor(video2, resourceManager2) {
      this.lastVideoWidth = 0;
      this.lastVideoHeight = 0;
      this.video = video2;
      this.resourceManager = resourceManager2;
    }
    /**
     * Start camera stream
     */
    async startCamera() {
      const facingMode2 = window.__facingMode || "user";
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode2, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      this.video.srcObject = stream;
      this.resourceManager.registerMediaStream(stream);
      this.video.muted = true;
      this.video.setAttribute("autoplay", "");
      this.video.setAttribute("playsinline", "");
      this.video.setAttribute("muted", "");
      await this.video.play();
      this.updateVideoDimensions();
      const tracks = stream.getVideoTracks();
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "telemetry",
            event: "camera_started",
            tracks: tracks.map((t) => t.label)
          })
        );
      } catch (err2) {
        console.warn("Failed to send 'camera_started' telemetry event:", err2);
      }
    }
    /**
     * Stop camera stream
     */
    async stopCamera() {
      try {
        this.video.pause();
      } catch (e) {
        console.warn("Failed to pause video during cleanup:", e);
      }
      try {
        const s = this.video.srcObject;
        if (s) {
          s.getTracks().forEach((t) => t.stop());
          this.video.srcObject = null;
        }
      } catch (e) {
        console.warn("Failed to stop camera stream:", e);
      }
    }
    /**
     * Update video dimensions tracking
     */
    updateVideoDimensions() {
      this.lastVideoWidth = this.video.videoWidth;
      this.lastVideoHeight = this.video.videoHeight;
    }
    /**
     * Check if video dimensions have changed
     */
    hasDimensionsChanged() {
      return this.video.videoWidth !== this.lastVideoWidth || this.video.videoHeight !== this.lastVideoHeight;
    }
    /**
     * Get current video dimensions
     */
    getVideoDimensions() {
      return {
        width: this.video.videoWidth,
        height: this.video.videoHeight
      };
    }
    /**
     * Check if video is ready for processing
     */
    isVideoReady() {
      return this.video.currentTime > 0 && !this.video.paused && !this.video.ended && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }
  };

  // webview/core/OverlayRenderer.ts
  var OverlayRenderer = class {
    constructor(overlay2) {
      this.overlayWidth = 0;
      this.overlayHeight = 0;
      this.overlayDpr = 1;
      this.overlay = overlay2;
      this.ctx = overlay2.getContext("2d");
    }
    /**
     * Resize overlay to match video dimensions
     */
    resizeOverlay(videoRect) {
      const w = (videoRect.width || 0) | 0;
      const h = (videoRect.height || 0) | 0;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const sizeChanged = this.overlayWidth !== w || this.overlayHeight !== h;
      const dprChanged = dpr !== this.overlayDpr;
      if (sizeChanged || dprChanged) {
        if (sizeChanged) {
          this.overlay.style.width = w + "px";
          this.overlay.style.height = h + "px";
        }
        this.overlay.width = Math.round(w * dpr);
        this.overlay.height = Math.round(h * dpr);
        this.overlayWidth = w;
        this.overlayHeight = h;
        this.overlayDpr = dpr;
      }
    }
    /**
     * Clear the overlay
     */
    clear() {
      if (this.ctx && this.overlayWidth && this.overlayHeight) {
        this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      }
    }
    /**
     * Draw hand landmarks and connections with performance optimizations
     */
    drawHandLandmarks(landmarks, mirrorOverlay2) {
      if (!this.ctx || !this.overlayWidth || !this.overlayHeight) return;
      this.ctx.save();
      if (mirrorOverlay2) {
        this.ctx.scale(-1, 1);
        this.ctx.translate(-this.overlayWidth, 0);
      }
      this.ctx.scale(this.overlayDpr, this.overlayDpr);
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = "rgba(0, 255, 180, 0.9)";
      this.ctx.fillStyle = "rgba(0, 255, 180, 0.9)";
      for (const hand of landmarks) {
        if (!hand || hand.length === 0) continue;
        this.drawConnections(hand);
        this.drawPoints(hand);
      }
      this.ctx.restore();
    }
    /**
     * Draw hand connections efficiently
     */
    drawConnections(hand) {
      if (!this.ctx) return;
      this.ctx.beginPath();
      let hasMoves = false;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = hand[a];
        const pb = hand[b];
        if (!pa || !pb) continue;
        const x1 = pa[0] * this.overlayWidth;
        const y1 = pa[1] * this.overlayHeight;
        const x2 = pb[0] * this.overlayWidth;
        const y2 = pb[1] * this.overlayHeight;
        if (!hasMoves) {
          this.ctx.moveTo(x1, y1);
          hasMoves = true;
        } else {
          this.ctx.moveTo(x1, y1);
        }
        this.ctx.lineTo(x2, y2);
      }
      if (hasMoves) {
        this.ctx.stroke();
      }
    }
    /**
     * Draw landmark points efficiently
     */
    drawPoints(hand) {
      if (!this.ctx) return;
      for (const lm of hand) {
        if (!lm || lm.length < 2) continue;
        this.ctx.beginPath();
        this.ctx.arc(
          lm[0] * this.overlayWidth,
          lm[1] * this.overlayHeight,
          4,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
    }
    /**
     * Draw stability guide circle
     */
    drawStabilityGuide(isStable, stabilityScore) {
      if (!this.ctx || !this.overlayWidth || !this.overlayHeight) return;
      this.ctx.save();
      this.ctx.scale(this.overlayDpr, this.overlayDpr);
      const centerX = this.overlayWidth / 2;
      const centerY = this.overlayHeight / 2;
      const radius = Math.min(this.overlayWidth, this.overlayHeight) * 0.15;
      this.ctx.strokeStyle = stabilityScore > 0.3 ? "rgba(255, 165, 0, 0.8)" : "rgba(255, 0, 0, 0.8)";
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([10, 5]);
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - radius * 0.7, centerY);
      this.ctx.lineTo(centerX + radius * 0.7, centerY);
      this.ctx.moveTo(centerX, centerY - radius * 0.7);
      this.ctx.lineTo(centerX, centerY + radius * 0.7);
      this.ctx.stroke();
      this.ctx.restore();
    }
    /**
     * Get overlay dimensions
     */
    getDimensions() {
      return {
        width: this.overlayWidth,
        height: this.overlayHeight,
        dpr: this.overlayDpr
      };
    }
  };

  // webview/utils/ResourceManager.ts
  var ResourceManager = class {
    constructor() {
      this.resources = /* @__PURE__ */ new Set();
      this.eventListeners = [];
      this.mediaStreams = [];
      this.timeouts = [];
      this.observers = [];
    }
    /**
     * Register a cleanup function
     */
    registerCleanup(cleanupFn) {
      this.resources.add(cleanupFn);
    }
    /**
     * Register an event listener for cleanup
     */
    registerEventListener(element, type, listener) {
      this.eventListeners.push({ element, type, listener });
    }
    /**
     * Register a media stream for cleanup
     */
    registerMediaStream(stream) {
      this.mediaStreams.push(stream);
    }
    /**
     * Register a timeout for cleanup
     */
    registerTimeout(timeoutId) {
      this.timeouts.push(timeoutId);
    }
    /**
     * Register an observer for cleanup
     */
    registerObserver(observer) {
      this.observers.push(observer);
    }
    /**
     * Dispose all registered resources
     */
    async dispose() {
      const errors = [];
      for (const cleanupFn of this.resources) {
        try {
          const result = cleanupFn();
          if (result && typeof result.then === "function") {
            await result;
          }
        } catch (e) {
          errors.push(e);
        }
      }
      this.resources.clear();
      for (const { element, type, listener } of this.eventListeners) {
        try {
          element.removeEventListener(type, listener);
        } catch (e) {
          errors.push(e);
        }
      }
      this.eventListeners = [];
      for (const stream of this.mediaStreams) {
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch (e) {
          errors.push(e);
        }
      }
      this.mediaStreams = [];
      for (const timeoutId of this.timeouts) {
        try {
          clearTimeout(timeoutId);
        } catch (e) {
          errors.push(e);
        }
      }
      this.timeouts = [];
      for (const observer of this.observers) {
        try {
          observer.disconnect();
        } catch (e) {
          errors.push(e);
        }
      }
      this.observers = [];
      if (errors.length > 0) {
        console.warn("Resource cleanup errors:", errors);
      }
    }
    /**
     * Check if resources are properly cleaned up
     */
    isClean() {
      return this.resources.size === 0 && this.eventListeners.length === 0 && this.mediaStreams.length === 0 && this.timeouts.length === 0 && this.observers.length === 0;
    }
  };

  // webview/utils/HealthMonitor.ts
  var HealthMonitor = class {
    constructor() {
      this.metrics = {
        frameRate: 0,
        memoryUsage: 0,
        errorRate: 0,
        lastFrameTime: 0,
        consecutiveFailures: 0
      };
      this.frameTimes = [];
      this.MAX_FRAME_HISTORY = 60;
      // Last 60 frames (~2 seconds at 30fps)
      this.errorCount = 0;
      this.totalFrames = 0;
    }
    /**
     * Record a successful frame processing
     */
    recordFrame(timestamp) {
      this.frameTimes.push(timestamp);
      if (this.frameTimes.length > this.MAX_FRAME_HISTORY) {
        this.frameTimes.shift();
      }
      this.metrics.lastFrameTime = timestamp;
      this.totalFrames++;
      this.metrics.consecutiveFailures = 0;
    }
    /**
     * Record an error
     */
    recordError() {
      this.errorCount++;
      this.metrics.consecutiveFailures++;
    }
    /**
     * Update memory usage estimate
     */
    updateMemoryUsage() {
      this.metrics.memoryUsage = this.frameTimes.length * 1e3 + this.errorCount * 500;
    }
    /**
     * Calculate current frame rate
     */
    calculateFrameRate() {
      if (this.frameTimes.length < 2) return 0;
      const recentFrames = this.frameTimes.slice(-10);
      if (recentFrames.length < 2) return 0;
      const timeSpan = recentFrames[recentFrames.length - 1] - recentFrames[0];
      const frameCount2 = recentFrames.length - 1;
      return frameCount2 / timeSpan * 1e3;
    }
    /**
     * Calculate error rate
     */
    calculateErrorRate() {
      if (this.totalFrames === 0) return 0;
      return this.errorCount / this.totalFrames;
    }
    /**
     * Get current health status
     */
    getHealthStatus() {
      this.metrics.frameRate = this.calculateFrameRate();
      this.metrics.errorRate = this.calculateErrorRate();
      this.updateMemoryUsage();
      const issues = [];
      const recommendations = [];
      if (this.metrics.frameRate < 15) {
        issues.push("Low frame rate detected");
        recommendations.push("Check camera performance and lighting conditions");
      }
      if (this.metrics.errorRate > 0.1) {
        issues.push("High error rate detected");
        recommendations.push("Verify camera permissions and system resources");
      }
      if (this.metrics.memoryUsage > 5e4) {
        issues.push("High memory usage detected");
        recommendations.push("Consider restarting the gesture detection system");
      }
      if (this.metrics.consecutiveFailures > 5) {
        issues.push("Multiple consecutive failures detected");
        recommendations.push("System may need recovery or fallback mode");
      }
      let overall = "healthy";
      if (issues.length >= 3 || this.metrics.consecutiveFailures > 10) {
        overall = "critical";
      } else if (issues.length >= 1 || this.metrics.errorRate > 0.05) {
        overall = "degraded";
      }
      return {
        overall,
        issues,
        recommendations
      };
    }
    /**
     * Get current metrics
     */
    getMetrics() {
      return { ...this.metrics };
    }
    /**
     * Reset health monitoring
     */
    reset() {
      this.frameTimes = [];
      this.errorCount = 0;
      this.totalFrames = 0;
      this.metrics = {
        frameRate: 0,
        memoryUsage: 0,
        errorRate: 0,
        lastFrameTime: 0,
        consecutiveFailures: 0
      };
    }
    /**
     * Check if system needs recovery
     */
    needsRecovery() {
      const status = this.getHealthStatus();
      return status.overall === "critical" || this.metrics.consecutiveFailures > 3;
    }
  };

  // webview/config/GestureConfig.ts
  var defaultConfig = {
    performance: {
      telemetrySampleRate: 30,
      // Sample every 30 frames
      messageThrottleMs: 100,
      // Throttle messages to 100ms
      confidenceChangeThreshold: 0.05
      // 5% confidence change threshold
    },
    thresholds: {
      mlpConfidence: 0.4,
      fallbackConfidence: 0.3,
      emergencyConfidence: 0.3
    },
    camera: {
      facingMode: "user",
      mirrorOverlay: true,
      idealWidth: 1280,
      idealHeight: 720
    },
    gestures: {
      sizeTolerance: 0.3,
      partialThreshold: 0.6,
      completionTimeout: 2e3
    },
    timing: {
      loadTimeoutMs: 8e3,
      emergencyCooldownMs: 1e3,
      frameLatencySampleInterval: 90
    },
    // Amy First: Default preferences and adaptive settings
    amyPreferences: {
      intensity: "normal",
      timeBasedAdjustments: true,
      contextAwareness: true,
      favoriteGestures: [],
      challengingGestures: []
    },
    adaptiveSettings: {
      morningMode: {
        // Gentler settings for morning routine
        thresholds: { mlpConfidence: 0.35, fallbackConfidence: 0.25 },
        gestures: { sizeTolerance: 0.4 },
        // More tolerant for morning
        timing: { emergencyCooldownMs: 1500 }
        // Slightly longer cooldown
      },
      afternoonMode: {
        // Learning-focused settings
        thresholds: { mlpConfidence: 0.45, fallbackConfidence: 0.35 },
        gestures: { sizeTolerance: 0.25 },
        // Stricter for learning
        performance: { messageThrottleMs: 80 }
        // Faster feedback
      },
      eveningMode: {
        // Relaxation-focused settings
        thresholds: { mlpConfidence: 0.4, fallbackConfidence: 0.3 },
        gestures: { sizeTolerance: 0.35 },
        timing: { emergencyCooldownMs: 1200 }
      },
      highActivityMode: {
        // When Amy is very active
        performance: { messageThrottleMs: 120 },
        // Slightly slower to prevent overwhelm
        gestures: { sizeTolerance: 0.4 }
        // More tolerant
      },
      lowActivityMode: {
        // When Amy is less active
        performance: { messageThrottleMs: 90 },
        // Faster feedback to encourage
        gestures: { sizeTolerance: 0.3 }
        // Standard tolerance
      }
    }
  };
  function loadConfig() {
    const config = { ...defaultConfig };
    const windowConfig = window;
    if (windowConfig) {
      config.thresholds.mlpConfidence = windowConfig.__mlpThreshold ?? config.thresholds.mlpConfidence;
      config.thresholds.fallbackConfidence = windowConfig.__fallbackThreshold ?? config.thresholds.fallbackConfidence;
      config.camera.facingMode = windowConfig.__facingMode ?? config.camera.facingMode;
      config.camera.mirrorOverlay = windowConfig.__mirrorOverlay ?? config.camera.mirrorOverlay;
      config.gestures.sizeTolerance = windowConfig.__gestureSizeTolerance ?? config.gestures.sizeTolerance;
      if (windowConfig.__amyIntensity) {
        config.amyPreferences.intensity = windowConfig.__amyIntensity;
      }
      if (windowConfig.__amyTimeBased !== void 0) {
        config.amyPreferences.timeBasedAdjustments = windowConfig.__amyTimeBased;
      }
      if (windowConfig.__amyContextAware !== void 0) {
        config.amyPreferences.contextAwareness = windowConfig.__amyContextAware;
      }
    }
    return config;
  }

  // webview/core/GestureDetector.ts
  var GestureDetector = class {
    constructor(video2, overlay2) {
      this.gestureRecognizer = null;
      this.running = false;
      this.video = video2;
      this.overlay = overlay2;
      this.config = loadConfig();
      this.resourceManager = new ResourceManager();
      this.cameraManager = new CameraManager(video2, this.resourceManager);
      this.overlayRenderer = new OverlayRenderer(overlay2);
      this.healthMonitor = new HealthMonitor();
    }
    /**
     * Set callback for gesture results
     */
    setResultCallback(callback) {
      this.resultCallback = callback;
    }
    /**
     * Initialize the gesture detector
     */
    async initialize() {
      try {
        const components = await loadTasksVision();
        const vision = await components.FilesetResolver.forVisionTasks(components.wasmBase);
        const baseOptions = {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU"
        };
        try {
          this.gestureRecognizer = await components.GestureRecognizer.createFromOptions(vision, {
            baseOptions,
            runningMode: "VIDEO",
            numHands: 2
          });
        } catch (gpuErr) {
          console.warn("GPU delegate failed, falling back to CPU:", gpuErr);
          this.gestureRecognizer = await components.GestureRecognizer.createFromOptions(vision, {
            baseOptions: { ...baseOptions, delegate: "CPU" },
            runningMode: "VIDEO",
            numHands: 2
          });
        }
        this.video.addEventListener("loadeddata", () => this.startDetection());
        this.resourceManager.registerEventListener(this.video, "loadeddata", () => this.startDetection());
      } catch (error) {
        console.error("Failed to initialize gesture detector:", error);
        throw error;
      }
    }
    /**
     * Start camera and detection
     */
    async start() {
      await this.cameraManager.startCamera();
    }
    /**
     * Start gesture detection loop
     */
    startDetection() {
      if (this.running) return;
      this.running = true;
      this.detectFrame();
    }
    /**
     * Main detection loop with performance optimizations
     */
    detectFrame() {
      if (!this.running || !this.gestureRecognizer) return;
      const frameStart = performance.now();
      try {
        if (this.cameraManager.isVideoReady()) {
          if (this.cameraManager.hasDimensionsChanged()) {
            this.cameraManager.updateVideoDimensions();
            const rect = this.video.getBoundingClientRect();
            this.overlayRenderer.resizeOverlay(rect);
          }
          const recognitionStart = performance.now();
          const results = this.gestureRecognizer.recognizeForVideo(this.video, frameStart);
          const recognitionTime = performance.now() - recognitionStart;
          if (this.resultCallback && results) {
            this.resultCallback(results, frameStart);
          }
          if (results?.landmarks) {
            const shouldRedraw = this.shouldRedrawOverlay(results, recognitionTime);
            if (shouldRedraw) {
              this.overlayRenderer.clear();
              this.overlayRenderer.drawHandLandmarks(results.landmarks, this.config.camera.mirrorOverlay);
            }
          }
          this.healthMonitor.recordFrame(frameStart);
          if (recognitionTime > 50) {
            console.warn(`Slow frame detected: ${recognitionTime.toFixed(2)}ms`);
          }
        }
      } catch (error) {
        console.error("Gesture detection error:", error);
        this.healthMonitor.recordError();
        if (this.healthMonitor.needsRecovery()) {
          console.warn("Health monitor indicates recovery needed");
        }
      }
      requestAnimationFrame(() => this.detectFrame());
    }
    /**
     * Determine if overlay should be redrawn to optimize performance
     */
    shouldRedrawOverlay(results, recognitionTime) {
      if (results?.landmarks && results.landmarks.length > 0) {
        return true;
      }
      return recognitionTime < 30;
    }
    /**
     * Stop detection and cleanup
     */
    async stop() {
      this.running = false;
      if (this.gestureRecognizer?.close) {
        await this.gestureRecognizer.close();
      }
      await this.cameraManager.stopCamera();
      await this.resourceManager.dispose();
    }
    /**
     * Get current configuration
     */
    getConfig() {
      return this.config;
    }
  };

  // webview/gestureProcessing.ts
  var PartialGestureDetector = class {
    constructor() {
      this.gesturePatterns = /* @__PURE__ */ new Map();
      this.partialThreshold = 0.6;
      // Minimum completion percentage to consider
      this.completionTimeout = 2e3;
      // Time window to complete gesture (ms)
      this.activePartialGestures = /* @__PURE__ */ new Map();
    }
    /**
     * Set the partial completion threshold
     */
    setThreshold(threshold) {
      this.partialThreshold = Math.max(0.3, Math.min(0.9, threshold));
    }
    /**
     * Analyze hand pose for partial gesture completion
     */
    analyzePartialCompletion(landmarks, gestureId) {
      if (landmarks.length === 0) {
        return { isPartial: false, completion: 0, confidence: 0, feedback: "" };
      }
      const hand = landmarks[0];
      if (!hand || hand.length < 21) {
        return { isPartial: false, completion: 0, confidence: 0, feedback: "" };
      }
      switch (gestureId) {
        case "thumbs_up":
          return this.analyzeThumbsUpPartial(hand);
        case "open_palm":
          return this.analyzeOpenPalmPartial(hand);
        case "fist":
          return this.analyzeFistPartial(hand);
        case "point":
          return this.analyzePointPartial(hand);
        default:
          return { isPartial: false, completion: 0, confidence: 0, feedback: "" };
      }
    }
    analyzeThumbsUpPartial(hand) {
      const thumbExtended = hand[4][1] < hand[3][1];
      const indexCurled = hand[8][1] > hand[6][1];
      const middleCurled = hand[12][1] > hand[10][1];
      const ringCurled = hand[16][1] > hand[14][1];
      const pinkyCurled = hand[20][1] > hand[18][1];
      const completion = (thumbExtended ? 1 : 0) + (indexCurled ? 1 : 0) + (middleCurled ? 1 : 0) + (ringCurled ? 1 : 0) + (pinkyCurled ? 1 : 0);
      const normalizedCompletion = completion / 5;
      const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1;
      let feedback = "";
      if (isPartial) {
        if (!thumbExtended) {
          feedback = "Streck deinen Daumen nach oben";
        } else if (!indexCurled) {
          feedback = "Mach eine Faust mit den Fingern";
        }
      }
      return {
        isPartial,
        completion: normalizedCompletion,
        confidence: normalizedCompletion * 0.8,
        feedback
      };
    }
    analyzeOpenPalmPartial(hand) {
      const fingers = [
        { tip: 8, joint: 6 },
        // Index
        { tip: 12, joint: 10 },
        // Middle
        { tip: 16, joint: 14 },
        // Ring
        { tip: 20, joint: 18 },
        // Pinky
        { tip: 4, joint: 3 }
        // Thumb
      ];
      let extendedCount = 0;
      for (const finger of fingers) {
        if (hand[finger.tip][1] < hand[finger.joint][1]) {
          extendedCount++;
        }
      }
      const normalizedCompletion = extendedCount / fingers.length;
      const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1;
      let feedback = "";
      if (isPartial) {
        feedback = "Streck alle Finger aus f\xFCr eine offene Hand";
      }
      return {
        isPartial,
        completion: normalizedCompletion,
        confidence: normalizedCompletion * 0.8,
        feedback
      };
    }
    analyzeFistPartial(hand) {
      const fingers = [
        { tip: 8, joint: 6 },
        // Index
        { tip: 12, joint: 10 },
        // Middle
        { tip: 16, joint: 14 },
        // Ring
        { tip: 20, joint: 18 }
        // Pinky
      ];
      let curledCount = 0;
      for (const finger of fingers) {
        if (hand[finger.tip][1] > hand[finger.joint][1]) {
          curledCount++;
        }
      }
      const normalizedCompletion = curledCount / fingers.length;
      const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1;
      let feedback = "";
      if (isPartial) {
        feedback = "Schlie\xDFe deine Hand zur Faust";
      }
      return {
        isPartial,
        completion: normalizedCompletion,
        confidence: normalizedCompletion * 0.8,
        feedback
      };
    }
    analyzePointPartial(hand) {
      const indexExtended = hand[8][1] < hand[6][1];
      const middleCurled = hand[12][1] > hand[10][1];
      const ringCurled = hand[16][1] > hand[14][1];
      const pinkyCurled = hand[20][1] > hand[18][1];
      const completion = (indexExtended ? 1 : 0) + (middleCurled ? 1 : 0) + (ringCurled ? 1 : 0) + (pinkyCurled ? 1 : 0);
      const normalizedCompletion = completion / 4;
      const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1;
      let feedback = "";
      if (isPartial) {
        if (!indexExtended) {
          feedback = "Streck deinen Zeigefinger aus";
        } else if (!middleCurled || !ringCurled || !pinkyCurled) {
          feedback = "Mach eine Faust mit den anderen Fingern";
        }
      }
      return {
        isPartial,
        completion: normalizedCompletion,
        confidence: normalizedCompletion * 0.8,
        feedback
      };
    }
  };
  var TremorCompensator = class {
    constructor() {
      this.landmarkHistory = [];
      this.MAX_HISTORY = 5;
      // Keep last 5 frames for smoothing
      this.SMOOTHING_FACTOR = 0.7;
    }
    // How much to smooth (0-1)
    /**
     * Add new landmarks to history and return smoothed version
     */
    smoothLandmarks(landmarks) {
      this.landmarkHistory.push(JSON.parse(JSON.stringify(landmarks)));
      if (this.landmarkHistory.length > this.MAX_HISTORY) {
        this.landmarkHistory.shift();
      }
      if (this.landmarkHistory.length < 2) {
        return landmarks;
      }
      const smoothed = JSON.parse(JSON.stringify(landmarks));
      for (let handIdx = 0; handIdx < landmarks.length; handIdx++) {
        const hand = landmarks[handIdx];
        if (!hand) continue;
        for (let pointIdx = 0; pointIdx < hand.length; pointIdx++) {
          const currentPoint = hand[pointIdx];
          if (!currentPoint) continue;
          let smoothedX = currentPoint[0];
          let smoothedY = currentPoint[1];
          let smoothedZ = currentPoint[2] || 0;
          let totalWeight = 1;
          for (let historyIdx = 0; historyIdx < this.landmarkHistory.length - 1; historyIdx++) {
            const weight = Math.pow(1 - this.SMOOTHING_FACTOR, historyIdx + 1);
            const historyHand = this.landmarkHistory[historyIdx][handIdx];
            if (historyHand && historyHand[pointIdx]) {
              const historyPoint = historyHand[pointIdx];
              smoothedX += historyPoint[0] * weight;
              smoothedY += historyPoint[1] * weight;
              smoothedZ += (historyPoint[2] || 0) * weight;
              totalWeight += weight;
            }
          }
          smoothed[handIdx][pointIdx] = [
            smoothedX / totalWeight,
            smoothedY / totalWeight,
            smoothedZ / totalWeight
          ];
        }
      }
      return smoothed;
    }
    /**
     * Detect if movement is likely intentional vs tremor
     */
    isIntentionalMovement(currentLandmarks, previousLandmarks) {
      if (!previousLandmarks || previousLandmarks.length === 0) {
        return true;
      }
      let totalMovement = 0;
      let pointCount = 0;
      for (let handIdx = 0; handIdx < Math.min(currentLandmarks.length, previousLandmarks.length); handIdx++) {
        const currentHand = currentLandmarks[handIdx];
        const previousHand = previousLandmarks[handIdx];
        if (!currentHand || !previousHand) continue;
        for (let pointIdx = 0; pointIdx < Math.min(currentHand.length, previousHand.length); pointIdx++) {
          const currentPoint = currentHand[pointIdx];
          const previousPoint = previousHand[pointIdx];
          if (!currentPoint || !previousPoint) continue;
          const distance = Math.sqrt(
            Math.pow(currentPoint[0] - previousPoint[0], 2) + Math.pow(currentPoint[1] - previousPoint[1], 2) + Math.pow((currentPoint[2] || 0) - (previousPoint[2] || 0), 2)
          );
          totalMovement += distance;
          pointCount++;
        }
      }
      if (pointCount === 0) return true;
      const averageMovement = totalMovement / pointCount;
      const INTENTIONAL_MOVEMENT_THRESHOLD = 0.02;
      return averageMovement > INTENTIONAL_MOVEMENT_THRESHOLD;
    }
    /**
     * Clear history (useful when switching gestures or starting new session)
     */
    clearHistory() {
      this.landmarkHistory = [];
    }
  };

  // webview/utils/CelebrationSystem.ts
  var CelebrationSystem = class {
    constructor() {
      this.attemptHistory = [];
      this.MAX_HISTORY = 20;
      this.encouragementPatterns = {
        morning: {
          success: ["\u{1F305} Guten Morgen! Das war toll!", "\u{1F31E} Super Start in den Tag!", "\u2600\uFE0F Morgenstund hat Gold im Mund!"],
          effort: ["\u{1F305} Guter Anfang! Weiter so!", "\u{1F31E} Du machst das prima!", "\u2600\uFE0F Morgenroutine wird besser!"]
        },
        afternoon: {
          success: ["\u{1F324}\uFE0F Tolle Leistung am Nachmittag!", "\u{1F31E} Nachmittags-Erfolg!", "\u2600\uFE0F Du strahlst heute!"],
          effort: ["\u{1F324}\uFE0F Guter Versuch! Pause machen?", "\u{1F31E} Du gibst nicht auf - super!", "\u2600\uFE0F Nachmittag wird besser!"]
        },
        evening: {
          success: ["\u{1F319} Abends nochmal perfekt!", "\u{1F303} Toller Tagesabschluss!", "\u2B50 Du warst heute gro\xDFartig!"],
          effort: ["\u{1F319} Guter Abendversuch!", "\u{1F303} Morgen ist ein neuer Tag!", "\u2B50 Du hast heute viel gelernt!"]
        }
      };
      this.progressCelebrations = [
        "\u{1F3AF} Neue Bestleistung!",
        "\u{1F680} Du wirst immer besser!",
        "\u{1F4AA} Starke Verbesserung!",
        "\u{1F389} Pers\xF6nlicher Rekord!",
        "\u{1F31F} Du \xFCberraschst dich selbst!"
      ];
      this.gentleEncouragements = [
        "Das wird schon - jeder f\xE4ngt klein an",
        "Jeder Versuch bringt dich weiter",
        "Du lernst jeden Tag etwas Neues",
        "Es ist okay, wenn es nicht sofort klappt",
        "Du bist mutig, weil du es versuchst",
        "Jeder Experte war mal Anf\xE4nger",
        "Du machst das schon richtig gut",
        "Kleine Schritte f\xFChren zu gro\xDFen Erfolgen"
      ];
    }
    generateCelebration(attemptResult) {
      this.attemptHistory.push(attemptResult);
      if (this.attemptHistory.length > this.MAX_HISTORY) {
        this.attemptHistory.shift();
      }
      const timePatterns = this.encouragementPatterns[attemptResult.timeOfDay];
      let message = "";
      let emoji = "";
      let encouragement = "";
      if (attemptResult.success) {
        if (attemptResult.isEmergency) {
          message = "\u{1F198} Notfall perfekt erkannt!";
          emoji = "\u{1F198}";
          encouragement = "Du bist sicher - das war wichtig!";
        } else {
          const successMessages = timePatterns.success;
          message = successMessages[Math.floor(Math.random() * successMessages.length)];
          emoji = this.getSuccessEmoji(attemptResult);
          if (this.isSignificantProgress(attemptResult)) {
            encouragement = this.progressCelebrations[Math.floor(Math.random() * this.progressCelebrations.length)];
          } else {
            encouragement = this.getPersonalizedEncouragement(attemptResult);
          }
        }
      } else {
        if (attemptResult.partialSuccess) {
          message = "\u2728 Fast geschafft! Das war nah dran!";
          emoji = "\u2728";
          encouragement = "Du bist so nah an der L\xF6sung!";
        } else {
          const effortMessages = timePatterns.effort;
          message = effortMessages[Math.floor(Math.random() * effortMessages.length)];
          emoji = this.getEffortEmoji(attemptResult);
          encouragement = this.getGentleEncouragement(attemptResult);
        }
      }
      return {
        message,
        emoji,
        encouragement,
        showProgress: this.shouldShowProgress(attemptResult)
      };
    }
    getSuccessEmoji(result) {
      const emojis = ["\u{1F389}", "\u{1F31F}", "\u{1F4AB}", "\u2728", "\u{1F38A}", "\u{1F3C6}", "\u{1F44F}", "\u{1F64C}"];
      if (result.recentSuccessRate > 0.8) {
        return emojis[Math.floor(Math.random() * emojis.length)];
      } else {
        return ["\u{1F31F}", "\u{1F4AB}", "\u2728", "\u{1F38A}"][Math.floor(Math.random() * 4)];
      }
    }
    getEffortEmoji(result) {
      if (result.effort > 0.8) {
        return "\u{1F4AA}";
      } else if (result.effort > 0.6) {
        return "\u{1F44D}";
      } else {
        return "\u{1F917}";
      }
    }
    isSignificantProgress(result) {
      if (this.attemptHistory.length < 5) return false;
      const recent = this.attemptHistory.slice(-5);
      const successRate = recent.filter((r) => r.success).length / recent.length;
      return successRate > result.recentSuccessRate + 0.1;
    }
    getPersonalizedEncouragement(result) {
      const recentAttempts = this.attemptHistory.slice(-10);
      const gestureAttempts = recentAttempts.filter((r) => r.gesture === result.gesture);
      if (gestureAttempts.length > 3) {
        return `Du \xFCbst "${result.gesture}" - das wird immer besser!`;
      }
      switch (result.timeOfDay) {
        case "morning":
          return "Guter Start! Der Tag wird super!";
        case "afternoon":
          return "Mittagspause? Du machst das toll!";
        case "evening":
          return "Toller Tagesabschluss!";
        default:
          return "Du machst das prima!";
      }
    }
    getGentleEncouragement(result) {
      const recentMessages = this.attemptHistory.slice(-5).map((r) => r.effort).filter((effort) => effort < 0.7);
      if (recentMessages.length > 2) {
        return this.gentleEncouragements[Math.floor(Math.random() * this.gentleEncouragements.length)];
      }
      if (result.effort > 0.5) {
        return "Guter Versuch! Du lernst dazu!";
      } else {
        return "Jeder Anfang ist schwer - du schaffst das!";
      }
    }
    shouldShowProgress(result) {
      const recent = this.attemptHistory.slice(-10);
      const gestureCount = recent.filter((r) => r.gesture === result.gesture).length;
      return gestureCount >= 3 && result.recentSuccessRate > 0.3;
    }
    getProgressStats() {
      if (this.attemptHistory.length === 0) {
        return {
          totalAttempts: 0,
          successRate: 0,
          mostPracticedGesture: "",
          improvementTrend: "stable"
        };
      }
      const totalAttempts = this.attemptHistory.length;
      const successRate = this.attemptHistory.filter((r) => r.success).length / totalAttempts;
      const gestureCounts = this.attemptHistory.reduce((acc, result) => {
        acc[result.gesture] = (acc[result.gesture] || 0) + 1;
        return acc;
      }, {});
      const mostPracticedGesture = Object.entries(gestureCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "";
      const recent = this.attemptHistory.slice(-10);
      const older = this.attemptHistory.slice(-20, -10);
      let improvementTrend = "stable";
      if (recent.length >= 5 && older.length >= 5) {
        const recentRate = recent.filter((r) => r.success).length / recent.length;
        const olderRate = older.filter((r) => r.success).length / older.length;
        if (recentRate > olderRate + 0.1) {
          improvementTrend = "improving";
        } else if (recentRate < olderRate - 0.1) {
          improvementTrend = "needs_attention";
        }
      }
      return {
        totalAttempts,
        successRate,
        mostPracticedGesture,
        improvementTrend
      };
    }
    reset() {
      this.attemptHistory = [];
    }
  };

  // webview/utils/FeedbackSystem.ts
  var FeedbackSystem = class {
    constructor() {
      this.feedbackHistory = [];
      this.MAX_HISTORY = 15;
      this.frustrationThreshold = 3;
      // Consecutive low-effort attempts
      // Mood-aware feedback patterns
      this.moodBasedFeedback = {
        calm: {
          high_effort: ["Ruhig und konzentriert - das klappt super!", "Gelassen und pr\xE4zise - weiter so!"],
          medium_effort: ["Ganz ruhig bleiben - du schaffst das!", "Nimm dir Zeit - Qualit\xE4t vor Schnelligkeit!"],
          low_effort: ["Alles okay - atme tief durch und versuche es nochmal", "Kein Stress - jeder braucht mal eine Pause"]
        },
        frustrated: {
          high_effort: ["Toll! Du gibst nicht auf - das ist der Weg!", "Deine Beharrlichkeit zahlt sich aus!"],
          medium_effort: ["Du k\xE4mpfst weiter - das ist bewundernswert!", "Jeder Versuch bringt dich n\xE4her ans Ziel!"],
          low_effort: ["Pause machen? Das ist v\xF6llig in Ordnung!", "Manchmal braucht man einfach eine kurze Pause"]
        },
        excited: {
          high_effort: ["Wow! Deine Energie ist ansteckend!", "So viel Enthusiasmus - fantastisch!"],
          medium_effort: ["Dein Eifer ist toll - bleib dran!", "Du machst das mit so viel Herz!"],
          low_effort: ["Auch bei weniger Energie - du gibst dein Bestes!", "Jeder Moment z\xE4hlt - auch die kleineren Versuche"]
        },
        tired: {
          high_effort: ["Trotz M\xFCdigkeit so pr\xE4zise - beeindruckend!", "Deine Ausdauer ist bemerkenswert!"],
          medium_effort: ["Du gibst nicht auf - das ist stark!", "Auch m\xFCde bleibst du am Ball!"],
          low_effort: ["M\xFCdigkeit ist normal - g\xF6nn dir eine Pause", "Ruh dich aus - morgen ist ein neuer Tag"]
        }
      };
      // Gesture-specific feedback
      this.gestureSpecificFeedback = {
        thumbs_up: {
          encouragement: "Daumen hoch ist ein wichtiges Zeichen!",
          tip: "Streck deinen Daumen gerade nach oben"
        },
        point: {
          encouragement: "Zeigefinger ist super f\xFCr Kommunikation!",
          tip: "Streck nur den Zeigefinger aus, andere Finger einrollen"
        },
        open_palm: {
          encouragement: "Offene Hand zeigt Vertrauen!",
          tip: "Alle Finger ausstrecken wie zum Winken"
        },
        fist: {
          encouragement: "Faust ist stark und klar!",
          tip: "Alle Finger fest zur Faust schlie\xDFen"
        },
        emergency: {
          encouragement: "Notfallzeichen sind lebenswichtig!",
          tip: "Diese Geste hat h\xF6chste Priorit\xE4t"
        }
      };
      // Time-based encouragement to prevent repetition
      this.timeBasedVariations = {
        short_break: ["Kurze Pause - dann weiter!", "Atme durch - du machst das gut!"],
        long_break: ["Zur\xFCck und bereit? Super!", "Frisch und munter - los geht's!"],
        consistent_practice: ["Regelm\xE4\xDFigkeit zahlt sich aus!", "Du bleibst dran - das ist toll!"],
        first_attempt_today: ["Guten Start in den Tag!", "Frisch und bereit - das wird super!"]
      };
    }
    generateFeedback(attemptResult) {
      this.feedbackHistory.push(attemptResult);
      if (this.feedbackHistory.length > this.MAX_HISTORY) {
        this.feedbackHistory.shift();
      }
      const mood = attemptResult.userMood || this.detectMood(attemptResult);
      const effortLevel = this.categorizeEffort(attemptResult.effort);
      const moodFeedback = this.moodBasedFeedback[mood][effortLevel];
      const primaryMessage = moodFeedback[Math.floor(Math.random() * moodFeedback.length)];
      const gestureFeedback = this.gestureSpecificFeedback[attemptResult.gesture] || this.gestureSpecificFeedback[attemptResult.gestureType === "emergency" ? "emergency" : "thumbs_up"];
      let secondaryMessage = gestureFeedback.encouragement;
      let tip;
      let showBreakSuggestion = false;
      if (this.detectFrustration()) {
        secondaryMessage = "Manchmal braucht man einfach eine Pause - das ist v\xF6llig normal!";
        showBreakSuggestion = true;
      } else if (attemptResult.attemptCount > 5) {
        const variations = this.timeBasedVariations.consistent_practice;
        secondaryMessage = variations[Math.floor(Math.random() * variations.length)];
      } else if (attemptResult.timeSinceLastAttempt > 3e5) {
        const variations = this.timeBasedVariations.long_break;
        secondaryMessage = variations[Math.floor(Math.random() * variations.length)];
      }
      if (!attemptResult.success && attemptResult.effort < 0.7) {
        tip = gestureFeedback.tip;
      }
      const encouragement = this.generateEncouragement(attemptResult, mood);
      return {
        primaryMessage,
        secondaryMessage,
        tip,
        showBreakSuggestion,
        encouragement
      };
    }
    detectMood(attempt) {
      if (attempt.userMood) return attempt.userMood;
      const recent = this.feedbackHistory.slice(-5);
      if (recent.length < 3) return "calm";
      const lowEffortCount = recent.filter((r) => r.effort < 0.5).length;
      if (lowEffortCount >= 3) return "frustrated";
      const highEffortCount = recent.filter((r) => r.effort > 0.8).length;
      if (highEffortCount >= 3) return "excited";
      const recentEffort = recent.slice(-3).reduce((sum, r) => sum + r.effort, 0) / 3;
      const olderEffort = recent.slice(0, 3).reduce((sum, r) => sum + r.effort, 0) / 3;
      if (recentEffort < olderEffort - 0.2) return "tired";
      return "calm";
    }
    categorizeEffort(effort) {
      if (effort > 0.8) return "high_effort";
      if (effort > 0.6) return "medium_effort";
      return "low_effort";
    }
    detectFrustration() {
      if (this.feedbackHistory.length < this.frustrationThreshold) return false;
      const recent = this.feedbackHistory.slice(-this.frustrationThreshold);
      const lowEffortCount = recent.filter((r) => r.effort < 0.5).length;
      return lowEffortCount >= this.frustrationThreshold;
    }
    generateEncouragement(attempt, mood) {
      const encouragements = {
        calm: [
          "Du gehst das ganz ruhig an - das ist perfekt!",
          "Gelassenheit ist deine Superkraft!",
          "Ruhig und sicher - so kommst du ans Ziel!"
        ],
        frustrated: [
          "Du gibst nicht auf - das ist bewundernswert!",
          "Jeder Experte kennt frustrierende Momente!",
          "Deine Beharrlichkeit wird belohnt werden!"
        ],
        excited: [
          "Deine Energie ist ansteckend!",
          "So viel Enthusiasmus - das macht Spa\xDF!",
          "Du gehst mit Herzblut ran!"
        ],
        tired: [
          "Trotz M\xFCdigkeit bleibst du dran - stark!",
          "Ausdauer ist eine der wichtigsten Eigenschaften!",
          "Du zeigst wahre Entschlossenheit!"
        ]
      };
      const moodEncouragements = encouragements[mood] || encouragements.calm;
      return moodEncouragements[Math.floor(Math.random() * moodEncouragements.length)];
    }
    getFeedbackStats() {
      if (this.feedbackHistory.length === 0) {
        return {
          averageEffort: 0,
          frustrationLevel: "low",
          recommendedBreak: false,
          mostPracticedGesture: ""
        };
      }
      const averageEffort = this.feedbackHistory.reduce((sum, r) => sum + r.effort, 0) / this.feedbackHistory.length;
      const recent = this.feedbackHistory.slice(-5);
      const lowEffortCount = recent.filter((r) => r.effort < 0.5).length;
      let frustrationLevel = "low";
      if (lowEffortCount >= 3) frustrationLevel = "high";
      else if (lowEffortCount >= 2) frustrationLevel = "medium";
      const gestureCounts = this.feedbackHistory.reduce((acc, result) => {
        acc[result.gesture] = (acc[result.gesture] || 0) + 1;
        return acc;
      }, {});
      const mostPracticedGesture = Object.entries(gestureCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "";
      return {
        averageEffort,
        frustrationLevel,
        recommendedBreak: frustrationLevel === "high" || averageEffort < 0.4,
        mostPracticedGesture
      };
    }
    reset() {
      this.feedbackHistory = [];
    }
  };

  // webview/utils/PersonalizedThresholdManager.ts
  var PersonalizedThresholdManager = class {
    constructor() {
      this.gesturePerformance = /* @__PURE__ */ new Map();
      this.PERFORMANCE_WINDOW = 50;
      // Track last 50 attempts per gesture
      this.MIN_ATTEMPTS_FOR_PERSONALIZATION = 10;
      this.MAX_THRESHOLD_ADJUSTMENT = 0.3;
      // Max 30% adjustment
      this.LEARNING_RATE = 0.1;
    }
    // How quickly thresholds adapt
    /**
     * Record a gesture attempt for personalization
     */
    recordAttempt(gesture, confidence, success) {
      const existing = this.gesturePerformance.get(gesture) || {
        gesture,
        totalAttempts: 0,
        successfulAttempts: 0,
        averageConfidence: 0,
        lastAttemptTime: Date.now(),
        successRate: 0,
        personalizedThreshold: 0.4
        // Default MLP threshold
      };
      existing.totalAttempts++;
      if (success) {
        existing.successfulAttempts++;
      }
      existing.averageConfidence = (existing.averageConfidence * (existing.totalAttempts - 1) + confidence) / existing.totalAttempts;
      existing.successRate = existing.successfulAttempts / existing.totalAttempts;
      existing.lastAttemptTime = Date.now();
      existing.personalizedThreshold = this.calculatePersonalizedThreshold(existing);
      this.gesturePerformance.set(gesture, existing);
      if (existing.totalAttempts > this.PERFORMANCE_WINDOW) {
        this.trimHistory(gesture);
      }
    }
    /**
     * Get personalized threshold for a gesture
     */
    getPersonalizedThreshold(gesture, baseThreshold) {
      const performance2 = this.gesturePerformance.get(gesture);
      if (!performance2 || performance2.totalAttempts < this.MIN_ATTEMPTS_FOR_PERSONALIZATION) {
        return {
          gesture,
          originalThreshold: baseThreshold,
          adjustedThreshold: baseThreshold,
          reason: "success_rate"
        };
      }
      const adjustment = performance2.personalizedThreshold - baseThreshold;
      const clampedAdjustment = Math.max(
        -this.MAX_THRESHOLD_ADJUSTMENT,
        Math.min(this.MAX_THRESHOLD_ADJUSTMENT, adjustment)
      );
      return {
        gesture,
        originalThreshold: baseThreshold,
        adjustedThreshold: baseThreshold + clampedAdjustment,
        reason: this.getAdjustmentReason(performance2)
      };
    }
    /**
     * Get all personalized thresholds
     */
    getAllPersonalizedThresholds(baseThreshold) {
      const adjustments = [];
      for (const [gesture, performance2] of this.gesturePerformance) {
        if (performance2.totalAttempts >= this.MIN_ATTEMPTS_FOR_PERSONALIZATION) {
          adjustments.push(this.getPersonalizedThreshold(gesture, baseThreshold));
        }
      }
      return adjustments;
    }
    /**
     * Get performance insights for Amy's dashboard
     */
    getPerformanceInsights() {
      const performances = Array.from(this.gesturePerformance.values());
      const totalGestures = performances.length;
      const wellPerformingGestures = performances.filter((p) => p.successRate > 0.8 && p.totalAttempts >= this.MIN_ATTEMPTS_FOR_PERSONALIZATION).map((p) => p.gesture);
      const needsPracticeGestures = performances.filter((p) => p.successRate < 0.6 && p.totalAttempts >= this.MIN_ATTEMPTS_FOR_PERSONALIZATION).map((p) => p.gesture);
      const averageSuccessRate = performances.length > 0 ? performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length : 0;
      return {
        totalGestures,
        wellPerformingGestures,
        needsPracticeGestures,
        averageSuccessRate
      };
    }
    /**
     * Reset performance data (for testing or fresh start)
     */
    reset() {
      this.gesturePerformance.clear();
    }
    /**
     * Export performance data for persistence
     */
    exportPerformanceData() {
      const data = {};
      for (const [gesture, performance2] of this.gesturePerformance) {
        data[gesture] = { ...performance2 };
      }
      return data;
    }
    /**
     * Import performance data from persistence
     */
    importPerformanceData(data) {
      this.gesturePerformance.clear();
      for (const [gesture, performance2] of Object.entries(data)) {
        this.gesturePerformance.set(gesture, { ...performance2 });
      }
    }
    calculatePersonalizedThreshold(performance2) {
      const { successRate, averageConfidence, totalAttempts } = performance2;
      let threshold = 0.4;
      if (successRate > 0.8) {
        threshold += 0.05;
      } else if (successRate < 0.5) {
        threshold -= 0.1;
      }
      if (averageConfidence > 0.7) {
        threshold += 0.03;
      } else if (averageConfidence < 0.4) {
        threshold -= 0.05;
      }
      if (totalAttempts < 20) {
        threshold -= 0.05;
      }
      return Math.max(0.2, Math.min(0.6, threshold));
    }
    getAdjustmentReason(performance2) {
      if (performance2.successRate > 0.8) {
        return "success_rate";
      } else if (performance2.totalAttempts < 20) {
        return "learning_curve";
      } else {
        return "recent_performance";
      }
    }
    trimHistory(gesture) {
    }
  };

  // webview/utils/GestureCombinationManager.ts
  var GestureCombinationManager = class {
    constructor() {
      this.gestureHistory = [];
      this.HISTORY_SIZE = 10;
      this.MAX_SEQUENCE_TIME = 5e3;
      // 5 seconds max between gestures
      this.MIN_SEQUENCE_TIME = 200;
      // 200ms min between gestures
      // Predefined combinations for Amy's communication needs
      this.predefinedCombinations = [
        {
          gestures: ["thumbs_up", "thumbs_up"],
          combinationName: "double_thumbs_up",
          description: "Super happy / Great job!",
          timeWindow: 2e3,
          minConfidence: 0.6
        },
        {
          gestures: ["thumbs_up", "open_palm"],
          combinationName: "thumbs_up_open_palm",
          description: "I want to play / Let's have fun!",
          timeWindow: 2500,
          minConfidence: 0.6
        },
        {
          gestures: ["fist", "open_palm"],
          combinationName: "fist_open_palm",
          description: "Stop / No more",
          timeWindow: 2e3,
          minConfidence: 0.6
        },
        {
          gestures: ["point", "thumbs_up"],
          combinationName: "point_thumbs_up",
          description: "I like that / Good choice",
          timeWindow: 3e3,
          minConfidence: 0.6
        },
        {
          gestures: ["open_palm", "fist"],
          combinationName: "open_palm_fist",
          description: "Help me / I need assistance",
          timeWindow: 2500,
          minConfidence: 0.6
        },
        {
          gestures: ["thumbs_up", "point"],
          combinationName: "thumbs_up_point",
          description: "Show me / Tell me more",
          timeWindow: 3e3,
          minConfidence: 0.6
        }
      ];
      this.customCombinations = [];
    }
    /**
     * Record a gesture for combination detection
     */
    recordGesture(gesture, confidence) {
      const timestamp = Date.now();
      this.gestureHistory.push({
        gesture,
        confidence,
        timestamp
      });
      if (this.gestureHistory.length > this.HISTORY_SIZE) {
        this.gestureHistory.shift();
      }
      this.cleanOldGestures();
    }
    /**
     * Check for completed gesture combinations
     */
    checkForCombinations() {
      if (this.gestureHistory.length < 2) {
        return null;
      }
      for (const combination of this.predefinedCombinations) {
        const result = this.checkCombination(combination);
        if (result) {
          return result;
        }
      }
      for (const combination of this.customCombinations) {
        const result = this.checkCombination(combination);
        if (result) {
          return result;
        }
      }
      return null;
    }
    /**
     * Check if a specific combination is completed
     */
    checkCombination(sequence) {
      const { gestures, combinationName, description, timeWindow, minConfidence } = sequence;
      if (this.gestureHistory.length < gestures.length) {
        return null;
      }
      const now = Date.now();
      const recentGestures = this.gestureHistory.filter(
        (h) => now - h.timestamp <= timeWindow
      );
      if (recentGestures.length < gestures.length) {
        return null;
      }
      const sequenceMatches = this.checkSequenceMatch(recentGestures, gestures, minConfidence);
      if (!sequenceMatches) {
        return null;
      }
      const matchedGestures = recentGestures.slice(-gestures.length);
      const avgConfidence = matchedGestures.reduce((sum, g) => sum + g.confidence, 0) / matchedGestures.length;
      const timeSpan = matchedGestures[matchedGestures.length - 1].timestamp - matchedGestures[0].timestamp;
      this.clearMatchedGestures(matchedGestures);
      return {
        combination: combinationName,
        confidence: avgConfidence,
        sequence: matchedGestures.map((g) => g.gesture),
        description,
        timeSpan,
        feedback: this.generateCombinationFeedback(combinationName, avgConfidence)
      };
    }
    /**
     * Check if recent gestures match the expected sequence
     */
    checkSequenceMatch(recentGestures, expectedSequence, minConfidence) {
      if (recentGestures.length < expectedSequence.length) {
        return false;
      }
      const candidateGestures = recentGestures.slice(-expectedSequence.length);
      for (let i = 0; i < expectedSequence.length; i++) {
        if (candidateGestures[i].gesture !== expectedSequence[i] || candidateGestures[i].confidence < minConfidence) {
          return false;
        }
      }
      for (let i = 1; i < candidateGestures.length; i++) {
        const timeDiff = candidateGestures[i].timestamp - candidateGestures[i - 1].timestamp;
        if (timeDiff < this.MIN_SEQUENCE_TIME || timeDiff > this.MAX_SEQUENCE_TIME) {
          return false;
        }
      }
      return true;
    }
    /**
     * Clear matched gestures from history to prevent duplicate detection
     */
    clearMatchedGestures(matchedGestures) {
      const matchedTimestamps = new Set(matchedGestures.map((g) => g.timestamp));
      this.gestureHistory = this.gestureHistory.filter((g) => !matchedTimestamps.has(g.timestamp));
    }
    /**
     * Generate feedback for successful combination
     */
    generateCombinationFeedback(combinationName, confidence) {
      const baseMessages = {
        double_thumbs_up: ["Fantastic! You're so happy!", "Super thumbs up! Great job!", "Double happy! \u{1F389}"],
        thumbs_up_open_palm: ["Let's play! You want to have fun!", "Play time! Great idea!", "Fun time ahead! \u{1F388}"],
        fist_open_palm: ["Okay, we'll stop now.", "Got it, time to finish.", "Stopping as requested."],
        point_thumbs_up: ["You like that choice!", "Good pick! You made a great choice!", "Perfect selection! \u{1F44D}"],
        open_palm_fist: ["I'm here to help!", "Help is on the way!", "Let me assist you! \u{1F91D}"],
        thumbs_up_point: ["You want to learn more!", "Curious mind! Let's explore!", "Great question! \u{1F50D}"]
      };
      const messages = baseMessages[combinationName] || ["Great combination!"];
      const messageIndex = Math.floor(Math.random() * messages.length);
      if (confidence > 0.8) {
        return messages[messageIndex] + " (Perfect timing!)";
      } else if (confidence > 0.7) {
        return messages[messageIndex] + " (Nice work!)";
      } else {
        return messages[messageIndex];
      }
    }
    /**
     * Add a custom gesture combination
     */
    addCustomCombination(combination) {
      this.customCombinations.push(combination);
    }
    /**
     * Remove a custom combination
     */
    removeCustomCombination(combinationName) {
      this.customCombinations = this.customCombinations.filter((c) => c.combinationName !== combinationName);
    }
    /**
     * Get all available combinations
     */
    getAllCombinations() {
      return [...this.predefinedCombinations, ...this.customCombinations];
    }
    /**
     * Get combination progress (for partial completion feedback)
     */
    getCombinationProgress() {
      if (this.gestureHistory.length === 0) {
        return null;
      }
      for (const combination of [...this.predefinedCombinations, ...this.customCombinations]) {
        const progress = this.checkPartialProgress(combination);
        if (progress) {
          return progress;
        }
      }
      return null;
    }
    /**
     * Check progress toward a combination
     */
    checkPartialProgress(sequence) {
      const { gestures, timeWindow } = sequence;
      const now = Date.now();
      const recentGestures = this.gestureHistory.filter(
        (h) => now - h.timestamp <= timeWindow
      );
      if (recentGestures.length === 0) {
        return null;
      }
      let matchCount = 0;
      for (let i = 0; i < Math.min(recentGestures.length, gestures.length - 1); i++) {
        if (recentGestures[recentGestures.length - 1 - i].gesture === gestures[gestures.length - 1 - i]) {
          matchCount++;
        } else {
          break;
        }
      }
      if (matchCount > 0 && matchCount < gestures.length) {
        return {
          expected: sequence.combinationName,
          progress: matchCount / gestures.length,
          nextGesture: gestures[matchCount]
        };
      }
      return null;
    }
    /**
     * Clean old gestures from history
     */
    cleanOldGestures() {
      const now = Date.now();
      const maxAge = Math.max(...this.predefinedCombinations.map((c) => c.timeWindow));
      this.gestureHistory = this.gestureHistory.filter(
        (h) => now - h.timestamp <= maxAge
      );
    }
    /**
     * Reset combination history
     */
    reset() {
      this.gestureHistory = [];
    }
    /**
     * Get combination statistics
     */
    getCombinationStats() {
      return {
        totalAttempts: 0,
        successfulCombinations: 0,
        averageTimeSpan: 0,
        popularCombinations: []
      };
    }
  };

  // webview/utils/HapticFeedbackManager.ts
  var HapticFeedbackManager = class {
    constructor() {
      this.lastHapticTime = 0;
      this.MIN_HAPTIC_INTERVAL = 100;
      // Minimum 100ms between haptics
      this.MAX_HAPTIC_INTERVAL = 2e3;
      // Maximum 2s between repeated events
      this.hapticHistory = [];
      this.HISTORY_SIZE = 10;
      // Amy's haptic preferences
      this.preferences = {
        intensity: "normal",
        enableMovementFeedback: true,
        enableGestureFeedback: true,
        enableSuccessFeedback: true,
        enableErrorFeedback: true,
        reduceFrequentHaptics: true,
        // Prevent haptic spam
        adaptiveIntensity: true
        // Adjust based on time of day
      };
      // Predefined haptic patterns for different events
      this.patterns = {
        // Hand detection and movement
        hand_detected: {
          type: "light",
          intensity: 0.3,
          duration: 50
        },
        hand_moved: {
          type: "light",
          intensity: 0.2,
          duration: 30
        },
        hand_stable: {
          type: "light",
          intensity: 0.4,
          duration: 40
        },
        // Gesture detection stages
        gesture_start: {
          type: "light",
          intensity: 0.5,
          duration: 60
        },
        gesture_progress: {
          type: "light",
          intensity: 0.3,
          duration: 40,
          repeat: 2,
          interval: 50
        },
        gesture_complete: {
          type: "medium",
          intensity: 0.7,
          duration: 80
        },
        // Success and recognition
        gesture_recognized: {
          type: "success",
          intensity: 0.8,
          duration: 100
        },
        high_confidence: {
          type: "success",
          intensity: 0.9,
          duration: 120
        },
        // Errors and corrections
        gesture_failed: {
          type: "error",
          intensity: 0.6,
          duration: 70,
          repeat: 2,
          interval: 100
        },
        low_confidence: {
          type: "light",
          intensity: 0.4,
          duration: 50
        },
        // Special events
        emergency_detected: {
          type: "heavy",
          intensity: 1,
          duration: 150,
          repeat: 3,
          interval: 100
        },
        combination_start: {
          type: "medium",
          intensity: 0.6,
          duration: 60,
          repeat: 2,
          interval: 80
        },
        combination_complete: {
          type: "success",
          intensity: 1,
          duration: 200
        },
        // Learning and practice
        practice_start: {
          type: "light",
          intensity: 0.4,
          duration: 50,
          repeat: 3,
          interval: 150
        },
        practice_success: {
          type: "success",
          intensity: 0.7,
          duration: 100
        },
        practice_hint: {
          type: "light",
          intensity: 0.3,
          duration: 40,
          repeat: 2,
          interval: 200
        }
      };
    }
    /**
     * Trigger haptic feedback for a specific event
     */
    triggerHaptic(event, context) {
      if (window.__disableHapticSystem === true) {
        return;
      }
      if (!this.shouldTriggerHaptic(event)) {
        return;
      }
      const pattern = this.getAdaptedPattern(event, context);
      if (!pattern) {
        return;
      }
      const hapticEvent = {
        event,
        pattern,
        priority: this.getEventPriority(event),
        context
      };
      this.sendHapticToReactNative(hapticEvent);
      this.recordHapticEvent(event);
    }
    /**
     * Trigger haptic for hand detection
     */
    onHandDetected(handCount, stability) {
      if (!this.preferences.enableMovementFeedback) {
        return;
      }
      if (handCount === 1) {
        this.triggerHaptic("hand_detected", { handCount, stability });
      } else if (handCount === 2) {
        this.triggerHaptic("hand_detected", { handCount, stability, pattern: "double" });
      }
    }
    /**
     * Trigger haptic for hand movement
     */
    onHandMovement(movementIntensity) {
      if (!this.preferences.enableMovementFeedback || movementIntensity < 0.1) {
        return;
      }
      const timeSinceLastMovement = Date.now() - this.lastHapticTime;
      if (timeSinceLastMovement < 200) {
        return;
      }
      this.triggerHaptic("hand_moved", { intensity: movementIntensity });
    }
    /**
     * Trigger haptic for gesture detection stages
     */
    onGestureStage(stage, gesture, confidence) {
      if (!this.preferences.enableGestureFeedback) {
        return;
      }
      const event = `gesture_${stage}`;
      this.triggerHaptic(event, { gesture, confidence });
    }
    /**
     * Trigger haptic for gesture recognition
     */
    onGestureRecognized(gesture, confidence, isHighConfidence = false) {
      if (!this.preferences.enableGestureFeedback) {
        return;
      }
      if (isHighConfidence || confidence > 0.8) {
        this.triggerHaptic("high_confidence", { gesture, confidence });
      } else {
        this.triggerHaptic("gesture_recognized", { gesture, confidence });
      }
    }
    /**
     * Trigger haptic for gesture failure
     */
    onGestureFailed(gesture, reason) {
      if (!this.preferences.enableErrorFeedback) {
        return;
      }
      this.triggerHaptic("gesture_failed", { gesture, reason });
    }
    /**
     * Trigger haptic for emergency gestures
     */
    onEmergencyGesture(gesture) {
      this.triggerHaptic("emergency_detected", { gesture, priority: "critical" });
    }
    /**
     * Trigger haptic for gesture combinations
     */
    onCombinationEvent(event, combination) {
      const hapticEvent = `combination_${event}`;
      this.triggerHaptic(hapticEvent, { combination });
    }
    /**
     * Trigger haptic for practice sessions
     */
    onPracticeEvent(event) {
      const hapticEvent = `practice_${event}`;
      this.triggerHaptic(hapticEvent);
    }
    /**
     * Update Amy's haptic preferences
     */
    updatePreferences(newPreferences) {
      this.preferences = { ...this.preferences, ...newPreferences };
    }
    /**
     * Get current haptic preferences
     */
    getPreferences() {
      return { ...this.preferences };
    }
    /**
     * Check if haptic should be triggered based on timing and preferences
     */
    shouldTriggerHaptic(event) {
      const now = Date.now();
      if (now - this.lastHapticTime < this.MIN_HAPTIC_INTERVAL) {
        return false;
      }
      if (this.preferences.reduceFrequentHaptics) {
        const recentEvents = this.hapticHistory.filter(
          (h) => now - h.timestamp < this.MAX_HAPTIC_INTERVAL
        );
        const sameEventCount = recentEvents.filter((h) => h.event === event).length;
        if (sameEventCount >= 3) {
          return false;
        }
      }
      return true;
    }
    /**
     * Get adapted haptic pattern based on preferences and context
     */
    getAdaptedPattern(event, context) {
      let basePattern = this.patterns[event];
      if (!basePattern) {
        basePattern = this.patterns.hand_detected;
      }
      if (!basePattern) {
        return null;
      }
      const adaptedPattern = { ...basePattern };
      if (this.preferences.intensity === "gentle") {
        adaptedPattern.intensity = Math.max(0.1, adaptedPattern.intensity * 0.6);
      } else if (this.preferences.intensity === "strong") {
        adaptedPattern.intensity = Math.min(1, adaptedPattern.intensity * 1.3);
      }
      if (this.preferences.adaptiveIntensity) {
        const hour = (/* @__PURE__ */ new Date()).getHours();
        if (hour >= 6 && hour <= 9) {
          adaptedPattern.intensity *= 0.8;
        } else if (hour >= 20 || hour <= 5) {
          adaptedPattern.intensity = Math.min(1, adaptedPattern.intensity * 1.1);
        }
      }
      if (context?.priority === "critical") {
        adaptedPattern.intensity = 1;
        adaptedPattern.repeat = (adaptedPattern.repeat || 1) + 1;
      }
      return adaptedPattern;
    }
    /**
     * Get priority level for haptic event
     */
    getEventPriority(event) {
      const criticalEvents = ["emergency_detected"];
      const highEvents = ["gesture_recognized", "high_confidence", "combination_complete"];
      const mediumEvents = ["gesture_complete", "gesture_start", "hand_detected"];
      if (criticalEvents.includes(event)) return "critical";
      if (highEvents.includes(event)) return "high";
      if (mediumEvents.includes(event)) return "medium";
      return "low";
    }
    /**
     * Send haptic event to React Native
     */
    sendHapticToReactNative(hapticEvent) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "haptic_feedback",
            event: hapticEvent.event,
            pattern: hapticEvent.pattern,
            priority: hapticEvent.priority,
            context: hapticEvent.context,
            timestamp: Date.now()
          })
        );
        this.lastHapticTime = Date.now();
      } catch (error) {
        console.warn("Failed to send haptic feedback:", error);
      }
    }
    /**
     * Record haptic event for frequency tracking
     */
    recordHapticEvent(event) {
      this.hapticHistory.push({
        event,
        timestamp: Date.now()
      });
      if (this.hapticHistory.length > this.HISTORY_SIZE) {
        this.hapticHistory.shift();
      }
    }
    /**
     * Reset haptic state (for testing or fresh start)
     */
    reset() {
      this.hapticHistory = [];
      this.lastHapticTime = 0;
    }
    /**
     * Get haptic statistics
     */
    getHapticStats() {
      const now = Date.now();
      const recentHaptics = this.hapticHistory.filter((h) => now - h.timestamp < 6e4).length;
      const eventCounts = {};
      for (const h of this.hapticHistory) {
        eventCounts[h.event] = (eventCounts[h.event] || 0) + 1;
      }
      const mostFrequentEvent = Object.entries(eventCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "none";
      const intervals = [];
      for (let i = 1; i < this.hapticHistory.length; i++) {
        intervals.push(this.hapticHistory[i].timestamp - this.hapticHistory[i - 1].timestamp);
      }
      const averageInterval = intervals.length > 0 ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : 0;
      return {
        totalHaptics: this.hapticHistory.length,
        recentHaptics,
        mostFrequentEvent,
        averageInterval
      };
    }
  };

  // webview/utils/GestureReplayManager.ts
  var GestureReplayManager = class {
    constructor() {
      this.recordings = [];
      this.MAX_RECORDINGS = 20;
      // Keep last 20 successful gestures
      this.currentRecording = null;
      this.recordingStartTime = 0;
      this.RECORDING_DURATION = 2e3;
      // Record 2 seconds of gesture data
      this.activeReplay = null;
      this.replayInterval = null;
    }
    /**
     * Start recording a gesture sequence
     */
    startRecording(gesture, initialConfidence) {
      this.currentRecording = {
        gesture,
        confidence: initialConfidence,
        timestamp: Date.now(),
        landmarkSequence: [],
        handedness: [],
        metadata: {
          success: false
        }
      };
      this.recordingStartTime = Date.now();
    }
    /**
     * Add a frame to the current recording
     */
    addFrame(landmarks, handedness, confidence) {
      if (!this.currentRecording) {
        return;
      }
      const elapsed = Date.now() - this.recordingStartTime;
      if (elapsed > this.RECORDING_DURATION) {
        this.stopRecording(true, confidence);
        return;
      }
      const frameLandmarks = landmarks.map(
        (hand) => hand.map((lm) => [lm[0], lm[1], lm[2] || 0])
      );
      this.currentRecording.landmarkSequence.push(frameLandmarks);
      this.currentRecording.handedness = handedness;
      this.currentRecording.confidence = Math.max(this.currentRecording.confidence, confidence);
    }
    /**
     * Stop recording and save if successful
     */
    stopRecording(success, finalConfidence) {
      if (!this.currentRecording) {
        return null;
      }
      const recording = {
        ...this.currentRecording,
        duration: Date.now() - this.recordingStartTime,
        confidence: finalConfidence,
        metadata: {
          ...this.currentRecording.metadata,
          success
        }
      };
      this.currentRecording = null;
      this.recordingStartTime = 0;
      if (success && recording.landmarkSequence.length >= 5) {
        this.saveRecording(recording);
        return recording;
      }
      return null;
    }
    /**
     * Save a successful recording
     */
    saveRecording(recording) {
      this.recordings.push(recording);
      if (this.recordings.length > this.MAX_RECORDINGS) {
        this.recordings.shift();
      }
      this.sendRecordingToReactNative(recording);
    }
    /**
     * Start replay of a gesture
     */
    startReplay(recordingId, options = {}) {
      const recording = this.recordings.find((r) => r.timestamp.toString() === recordingId);
      if (!recording) {
        return false;
      }
      const defaultOptions = {
        speed: 0.5,
        // Half speed for learning
        loop: false,
        showLandmarks: true,
        showSkeleton: true,
        highlightKeyPoints: true
      };
      this.activeReplay = {
        recording,
        options: { ...defaultOptions, ...options },
        currentFrame: 0,
        isPlaying: true,
        startTime: Date.now()
      };
      this.startReplayLoop();
      return true;
    }
    /**
     * Stop current replay
     */
    stopReplay() {
      if (this.replayInterval) {
        clearInterval(this.replayInterval);
        this.replayInterval = null;
      }
      this.activeReplay = null;
    }
    /**
     * Pause/resume replay
     */
    pauseReplay() {
      if (this.activeReplay) {
        this.activeReplay.isPlaying = !this.activeReplay.isPlaying;
      }
    }
    /**
     * Get current replay frame
     */
    getCurrentReplayFrame() {
      if (!this.activeReplay) {
        return null;
      }
      const { recording, currentFrame, options } = this.activeReplay;
      const progress = currentFrame / recording.landmarkSequence.length;
      return {
        frame: recording.landmarkSequence[currentFrame] || [],
        progress,
        isComplete: currentFrame >= recording.landmarkSequence.length - 1
      };
    }
    /**
     * Get available recordings for replay
     */
    getAvailableRecordings() {
      return this.recordings.map((r) => ({
        id: r.timestamp.toString(),
        gesture: r.gesture,
        confidence: r.confidence,
        timestamp: r.timestamp,
        duration: r.duration,
        frameCount: r.landmarkSequence.length
      }));
    }
    /**
     * Get recording by ID
     */
    getRecording(recordingId) {
      return this.recordings.find((r) => r.timestamp.toString() === recordingId) || null;
    }
    /**
     * Delete a recording
     */
    deleteRecording(recordingId) {
      const index = this.recordings.findIndex((r) => r.timestamp.toString() === recordingId);
      if (index >= 0) {
        this.recordings.splice(index, 1);
        return true;
      }
      return false;
    }
    /**
     * Export recording data for external analysis
     */
    exportRecordingData(recordingId) {
      const recording = this.getRecording(recordingId);
      if (!recording) {
        return null;
      }
      return {
        gesture: recording.gesture,
        confidence: recording.confidence,
        duration: recording.duration,
        frameCount: recording.landmarkSequence.length,
        averageLandmarksPerFrame: recording.landmarkSequence.reduce(
          (sum, frame) => sum + frame.length,
          0
        ) / recording.landmarkSequence.length,
        handedness: recording.handedness,
        metadata: recording.metadata
      };
    }
    /**
     * Get replay statistics
     */
    getReplayStats() {
      if (this.recordings.length === 0) {
        return {
          totalRecordings: 0,
          mostRecordedGesture: "none",
          averageConfidence: 0,
          recentActivity: 0
        };
      }
      const gestureCounts = {};
      let totalConfidence = 0;
      let recentCount = 0;
      const oneHourAgo = Date.now() - 36e5;
      for (const recording of this.recordings) {
        gestureCounts[recording.gesture] = (gestureCounts[recording.gesture] || 0) + 1;
        totalConfidence += recording.confidence;
        if (recording.timestamp > oneHourAgo) {
          recentCount++;
        }
      }
      const mostRecordedGesture = Object.entries(gestureCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "none";
      return {
        totalRecordings: this.recordings.length,
        mostRecordedGesture,
        averageConfidence: totalConfidence / this.recordings.length,
        recentActivity: recentCount
      };
    }
    /**
     * Start the replay loop
     */
    startReplayLoop() {
      if (!this.activeReplay) {
        return;
      }
      const frameInterval = 1e3 / 30 / this.activeReplay.options.speed;
      this.replayInterval = window.setInterval(() => {
        if (!this.activeReplay || !this.activeReplay.isPlaying) {
          return;
        }
        const { recording, currentFrame } = this.activeReplay;
        if (currentFrame >= recording.landmarkSequence.length - 1) {
          if (this.activeReplay.options.loop) {
            this.activeReplay.currentFrame = 0;
            this.activeReplay.startTime = Date.now();
          } else {
            this.stopReplay();
            this.sendReplayCompleteToReactNative();
          }
          return;
        }
        this.activeReplay.currentFrame++;
        this.sendReplayFrameToReactNative();
      }, frameInterval);
    }
    /**
     * Send recording to React Native for storage
     */
    sendRecordingToReactNative(recording) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "gesture_recording_saved",
            recording: {
              id: recording.timestamp.toString(),
              gesture: recording.gesture,
              confidence: recording.confidence,
              duration: recording.duration,
              frameCount: recording.landmarkSequence.length
            },
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send gesture recording:", error);
      }
    }
    /**
     * Send replay frame to React Native
     */
    sendReplayFrameToReactNative() {
      const frameData = this.getCurrentReplayFrame();
      if (!frameData || !this.activeReplay) {
        return;
      }
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "gesture_replay_frame",
            frame: frameData.frame,
            progress: frameData.progress,
            gesture: this.activeReplay.recording.gesture,
            speed: this.activeReplay.options.speed,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send replay frame:", error);
      }
    }
    /**
     * Send replay completion to React Native
     */
    sendReplayCompleteToReactNative() {
      if (!this.activeReplay) {
        return;
      }
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "gesture_replay_complete",
            gesture: this.activeReplay.recording.gesture,
            duration: Date.now() - this.activeReplay.startTime,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send replay complete:", error);
      }
    }
    /**
     * Reset manager state
     */
    reset() {
      this.stopReplay();
      this.recordings = [];
      this.currentRecording = null;
      this.recordingStartTime = 0;
    }
    /**
     * Import recordings from React Native
     */
    importRecordings(recordings) {
      this.recordings = recordings.slice(-this.MAX_RECORDINGS);
    }
  };

  // webview/utils/NavigationGestureManager.ts
  var NavigationGestureManager = class {
    constructor() {
      this.navigationGestures = [
        {
          name: "home",
          description: "Return to main recognition screen",
          gesture: "fist",
          // Simple closed fist gesture
          minConfidence: 0.7,
          cooldownMs: 2e3,
          // 2 second cooldown
          feedback: {
            message: "Going home! \u{1F44B}",
            hapticPattern: "medium",
            soundEnabled: true
          }
        },
        {
          name: "back",
          description: "Go back to previous screen",
          gesture: "thumbs_down",
          // Thumbs down for "go back"
          minConfidence: 0.7,
          cooldownMs: 1500,
          feedback: {
            message: "Going back! \u21A9\uFE0F",
            hapticPattern: "light",
            soundEnabled: true
          }
        },
        {
          name: "menu",
          description: "Open main menu",
          gesture: "open_palm",
          // Open palm facing up
          minConfidence: 0.75,
          cooldownMs: 2e3,
          feedback: {
            message: "Opening menu! \u{1F4F1}",
            hapticPattern: "medium",
            soundEnabled: true
          }
        }
      ];
      this.lastTriggerTime = {};
      this.gestureHoldStart = {};
      this.HOLD_DURATION = 500;
    }
    // Hold gesture for 500ms to confirm
    /**
     * Check if a detected gesture should trigger navigation
     */
    checkNavigationTrigger(gesture, confidence, landmarks, context) {
      const navGesture = this.navigationGestures.find((ng) => ng.gesture === gesture);
      if (!navGesture) {
        return null;
      }
      if (confidence < navGesture.minConfidence) {
        return null;
      }
      const lastTrigger = this.lastTriggerTime[navGesture.name] || 0;
      const now = Date.now();
      if (now - lastTrigger < navGesture.cooldownMs) {
        return null;
      }
      const holdStart = this.gestureHoldStart[navGesture.name];
      if (!holdStart) {
        this.gestureHoldStart[navGesture.name] = now;
        return null;
      }
      if (now - holdStart < this.HOLD_DURATION) {
        return null;
      }
      const trigger = {
        gesture: navGesture,
        confidence,
        timestamp: now,
        context: context || {}
      };
      this.lastTriggerTime[navGesture.name] = now;
      delete this.gestureHoldStart[navGesture.name];
      return trigger;
    }
    /**
     * Process navigation trigger and send to React Native
     */
    processNavigationTrigger(trigger) {
      this.sendNavigationToReactNative(trigger);
      this.provideNavigationFeedback(trigger);
    }
    /**
     * Reset hold timers (when gesture changes or is interrupted)
     */
    resetHoldTimers() {
      this.gestureHoldStart = {};
    }
    /**
     * Get available navigation gestures
     */
    getAvailableNavigationGestures() {
      return [...this.navigationGestures];
    }
    /**
     * Add custom navigation gesture
     */
    addCustomNavigationGesture(gesture) {
      const existingIndex = this.navigationGestures.findIndex((ng) => ng.name === gesture.name);
      if (existingIndex >= 0) {
        this.navigationGestures[existingIndex] = gesture;
      } else {
        this.navigationGestures.push(gesture);
      }
    }
    /**
     * Remove navigation gesture
     */
    removeNavigationGesture(gestureName) {
      const index = this.navigationGestures.findIndex((ng) => ng.name === gestureName);
      if (index >= 0) {
        this.navigationGestures.splice(index, 1);
        return true;
      }
      return false;
    }
    /**
     * Update navigation gesture settings
     */
    updateNavigationGesture(gestureName, updates) {
      const gesture = this.navigationGestures.find((ng) => ng.name === gestureName);
      if (gesture) {
        Object.assign(gesture, updates);
        return true;
      }
      return false;
    }
    /**
     * Get navigation gesture by name
     */
    getNavigationGesture(gestureName) {
      return this.navigationGestures.find((ng) => ng.name === gestureName) || null;
    }
    /**
     * Check if a gesture is currently being held for navigation
     */
    getHoldProgress(gestureName) {
      const holdStart = this.gestureHoldStart[gestureName];
      if (!holdStart) {
        return 0;
      }
      const elapsed = Date.now() - holdStart;
      return Math.min(1, elapsed / this.HOLD_DURATION);
    }
    /**
     * Get navigation statistics
     */
    getNavigationStats() {
      const now = Date.now();
      const recentThreshold = now - 3e5;
      let totalTriggers = 0;
      let totalConfidence = 0;
      let recentCount = 0;
      const usageCount = {};
      Object.entries(this.lastTriggerTime).forEach(([gestureName, timestamp]) => {
        totalTriggers++;
        usageCount[gestureName] = (usageCount[gestureName] || 0) + 1;
        totalConfidence += 0.8;
        if (timestamp > recentThreshold) {
          recentCount++;
        }
      });
      const mostUsedGesture = Object.entries(usageCount).sort(([, a], [, b]) => b - a)[0]?.[0] || "none";
      return {
        totalTriggers,
        mostUsedGesture,
        averageConfidence: totalTriggers > 0 ? totalConfidence / totalTriggers : 0,
        recentActivity: recentCount
      };
    }
    /**
     * Send navigation command to React Native
     */
    sendNavigationToReactNative(trigger) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "navigation_trigger",
            navigationType: trigger.gesture.name,
            gesture: trigger.gesture.gesture,
            confidence: trigger.confidence,
            feedback: trigger.gesture.feedback,
            timestamp: trigger.timestamp,
            context: trigger.context
          })
        );
      } catch (error) {
        console.warn("Failed to send navigation trigger:", error);
      }
    }
    /**
     * Provide feedback for navigation trigger
     */
    provideNavigationFeedback(trigger) {
      const { feedback } = trigger.gesture;
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "navigation_feedback",
            message: feedback.message,
            hapticPattern: feedback.hapticPattern,
            soundEnabled: feedback.soundEnabled,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send navigation feedback:", error);
      }
    }
    /**
     * Reset navigation state
     */
    reset() {
      this.lastTriggerTime = {};
      this.gestureHoldStart = {};
    }
    /**
     * Export navigation configuration
     */
    exportConfiguration() {
      return [...this.navigationGestures];
    }
    /**
     * Import navigation configuration
     */
    importConfiguration(config) {
      this.navigationGestures = [...config];
    }
  };

  // webview/utils/VisualCorrectionManager.ts
  var VisualCorrectionManager = class {
    constructor() {
      this.gestureHistory = [];
      this.HISTORY_SIZE = 100;
      this.activeSession = null;
      // Visual representations for gestures (Amy-friendly emojis)
      this.gestureVisuals = {
        thumbs_up: { emoji: "\u{1F44D}", description: "Happy thumbs up" },
        thumbs_down: { emoji: "\u{1F44E}", description: "Thumbs down" },
        open_palm: { emoji: "\u{1F590}\uFE0F", description: "Open hand" },
        fist: { emoji: "\u270A", description: "Closed fist" },
        point: { emoji: "\u{1F446}", description: "Pointing finger" },
        peace: { emoji: "\u270C\uFE0F", description: "Peace sign" },
        ok: { emoji: "\u{1F44C}", description: "OK sign" },
        heart: { emoji: "\u2764\uFE0F", description: "Heart shape" },
        wave: { emoji: "\u{1F44B}", description: "Waving hand" },
        clap: { emoji: "\u{1F44F}", description: "Clapping hands" }
      };
    }
    /**
     * Record gesture attempt for correction learning
     */
    recordGestureAttempt(gesture, confidence, success) {
      this.gestureHistory.push({
        gesture,
        confidence,
        timestamp: Date.now(),
        success
      });
      if (this.gestureHistory.length > this.HISTORY_SIZE) {
        this.gestureHistory.shift();
      }
    }
    /**
     * Generate correction options when gesture confidence is low
     */
    generateCorrectionOptions(detectedGesture, confidence, alternativeGestures) {
      if (confidence > 0.7) {
        return null;
      }
      const sessionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const options = this.createCorrectionOptions(detectedGesture, alternativeGestures);
      if (options.length === 0) {
        return null;
      }
      const session = {
        originalGesture: detectedGesture,
        originalConfidence: confidence,
        timestamp: Date.now(),
        options,
        sessionId
      };
      this.activeSession = session;
      return session;
    }
    /**
     * Create correction options with visual representations
     */
    createCorrectionOptions(detectedGesture, alternatives) {
      const options = [];
      if (this.gestureVisuals[detectedGesture]) {
        options.push(this.createCorrectionOption(detectedGesture, 1));
      }
      alternatives.slice(0, 3).forEach((alt) => {
        if (this.gestureVisuals[alt.gesture] && alt.gesture !== detectedGesture) {
          options.push(this.createCorrectionOption(alt.gesture, alt.confidence));
        }
      });
      const frequentGestures = this.getFrequentGestures(3);
      frequentGestures.forEach((gesture) => {
        if (!options.find((opt) => opt.gesture === gesture) && this.gestureVisuals[gesture]) {
          options.push(this.createCorrectionOption(gesture, 0.5));
        }
      });
      return options.sort((a, b) => b.priority - a.priority).slice(0, 6);
    }
    /**
     * Create a single correction option
     */
    createCorrectionOption(gesture, confidence) {
      const visual = this.gestureVisuals[gesture];
      const context = this.getGestureContext(gesture);
      let priority = confidence;
      if (context.frequency > 5) priority += 0.2;
      if (context.successRate > 0.8) priority += 0.1;
      if (Date.now() - context.lastUsed < 36e5) priority += 0.1;
      return {
        gesture,
        confidence,
        visualRepresentation: {
          type: "emoji",
          value: visual.emoji,
          description: visual.description
        },
        context,
        priority
      };
    }
    /**
     * Get context information for a gesture
     */
    getGestureContext(gesture) {
      const gestureAttempts = this.gestureHistory.filter((h) => h.gesture === gesture);
      if (gestureAttempts.length === 0) {
        return {
          frequency: 0,
          lastUsed: 0,
          successRate: 0
        };
      }
      const frequency = gestureAttempts.length;
      const lastUsed = Math.max(...gestureAttempts.map((h) => h.timestamp));
      const successRate = gestureAttempts.filter((h) => h.success).length / gestureAttempts.length;
      return {
        frequency,
        lastUsed,
        successRate
      };
    }
    /**
     * Get most frequently used gestures
     */
    getFrequentGestures(limit) {
      const frequency = {};
      this.gestureHistory.forEach((h) => {
        frequency[h.gesture] = (frequency[h.gesture] || 0) + 1;
      });
      return Object.entries(frequency).sort(([, a], [, b]) => b - a).slice(0, limit).map(([gesture]) => gesture);
    }
    /**
     * Handle correction selection
     */
    selectCorrection(sessionId, selectedGesture) {
      if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
        return false;
      }
      this.activeSession.selectedOption = selectedGesture;
      this.recordCorrectionResult(this.activeSession, selectedGesture);
      this.sendCorrectionSelectionToReactNative(this.activeSession, selectedGesture);
      this.activeSession = null;
      return true;
    }
    /**
     * Cancel correction session
     */
    cancelCorrection(sessionId) {
      if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
        return false;
      }
      this.recordCorrectionResult(this.activeSession, null);
      this.activeSession = null;
      return true;
    }
    /**
     * Get current correction session
     */
    getCurrentCorrectionSession() {
      return this.activeSession;
    }
    /**
     * Record correction result for learning
     */
    recordCorrectionResult(session, selectedGesture) {
      if (selectedGesture && selectedGesture !== session.originalGesture) {
        this.recordGestureAttempt(selectedGesture, 1, true);
      }
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "correction_analytics",
            sessionId: session.sessionId,
            originalGesture: session.originalGesture,
            selectedGesture,
            correctionMade: selectedGesture !== session.originalGesture,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send correction analytics:", error);
      }
    }
    /**
     * Send correction options to React Native
     */
    sendCorrectionOptionsToReactNative(session) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "correction_options",
            sessionId: session.sessionId,
            originalGesture: session.originalGesture,
            originalConfidence: session.originalConfidence,
            options: session.options,
            timestamp: session.timestamp
          })
        );
      } catch (error) {
        console.warn("Failed to send correction options:", error);
      }
    }
    /**
     * Send correction selection to React Native
     */
    sendCorrectionSelectionToReactNative(session, selectedGesture) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "correction_selected",
            sessionId: session.sessionId,
            originalGesture: session.originalGesture,
            selectedGesture,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send correction selection:", error);
      }
    }
    /**
     * Add custom visual representation for a gesture
     */
    addCustomVisual(gesture, emoji, description) {
      this.gestureVisuals[gesture] = { emoji, description };
    }
    /**
     * Get correction statistics
     */
    getCorrectionStats() {
      return {
        totalCorrections: 0,
        correctionRate: 0,
        mostCorrectedGesture: "none",
        averageOptionsShown: 0
      };
    }
    /**
     * Reset correction state
     */
    reset() {
      this.activeSession = null;
      this.gestureHistory = [];
    }
    /**
     * Export correction configuration
     */
    exportConfiguration() {
      return { ...this.gestureVisuals };
    }
    /**
     * Import correction configuration
     */
    importConfiguration(config) {
      this.gestureVisuals = { ...this.gestureVisuals, ...config };
    }
  };

  // webview/utils/GestureUndoManager.ts
  var GestureUndoManager = class {
    constructor() {
      this.gestureHistory = [];
      this.MAX_HISTORY = 5;
      // Keep last 5 gestures for undo
      this.UNDO_WINDOW = 1e4;
      // 10 seconds to undo
      this.undoGestures = [
        {
          name: "shake_undo",
          gesture: "wave",
          // Waving hand as shake motion
          minConfidence: 0.7,
          cooldownMs: 3e3,
          // 3 second cooldown
          holdDuration: 800,
          // Hold for 800ms
          feedback: {
            message: "Undoing last gesture! \u21B6",
            hapticPattern: "medium",
            soundEnabled: true
          }
        },
        {
          name: "cross_undo",
          gesture: "thumbs_down",
          // Thumbs down as rejection
          minConfidence: 0.7,
          cooldownMs: 2e3,
          holdDuration: 600,
          feedback: {
            message: "Cancelling that! \u274C",
            hapticPattern: "light",
            soundEnabled: true
          }
        }
      ];
      this.lastUndoTime = {};
      this.undoHoldStart = {};
      this.activeUndoSession = null;
    }
    /**
     * Record a gesture for potential undo
     */
    recordGestureForUndo(gesture, confidence, landmarks, handedness, sessionId) {
      if (confidence < 0.6) {
        return;
      }
      const undoableGesture = {
        gesture,
        confidence,
        timestamp: Date.now(),
        landmarks: JSON.parse(JSON.stringify(landmarks)),
        // Deep copy
        handedness: [...handedness],
        sessionId,
        canUndo: true
      };
      this.gestureHistory.push(undoableGesture);
      if (this.gestureHistory.length > this.MAX_HISTORY) {
        this.gestureHistory.shift();
      }
      this.cleanOldGestures();
    }
    /**
     * Check if a gesture should trigger undo
     */
    checkUndoTrigger(gesture, confidence, context) {
      const undoGesture = this.undoGestures.find((ug) => ug.gesture === gesture);
      if (!undoGesture) {
        return null;
      }
      if (confidence < undoGesture.minConfidence) {
        return null;
      }
      const lastUndo = this.lastUndoTime[undoGesture.name] || 0;
      const now = Date.now();
      if (now - lastUndo < undoGesture.cooldownMs) {
        return null;
      }
      const targetGesture = this.getLastUndoableGesture();
      if (!targetGesture) {
        return null;
      }
      const holdStart = this.undoHoldStart[undoGesture.name];
      if (!holdStart) {
        this.undoHoldStart[undoGesture.name] = now;
        return null;
      }
      if (now - holdStart < undoGesture.holdDuration) {
        return null;
      }
      const sessionId = `undo_${now}_${Math.random().toString(36).substr(2, 9)}`;
      const session = {
        undoGesture,
        targetGesture,
        timestamp: now,
        confirmed: false,
        sessionId
      };
      this.activeUndoSession = session;
      this.lastUndoTime[undoGesture.name] = now;
      delete this.undoHoldStart[undoGesture.name];
      return session;
    }
    /**
     * Confirm and execute undo
     */
    confirmUndo(sessionId) {
      if (!this.activeUndoSession || this.activeUndoSession.sessionId !== sessionId) {
        return false;
      }
      const session = this.activeUndoSession;
      session.confirmed = true;
      const targetIndex = this.gestureHistory.findIndex(
        (g) => g.sessionId === session.targetGesture.sessionId
      );
      if (targetIndex >= 0) {
        this.gestureHistory[targetIndex].canUndo = false;
      }
      this.sendUndoToReactNative(session);
      this.activeUndoSession = null;
      return true;
    }
    /**
     * Cancel undo session
     */
    cancelUndo(sessionId) {
      if (!this.activeUndoSession || this.activeUndoSession.sessionId !== sessionId) {
        return false;
      }
      this.activeUndoSession = null;
      return true;
    }
    /**
     * Get the last undoable gesture
     */
    getLastUndoableGesture() {
      const now = Date.now();
      for (let i = this.gestureHistory.length - 1; i >= 0; i--) {
        const gesture = this.gestureHistory[i];
        if (gesture.canUndo && now - gesture.timestamp <= this.UNDO_WINDOW) {
          return gesture;
        }
      }
      return null;
    }
    /**
     * Get undoable gestures history
     */
    getUndoableGestures() {
      const now = Date.now();
      return this.gestureHistory.filter(
        (g) => g.canUndo && now - g.timestamp <= this.UNDO_WINDOW
      );
    }
    /**
     * Reset hold timers (when gesture changes)
     */
    resetHoldTimers() {
      this.undoHoldStart = {};
    }
    /**
     * Get current undo session
     */
    getCurrentUndoSession() {
      return this.activeUndoSession;
    }
    /**
     * Get undo gesture by name
     */
    getUndoGesture(gestureName) {
      return this.undoGestures.find((ug) => ug.name === gestureName) || null;
    }
    /**
     * Add custom undo gesture
     */
    addCustomUndoGesture(gesture) {
      const existingIndex = this.undoGestures.findIndex((ug) => ug.name === gesture.name);
      if (existingIndex >= 0) {
        this.undoGestures[existingIndex] = gesture;
      } else {
        this.undoGestures.push(gesture);
      }
    }
    /**
     * Get undo hold progress
     */
    getUndoHoldProgress(gestureName) {
      const holdStart = this.undoHoldStart[gestureName];
      if (!holdStart) {
        return 0;
      }
      const undoGesture = this.undoGestures.find((ug) => ug.name === gestureName);
      if (!undoGesture) {
        return 0;
      }
      const elapsed = Date.now() - holdStart;
      return Math.min(1, elapsed / undoGesture.holdDuration);
    }
    /**
     * Get undo statistics
     */
    getUndoStats() {
      const now = Date.now();
      const recentUndos = Object.values(this.lastUndoTime).filter(
        (time) => now - time < 36e5
        // Last hour
      );
      const totalUndos = recentUndos.length;
      const undoRate = this.gestureHistory.length > 0 ? totalUndos / this.gestureHistory.length : 0;
      const undoUsage = {};
      Object.keys(this.lastUndoTime).forEach((gestureName) => {
        undoUsage[gestureName] = (undoUsage[gestureName] || 0) + 1;
      });
      const mostUsedUndoGesture = Object.entries(undoUsage).sort(([, a], [, b]) => b - a)[0]?.[0] || "none";
      const averageTimeToUndo = totalUndos > 0 ? this.UNDO_WINDOW / 2 : 0;
      return {
        totalUndos,
        undoRate,
        mostUsedUndoGesture,
        averageTimeToUndo
      };
    }
    /**
     * Send undo command to React Native
     */
    sendUndoToReactNative(session) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "gesture_undo",
            sessionId: session.sessionId,
            undoneGesture: session.targetGesture.gesture,
            undoGesture: session.undoGesture.gesture,
            feedback: session.undoGesture.feedback,
            timestamp: session.timestamp
          })
        );
      } catch (error) {
        console.warn("Failed to send undo command:", error);
      }
    }
    /**
     * Clean old gestures from history
     */
    cleanOldGestures() {
      const now = Date.now();
      this.gestureHistory = this.gestureHistory.filter(
        (g) => now - g.timestamp <= this.UNDO_WINDOW
      );
    }
    /**
     * Reset undo state
     */
    reset() {
      this.gestureHistory = [];
      this.lastUndoTime = {};
      this.undoHoldStart = {};
      this.activeUndoSession = null;
    }
    /**
     * Export undo configuration
     */
    exportConfiguration() {
      return [...this.undoGestures];
    }
    /**
     * Import undo configuration
     */
    importConfiguration(config) {
      this.undoGestures = [...config];
    }
  };

  // webview/utils/EnhancedContextAwareRecognizer.ts
  var EnhancedContextAwareRecognizer = class {
    constructor() {
      this.gestureHistory = [];
      this.communicationHabits = /* @__PURE__ */ new Map();
      this.MAX_HISTORY = 200;
      // Increased for better pattern analysis
      this.PATTERN_WINDOW_HOURS = 168;
      // 7 days for long-term patterns
      this.SHORT_TERM_WINDOW_MINUTES = 60;
      // 1 hour for recent activity
      this.HABIT_UPDATE_INTERVAL = 24 * 60 * 60 * 1e3;
      // Update habits daily
      // Activity level detection
      this.recentActivity = [];
      this.ACTIVITY_WINDOW_SIZE = 20;
      this.activityBaseline = 0.5;
      // Baseline activity level
      this.lastActivityUpdate = 0;
      // Stress detection patterns
      this.stressPatterns = {
        morningRush: { start: 7, end: 9, weekdays: true },
        eveningRoutine: { start: 18, end: 20, weekdays: true },
        emergencyFrequency: { threshold: 3, windowMinutes: 30 }
      };
    }
    /**
     * Analyze gesture in comprehensive context
     */
    analyzeContext(gesture, confidence, duration) {
      const now = /* @__PURE__ */ new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay();
      const timeOfDay = this.determinePreciseTimeOfDay(hour);
      const activityLevel = this.detectActivityLevel();
      const pattern = {
        gesture,
        confidence,
        timestamp: now.getTime(),
        timeOfDay,
        dayOfWeek,
        activityLevel,
        success: confidence >= 0.7,
        duration
      };
      this.addToHistory(pattern);
      this.updateCommunicationHabits(pattern);
      const contextBonus = this.calculateContextBonus(pattern);
      const habitStrength = this.getHabitStrength(gesture, timeOfDay, activityLevel);
      const stressIndicators = this.detectStressIndicators(pattern);
      const recommendations = this.generateRecommendations(pattern, habitStrength);
      const adjustedConfidence = Math.min(1, confidence + contextBonus + habitStrength * 0.1);
      return {
        adjustedConfidence,
        contextBonus,
        timeOfDay,
        activityLevel,
        patternMatch: habitStrength > 0.3,
        recentFrequency: this.getRecentFrequency(gesture),
        habitStrength,
        stressIndicators,
        recommendations
      };
    }
    /**
     * Determine precise time of day with Amy's routine in mind
     */
    determinePreciseTimeOfDay(hour) {
      if (hour >= 6 && hour < 12) return "morning";
      if (hour >= 12 && hour < 17) return "afternoon";
      if (hour >= 17 && hour < 21) return "evening";
      return "night";
    }
    /**
     * Detect activity level based on recent gesture patterns
     */
    detectActivityLevel() {
      const now = Date.now();
      const recentWindow = now - this.SHORT_TERM_WINDOW_MINUTES * 60 * 1e3;
      const recentGestures = this.gestureHistory.filter((h) => h.timestamp > recentWindow);
      if (recentGestures.length < 3) {
        return "low";
      }
      const avgConfidence = recentGestures.reduce((sum, h) => sum + h.confidence, 0) / recentGestures.length;
      const gestureFrequency = recentGestures.length / this.SHORT_TERM_WINDOW_MINUTES;
      const successRate = recentGestures.filter((h) => h.success).length / recentGestures.length;
      const confidenceScore = avgConfidence;
      const frequencyScore = Math.min(1, gestureFrequency / 2);
      const successScore = successRate;
      const activityScore = (confidenceScore + frequencyScore + successScore) / 3;
      this.activityBaseline = this.activityBaseline * 0.9 + activityScore * 0.1;
      if (activityScore > this.activityBaseline + 0.2) return "high";
      if (activityScore < this.activityBaseline - 0.2) return "low";
      return "normal";
    }
    /**
     * Add gesture pattern to history with cleanup
     */
    addToHistory(pattern) {
      this.gestureHistory.push(pattern);
      if (this.gestureHistory.length > this.MAX_HISTORY) {
        this.gestureHistory.shift();
      }
      const cutoffTime = Date.now() - this.PATTERN_WINDOW_HOURS * 60 * 60 * 1e3;
      this.gestureHistory = this.gestureHistory.filter((h) => h.timestamp > cutoffTime);
    }
    /**
     * Update communication habits based on new pattern
     */
    updateCommunicationHabits(pattern) {
      const habit = this.communicationHabits.get(pattern.gesture) || {
        gesture: pattern.gesture,
        preferredTimeOfDay: pattern.timeOfDay,
        preferredDayOfWeek: [pattern.dayOfWeek],
        averageConfidence: pattern.confidence,
        successRate: pattern.success ? 1 : 0,
        frequencyScore: 1,
        lastUsed: pattern.timestamp,
        consecutiveSuccesses: pattern.success ? 1 : 0,
        totalAttempts: 1
      };
      const totalAttempts = habit.totalAttempts + 1;
      const newSuccessRate = (habit.successRate * habit.totalAttempts + (pattern.success ? 1 : 0)) / totalAttempts;
      const newAvgConfidence = (habit.averageConfidence * habit.totalAttempts + pattern.confidence) / totalAttempts;
      const timeWeight = pattern.success ? 0.3 : 0.1;
      const currentTimePreference = habit.preferredTimeOfDay;
      habit.preferredTimeOfDay = pattern.timeOfDay;
      if (!habit.preferredDayOfWeek.includes(pattern.dayOfWeek)) {
        habit.preferredDayOfWeek.push(pattern.dayOfWeek);
      }
      habit.consecutiveSuccesses = pattern.success ? habit.consecutiveSuccesses + 1 : 0;
      const recentUsage = this.gestureHistory.filter(
        (h) => h.gesture === pattern.gesture && h.timestamp > pattern.timestamp - 24 * 60 * 60 * 1e3
        // Last 24 hours
      ).length;
      habit.frequencyScore = Math.min(1, recentUsage / 10);
      habit.averageConfidence = newAvgConfidence;
      habit.successRate = newSuccessRate;
      habit.lastUsed = pattern.timestamp;
      habit.totalAttempts = totalAttempts;
      this.communicationHabits.set(pattern.gesture, habit);
    }
    /**
     * Calculate context bonus based on multiple factors
     */
    calculateContextBonus(pattern) {
      let bonus = 0;
      const habit = this.communicationHabits.get(pattern.gesture);
      if (habit && habit.preferredTimeOfDay === pattern.timeOfDay) {
        bonus += 0.05;
      }
      if (this.isActivityCompatible(pattern.gesture, pattern.activityLevel)) {
        bonus += 0.03;
      }
      const recentSuccesses = this.gestureHistory.filter(
        (h) => h.gesture === pattern.gesture && h.success && h.timestamp > pattern.timestamp - 60 * 60 * 1e3
        // Last hour
      ).length;
      if (recentSuccesses > 0) {
        bonus += Math.min(0.05, recentSuccesses * 0.01);
      }
      if (habit && habit.preferredDayOfWeek.includes(pattern.dayOfWeek)) {
        bonus += 0.02;
      }
      if (this.isEmergencyGesture(pattern.gesture) && this.isStressPeriod()) {
        bonus += 0.1;
      }
      return bonus;
    }
    /**
     * Get habit strength for a gesture in current context
     */
    getHabitStrength(gesture, timeOfDay, activityLevel) {
      const habit = this.communicationHabits.get(gesture);
      if (!habit) return 0;
      let strength = 0;
      if (habit.preferredTimeOfDay === timeOfDay) {
        strength += 0.3;
      }
      strength += habit.successRate * 0.3;
      strength += habit.frequencyScore * 0.2;
      const daysSinceLastUse = (Date.now() - habit.lastUsed) / (24 * 60 * 60 * 1e3);
      const recencyStrength = Math.max(0, 1 - daysSinceLastUse / 7);
      strength += recencyStrength * 0.2;
      return Math.min(1, strength);
    }
    /**
     * Get recent frequency of a gesture
     */
    getRecentFrequency(gesture) {
      const now = Date.now();
      const recentWindow = now - 60 * 60 * 1e3;
      const recentGestures = this.gestureHistory.filter(
        (h) => h.gesture === gesture && h.timestamp > recentWindow
      );
      return recentGestures.length;
    }
    /**
     * Check if activity level is compatible with gesture
     */
    isActivityCompatible(gesture, activityLevel) {
      const highActivityGestures = ["thumbs_up", "fist", "point"];
      const lowActivityGestures = ["open_palm", "peace"];
      if (activityLevel === "high" && highActivityGestures.includes(gesture)) return true;
      if (activityLevel === "low" && lowActivityGestures.includes(gesture)) return true;
      if (activityLevel === "normal") return true;
      return false;
    }
    /**
     * Detect stress indicators in current context
     */
    detectStressIndicators(pattern) {
      const indicators = [];
      const now = /* @__PURE__ */ new Date();
      const hour = now.getHours();
      if (this.stressPatterns.morningRush.weekdays && now.getDay() >= 1 && now.getDay() <= 5) {
        if (hour >= this.stressPatterns.morningRush.start && hour <= this.stressPatterns.morningRush.end) {
          indicators.push("morning_rush");
        }
      }
      if (this.stressPatterns.eveningRoutine.weekdays && now.getDay() >= 1 && now.getDay() <= 5) {
        if (hour >= this.stressPatterns.eveningRoutine.start && hour <= this.stressPatterns.eveningRoutine.end) {
          indicators.push("evening_routine");
        }
      }
      const emergencyWindow = now.getTime() - this.stressPatterns.emergencyFrequency.windowMinutes * 60 * 1e3;
      const recentEmergencies = this.gestureHistory.filter(
        (h) => this.isEmergencyGesture(h.gesture) && h.timestamp > emergencyWindow
      );
      if (recentEmergencies.length >= this.stressPatterns.emergencyFrequency.threshold) {
        indicators.push("high_emergency_frequency");
      }
      if (pattern.confidence < 0.4) {
        indicators.push("low_confidence_pattern");
      }
      return indicators;
    }
    /**
     * Generate recommendations based on context and patterns
     */
    generateRecommendations(pattern, habitStrength) {
      const recommendations = [];
      if (habitStrength < 0.3) {
        recommendations.push("practice_this_gesture");
      }
      const timeOfDay = pattern.timeOfDay;
      if (timeOfDay === "morning" && pattern.confidence < 0.5) {
        recommendations.push("gentle_morning_mode");
      }
      if (pattern.activityLevel === "high" && pattern.confidence < 0.6) {
        recommendations.push("simplify_for_high_activity");
      }
      const recentSuccessRate = this.getRecentSuccessRate(pattern.gesture);
      if (recentSuccessRate < 0.5) {
        recommendations.push("focus_on_fundamentals");
      }
      return recommendations;
    }
    /**
     * Check if current period is a stress period
     */
    isStressPeriod() {
      const now = /* @__PURE__ */ new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 7 && hour <= 9) {
        return true;
      }
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 18 && hour <= 20) {
        return true;
      }
      return false;
    }
    /**
     * Check if gesture is emergency-related
     */
    isEmergencyGesture(gesture) {
      const emergencyGestures = [
        "hilfe",
        "help",
        "emergency",
        "stop",
        "danger",
        "notfall",
        "gefahr",
        "au",
        "schmerz",
        "angst"
      ];
      return emergencyGestures.includes(gesture.toLowerCase());
    }
    /**
     * Get recent success rate for a gesture
     */
    getRecentSuccessRate(gesture) {
      const now = Date.now();
      const recentWindow = now - 60 * 60 * 1e3;
      const recentGestures = this.gestureHistory.filter(
        (h) => h.gesture === gesture && h.timestamp > recentWindow
      );
      if (recentGestures.length === 0) return 0;
      return recentGestures.filter((h) => h.success).length / recentGestures.length;
    }
    /**
     * Get comprehensive context insights
     */
    getContextInsights() {
      const timeOfDayDistribution = {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0
      };
      const activityLevelDistribution = {
        high: 0,
        low: 0,
        normal: 0
      };
      const gestureCounts = {};
      this.gestureHistory.forEach((h) => {
        timeOfDayDistribution[h.timeOfDay]++;
        activityLevelDistribution[h.activityLevel]++;
        gestureCounts[h.gesture] = (gestureCounts[h.gesture] || 0) + 1;
      });
      const topGestures = Object.entries(gestureCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([gesture, count]) => ({
        gesture,
        count,
        habitStrength: this.getHabitStrength(gesture, "afternoon", "normal")
        // Default context
      }));
      const patternStrength = this.gestureHistory.length > 20 ? this.gestureHistory.filter((h) => h.success).length / this.gestureHistory.length : 0;
      const currentPattern = this.gestureHistory[this.gestureHistory.length - 1];
      const stressPatterns = currentPattern ? this.detectStressIndicators(currentPattern) : [];
      const recommendations = currentPattern ? this.generateRecommendations(currentPattern, this.getHabitStrength(currentPattern.gesture, currentPattern.timeOfDay, currentPattern.activityLevel)) : [];
      return {
        totalGestures: this.gestureHistory.length,
        timeOfDayDistribution,
        activityLevelDistribution,
        topGestures,
        patternStrength,
        stressPatterns,
        recommendations
      };
    }
    /**
     * Reset context history (for testing or fresh start)
     */
    reset() {
      this.gestureHistory = [];
      this.communicationHabits.clear();
      this.recentActivity = [];
      this.activityBaseline = 0.5;
      this.lastActivityUpdate = 0;
    }
    /**
     * Export context data for persistence
     */
    exportContextData() {
      return {
        habits: Object.fromEntries(this.communicationHabits),
        baselineActivity: this.activityBaseline,
        totalPatterns: this.gestureHistory.length
      };
    }
    /**
     * Import context data from persistence
     */
    importContextData(data) {
      this.communicationHabits = new Map(Object.entries(data.habits));
      this.activityBaseline = data.baselineActivity;
    }
  };

  // webview/utils/AdaptivePracticeManager.ts
  var AdaptivePracticeManager = class {
    constructor() {
      this.practiceHistory = [];
      this.communicationSessions = [];
      this.MAX_HISTORY = 50;
      this.SESSION_TIMEOUT_MS = 5 * 60 * 1e3;
      // 5 minutes of inactivity ends session
      this.MIN_COMMUNICATION_GAP_MS = 10 * 60 * 1e3;
      // 10 minutes gap needed for practice
      // Preferred practice times learning
      this.preferredTimes = /* @__PURE__ */ new Map();
      // Communication interruption tracking
      this.interruptionHistory = [];
    }
    /**
     * Check if practice should be suggested based on current context
     */
    shouldSuggestPractice(currentTimeOfDay, currentActivity, recentCommunication) {
      if (this.isCommunicationActive()) {
        return {
          shouldSuggest: false,
          timing: "short_delay",
          reason: "active_communication",
          confidence: 1,
          expectedSuccessRate: 0
        };
      }
      if (recentCommunication < this.MIN_COMMUNICATION_GAP_MS / (60 * 1e3)) {
        return {
          shouldSuggest: false,
          timing: "short_delay",
          reason: "recent_communication",
          confidence: 0.9,
          expectedSuccessRate: 0.3
        };
      }
      const timeKey = `${currentTimeOfDay}_${currentActivity}`;
      const timePreference = this.preferredTimes.get(timeKey);
      if (timePreference && timePreference.successRate > 0.6) {
        return {
          shouldSuggest: true,
          timing: "immediate",
          reason: "preferred_time",
          confidence: 0.8,
          expectedSuccessRate: timePreference.successRate
        };
      }
      if (currentActivity === "low" && this.isCalmTime(currentTimeOfDay)) {
        return {
          shouldSuggest: true,
          timing: "optimal_time",
          reason: "calm_moment",
          confidence: 0.7,
          expectedSuccessRate: 0.65
        };
      }
      const shouldSuggest = this.isOptimalPracticeTime(currentTimeOfDay, currentActivity);
      return {
        shouldSuggest,
        timing: shouldSuggest ? "optimal_time" : "short_delay",
        reason: shouldSuggest ? "optimal_timing" : "suboptimal_timing",
        confidence: shouldSuggest ? 0.6 : 0.4,
        expectedSuccessRate: shouldSuggest ? 0.6 : 0.4
      };
    }
    /**
     * Start tracking a communication session
     */
    startCommunicationSession(priority = "medium") {
      this.endCommunicationSession();
      const session = {
        startTime: Date.now(),
        isActive: true,
        gestureCount: 0,
        lastGestureTime: Date.now(),
        priority
      };
      this.communicationSessions.push(session);
    }
    /**
     * Record a gesture in the current communication session
     */
    recordGestureInSession() {
      const currentSession = this.getCurrentSession();
      if (currentSession && currentSession.isActive) {
        currentSession.gestureCount++;
        currentSession.lastGestureTime = Date.now();
      } else {
        this.startCommunicationSession("medium");
      }
    }
    /**
     * End the current communication session
     */
    endCommunicationSession() {
      const currentSession = this.getCurrentSession();
      if (currentSession && currentSession.isActive) {
        currentSession.isActive = false;
      }
    }
    /**
     * Check if there's currently active communication
     */
    isCommunicationActive() {
      const currentSession = this.getCurrentSession();
      if (!currentSession || !currentSession.isActive) {
        return false;
      }
      const timeSinceLastGesture = Date.now() - currentSession.lastGestureTime;
      if (timeSinceLastGesture > this.SESSION_TIMEOUT_MS) {
        this.endCommunicationSession();
        return false;
      }
      return true;
    }
    /**
     * Record a practice session for learning
     */
    recordPracticeSession(startTime, endTime, successRate, gesturesAttempted, timeOfDay, activityLevel, wasInterrupted = false) {
      const session = {
        startTime,
        endTime,
        duration: endTime - startTime,
        successRate,
        gesturesAttempted,
        interruptions: wasInterrupted ? 1 : 0,
        timeOfDay,
        dayOfWeek: new Date(startTime).getDay(),
        activityLevel
      };
      this.practiceHistory.push(session);
      if (this.practiceHistory.length > this.MAX_HISTORY) {
        this.practiceHistory.shift();
      }
      this.updatePreferredTimes(session);
      if (wasInterrupted) {
        this.interruptionHistory.push({
          timestamp: Date.now(),
          wasInterrupted: true,
          reason: "practice_during_communication"
        });
      }
    }
    /**
     * Get the current communication session
     */
    getCurrentSession() {
      return this.communicationSessions.find((session) => session.isActive) || null;
    }
    /**
     * Check if current time is optimal for practice
     */
    isOptimalPracticeTime(timeOfDay, activityLevel) {
      if (timeOfDay === "afternoon" || timeOfDay === "evening") {
        return activityLevel === "low" || activityLevel === "normal";
      }
      if (timeOfDay === "morning" && activityLevel === "low") {
        return true;
      }
      return false;
    }
    /**
     * Check if current time is a calm moment
     */
    isCalmTime(timeOfDay) {
      const hour = (/* @__PURE__ */ new Date()).getHours();
      if (timeOfDay === "morning" && hour >= 6 && hour <= 8) return true;
      if (timeOfDay === "afternoon" && hour >= 14 && hour <= 16) return true;
      if (timeOfDay === "evening" && hour >= 17 && hour <= 19) return true;
      return false;
    }
    /**
     * Update preferred practice times based on session results
     */
    updatePreferredTimes(session) {
      const timeKey = `${session.timeOfDay}_${session.activityLevel}`;
      const existing = this.preferredTimes.get(timeKey);
      if (existing) {
        const totalSessions = existing.frequency + 1;
        existing.successRate = (existing.successRate * existing.frequency + session.successRate) / totalSessions;
        existing.frequency = totalSessions;
        existing.lastPractice = session.endTime;
        existing.averageDuration = (existing.averageDuration * existing.frequency + session.duration) / totalSessions;
      } else {
        this.preferredTimes.set(timeKey, {
          successRate: session.successRate,
          frequency: 1,
          lastPractice: session.endTime,
          averageDuration: session.duration
        });
      }
    }
    /**
     * Get practice timing insights
     */
    getPracticeInsights() {
      const sortedPreferences = Array.from(this.preferredTimes.entries()).sort(([, a], [, b]) => b.successRate - a.successRate).slice(0, 3).map(([key, data]) => {
        const [timeOfDay, activityLevel] = key.split("_");
        return {
          timeOfDay,
          activityLevel,
          successRate: data.successRate,
          frequency: data.frequency
        };
      });
      const totalInterruptions = this.interruptionHistory.filter((i) => i.wasInterrupted).length;
      const interruptionRate = this.interruptionHistory.length > 0 ? totalInterruptions / this.interruptionHistory.length : 0;
      const optimalWindows = [];
      if (this.preferredTimes.has("afternoon_low")) optimalWindows.push("afternoon_low_activity");
      if (this.preferredTimes.has("evening_low")) optimalWindows.push("evening_low_activity");
      if (this.preferredTimes.has("morning_low")) optimalWindows.push("morning_low_activity");
      const recentSessions = this.practiceHistory.slice(-5);
      const recentSuccessRate = recentSessions.length > 0 ? recentSessions.reduce((sum, s) => sum + s.successRate, 0) / recentSessions.length : 0;
      return {
        preferredTimes: sortedPreferences,
        interruptionRate,
        optimalPracticeWindows: optimalWindows,
        recentSuccessRate
      };
    }
    /**
     * Get time until next optimal practice window
     */
    getTimeToOptimalPractice() {
      const now = /* @__PURE__ */ new Date();
      const currentHour = now.getHours();
      const currentTimeOfDay = this.getTimeOfDay(currentHour);
      let nextOptimalHour = -1;
      let expectedSuccessRate = 0.5;
      if (this.isOptimalPracticeTime(currentTimeOfDay, "low")) {
        nextOptimalHour = currentHour;
        expectedSuccessRate = 0.7;
      } else {
        const optimalHours = [
          { hour: 7, timeOfDay: "morning" },
          // 7 AM
          { hour: 15, timeOfDay: "afternoon" },
          // 3 PM
          { hour: 18, timeOfDay: "evening" }
          // 6 PM
        ];
        for (const optimal of optimalHours) {
          if (optimal.hour > currentHour) {
            nextOptimalHour = optimal.hour;
            const timeKey = `${optimal.timeOfDay}_low`;
            const preference = this.preferredTimes.get(timeKey);
            expectedSuccessRate = preference ? preference.successRate : 0.6;
            break;
          }
        }
        if (nextOptimalHour === -1) {
          nextOptimalHour = 7;
          expectedSuccessRate = 0.6;
        }
      }
      const minutesUntilOptimal = nextOptimalHour > currentHour ? (nextOptimalHour - currentHour) * 60 : (24 - currentHour + nextOptimalHour) * 60;
      return {
        minutesUntilOptimal,
        nextOptimalTime: `${nextOptimalHour}:00`,
        expectedSuccessRate
      };
    }
    /**
     * Get time of day from hour
     */
    getTimeOfDay(hour) {
      if (hour >= 6 && hour < 12) return "morning";
      if (hour >= 12 && hour < 17) return "afternoon";
      if (hour >= 17 && hour < 21) return "evening";
      return "night";
    }
    /**
     * Reset practice timing data
     */
    reset() {
      this.practiceHistory = [];
      this.communicationSessions = [];
      this.preferredTimes.clear();
      this.interruptionHistory = [];
    }
    /**
     * Export practice timing data for persistence
     */
    exportPracticeData() {
      return {
        practiceHistory: this.practiceHistory,
        preferredTimes: Object.fromEntries(this.preferredTimes),
        interruptionHistory: this.interruptionHistory
      };
    }
    /**
     * Import practice timing data from persistence
     */
    importPracticeData(data) {
      this.practiceHistory = data.practiceHistory || [];
      this.preferredTimes = new Map(Object.entries(data.preferredTimes || {}));
      this.interruptionHistory = data.interruptionHistory || [];
    }
  };

  // webview/utils/PositiveTelemetryManager.ts
  var PositiveTelemetryManager = class {
    constructor() {
      this.communicationMoments = [];
      this.successPatterns = /* @__PURE__ */ new Map();
      this.dailyHighlights = /* @__PURE__ */ new Map();
      this.MAX_MOMENTS = 1e3;
      // Keep extensive history for patterns
      this.SUCCESS_THRESHOLD = 0.7;
      // Only track high-confidence successes
      // Achievement tracking
      this.achievements = /* @__PURE__ */ new Map();
    }
    /**
     * Record a successful communication moment
     */
    recordCommunicationMoment(gesture, confidence, context, duration, emotionalContext) {
      if (confidence < this.SUCCESS_THRESHOLD) {
        return;
      }
      const moment = {
        timestamp: Date.now(),
        gesture,
        confidence,
        duration,
        context,
        achievements: this.calculateAchievements(gesture, confidence, context),
        emotionalContext
      };
      this.communicationMoments.push(moment);
      if (this.communicationMoments.length > this.MAX_MOMENTS) {
        this.communicationMoments.shift();
      }
      this.updateSuccessPattern(gesture, confidence, context);
      this.updateDailyHighlights(moment);
      this.checkForAchievements();
    }
    /**
     * Calculate achievements for this communication moment
     */
    calculateAchievements(gesture, confidence, context) {
      const achievements = [];
      if (confidence >= 0.9) {
        achievements.push("high_confidence_master");
      }
      if (context.timeOfDay === "morning" && confidence >= 0.8) {
        achievements.push("morning_communicator");
      }
      if (context.timeOfDay === "evening" && confidence >= 0.8) {
        achievements.push("evening_expresser");
      }
      if (context.activityLevel === "high" && confidence >= 0.8) {
        achievements.push("active_communicator");
      }
      const pattern = this.successPatterns.get(gesture);
      if (pattern && pattern.currentStreak >= 5) {
        achievements.push("streak_master");
      }
      if (pattern && pattern.currentStreak >= 10) {
        achievements.push("consistency_champion");
      }
      return achievements;
    }
    /**
     * Update success pattern for a gesture
     */
    updateSuccessPattern(gesture, confidence, context) {
      const existing = this.successPatterns.get(gesture);
      if (existing) {
        const totalSuccesses = existing.totalSuccesses + 1;
        const newAvgConfidence = (existing.averageConfidence * existing.totalSuccesses + confidence) / totalSuccesses;
        const timeSinceLastSuccess = Date.now() - existing.lastSuccess;
        const isConsecutive = timeSinceLastSuccess < 3e5;
        const currentStreak = isConsecutive ? existing.currentStreak + 1 : 1;
        const bestStreak = Math.max(existing.bestStreak, currentStreak);
        const timePreference = existing.preferredTimeOfDay === context.timeOfDay ? existing.preferredTimeOfDay : context.timeOfDay;
        const activityPreference = existing.preferredActivityLevel === context.activityLevel ? existing.preferredActivityLevel : context.activityLevel;
        const improvementRate = newAvgConfidence - existing.averageConfidence;
        existing.totalSuccesses = totalSuccesses;
        existing.averageConfidence = newAvgConfidence;
        existing.currentStreak = currentStreak;
        existing.bestStreak = bestStreak;
        existing.preferredTimeOfDay = timePreference;
        existing.preferredActivityLevel = activityPreference;
        existing.lastSuccess = Date.now();
        existing.improvementRate = improvementRate;
      } else {
        this.successPatterns.set(gesture, {
          gesture,
          totalSuccesses: 1,
          averageConfidence: confidence,
          bestStreak: 1,
          currentStreak: 1,
          preferredTimeOfDay: context.timeOfDay,
          preferredActivityLevel: context.activityLevel,
          lastSuccess: Date.now(),
          improvementRate: 0
        });
      }
    }
    /**
     * Update daily highlights
     */
    updateDailyHighlights(moment) {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existing = this.dailyHighlights.get(today);
      if (existing) {
        existing.totalCommunicationMoments++;
        existing.peakConfidence = Math.max(existing.peakConfidence, moment.confidence);
        const gestureSuccesses = this.communicationMoments.filter((m) => m.gesture === moment.gesture && m.timestamp >= Date.now() - 864e5).length;
        if (gestureSuccesses > this.getGestureSuccessCount(existing.mostSuccessfulGesture)) {
          existing.mostSuccessfulGesture = moment.gesture;
        }
        const uniqueGestures = new Set(
          this.communicationMoments.filter((m) => new Date(m.timestamp).toISOString().split("T")[0] === today).map((m) => m.gesture)
        );
        existing.uniqueGestures = uniqueGestures.size;
        if (moment.emotionalContext) {
          if (!existing.emotionalHighlights.includes(moment.emotionalContext)) {
            existing.emotionalHighlights.push(moment.emotionalContext);
          }
        }
      } else {
        this.dailyHighlights.set(today, {
          date: today,
          totalCommunicationMoments: 1,
          uniqueGestures: 1,
          longestStreak: 1,
          peakConfidence: moment.confidence,
          mostSuccessfulGesture: moment.gesture,
          emotionalHighlights: moment.emotionalContext ? [moment.emotionalContext] : [],
          caregiverInsights: []
        });
      }
    }
    /**
     * Check for new achievements
     */
    checkForAchievements() {
      const totalSuccesses = this.communicationMoments.length;
      if (totalSuccesses >= 10 && !this.achievements.get("first_steps")?.unlocked) {
        this.unlockAchievement("first_steps", "Took first communication steps! \u{1F389}");
      }
      if (totalSuccesses >= 50 && !this.achievements.get("growing_voice")?.unlocked) {
        this.unlockAchievement("growing_voice", "Growing voice getting stronger! \u{1F331}");
      }
      if (totalSuccesses >= 100 && !this.achievements.get("confident_communicator")?.unlocked) {
        this.unlockAchievement("confident_communicator", "Confident communicator emerging! \u2B50");
      }
      const maxStreak = Math.max(...Array.from(this.successPatterns.values()).map((p) => p.bestStreak));
      if (maxStreak >= 10 && !this.achievements.get("streak_star")?.unlocked) {
        this.unlockAchievement("streak_star", "Streak star shining bright! \u2B50");
      }
      const uniqueGestures = new Set(this.communicationMoments.map((m) => m.gesture)).size;
      if (uniqueGestures >= 5 && !this.achievements.get("expressive_range")?.unlocked) {
        this.unlockAchievement("expressive_range", "Expressive range expanding! \u{1F3A8}");
      }
    }
    /**
     * Unlock an achievement
     */
    unlockAchievement(key, description) {
      const emoji = this.getAchievementEmoji(key);
      this.achievements.set(key, {
        unlocked: true,
        unlockTime: Date.now(),
        description,
        emoji
      });
      this.sendAchievementNotification(key, description, emoji);
    }
    /**
     * Get emoji for achievement
     */
    getAchievementEmoji(key) {
      const emojiMap = {
        first_steps: "\u{1F389}",
        growing_voice: "\u{1F331}",
        confident_communicator: "\u2B50",
        streak_star: "\u2B50",
        expressive_range: "\u{1F3A8}"
      };
      return emojiMap[key] || "\u{1F3C6}";
    }
    /**
     * Send achievement notification to React Native
     */
    sendAchievementNotification(key, description, emoji) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "achievement_unlocked",
            achievement: key,
            description,
            emoji,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send achievement notification:", error);
      }
    }
    /**
     * Get helper method for gesture success count
     */
    getGestureSuccessCount(gesture) {
      return this.communicationMoments.filter((m) => m.gesture === gesture).length;
    }
    /**
     * Get positive insights for caregivers
     */
    getPositiveInsights() {
      const sortedPatterns = Array.from(this.successPatterns.values()).sort((a, b) => b.totalSuccesses - a.totalSuccesses).slice(0, 5).map((pattern) => ({
        gesture: pattern.gesture,
        totalSuccesses: pattern.totalSuccesses,
        averageConfidence: pattern.averageConfidence,
        bestStreak: pattern.bestStreak,
        improvement: pattern.improvementRate > 0 ? "improving" : "consistent"
      }));
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const recentHighlights = this.dailyHighlights.get(today) || null;
      const unlockedAchievements = Array.from(this.achievements.values()).filter((a) => a.unlocked).map((a) => ({
        key: Array.from(this.achievements.entries()).find(([, val]) => val === a)?.[0] || "",
        description: a.description,
        emoji: a.emoji,
        unlockTime: a.unlockTime
      }));
      const caregiverTips = this.generateCaregiverTips(sortedPatterns, recentHighlights);
      return {
        totalCommunicationMoments: this.communicationMoments.length,
        successPatterns: sortedPatterns,
        recentHighlights,
        achievements: unlockedAchievements,
        caregiverTips
      };
    }
    /**
     * Generate helpful tips for caregivers
     */
    generateCaregiverTips(patterns, highlights) {
      const tips = [];
      if (patterns.length === 0) {
        tips.push("Every communication attempt is a victory! Keep encouraging Amy.");
        return tips;
      }
      const topPattern = patterns[0];
      if (topPattern) {
        tips.push(`${topPattern.gesture} is becoming a strong communication tool with ${topPattern.totalSuccesses} successful uses!`);
      }
      const bestStreak = Math.max(...patterns.map((p) => p.bestStreak));
      if (bestStreak >= 5) {
        tips.push(`Amy achieved a ${bestStreak}-gesture streak - consistency is building!`);
      }
      if (highlights && highlights.totalCommunicationMoments > 0) {
        const timeOfDay = (/* @__PURE__ */ new Date()).getHours() < 12 ? "morning" : (/* @__PURE__ */ new Date()).getHours() < 17 ? "afternoon" : "evening";
        tips.push(`${timeOfDay} seems to be a productive time for communication.`);
      }
      const improvingPatterns = patterns.filter((p) => p.improvement === "improving");
      if (improvingPatterns.length > 0) {
        tips.push("Amy is showing improvement in confidence - keep up the great work!");
      }
      return tips;
    }
    /**
     * Get communication timeline (positive moments only)
     */
    getCommunicationTimeline(hours = 24) {
      const cutoffTime = Date.now() - hours * 60 * 60 * 1e3;
      return this.communicationMoments.filter((moment) => moment.timestamp > cutoffTime).sort((a, b) => b.timestamp - a.timestamp);
    }
    /**
     * Export positive telemetry data
     */
    exportPositiveData() {
      return {
        communicationMoments: this.communicationMoments,
        successPatterns: Object.fromEntries(this.successPatterns),
        achievements: Object.fromEntries(this.achievements),
        dailyHighlights: Object.fromEntries(this.dailyHighlights)
      };
    }
    /**
     * Import positive telemetry data
     */
    importPositiveData(data) {
      this.communicationMoments = data.communicationMoments || [];
      this.successPatterns = new Map(Object.entries(data.successPatterns || {}));
      this.achievements = new Map(Object.entries(data.achievements || {}));
      this.dailyHighlights = new Map(Object.entries(data.dailyHighlights || {}));
    }
    /**
     * Reset all positive telemetry data
     */
    reset() {
      this.communicationMoments = [];
      this.successPatterns.clear();
      this.dailyHighlights.clear();
      this.achievements.clear();
    }
  };

  // webview/utils/ErrorRecoveryManager.ts
  var ErrorRecoveryManager = class {
    constructor() {
      this.failureCount = 0;
      this.lastFailureTime = 0;
      this.circuitBreakerOpen = false;
      this.fallbackMode = false;
      this.recoveryAttempts = /* @__PURE__ */ new Map();
      this.lastRecoveryTime = 0;
      this.emergencyMode = false;
      this.CIRCUIT_BREAKER_THRESHOLD = 5;
      this.CIRCUIT_BREAKER_TIMEOUT = 3e4;
      // 30 seconds
      this.FAILURE_WINDOW = 6e4;
      // 1 minute
      this.MAX_RECOVERY_ATTEMPTS = 3;
      this.RECOVERY_COOLDOWN = 5e3;
    }
    // 5 seconds between recovery attempts
    getErrorInfo(error, context) {
      const errorMessage = error.message.toLowerCase();
      if (context.includes("emergency") || errorMessage.includes("emergency")) {
        return {
          message: "Emergency gesture detection failed",
          code: "EMERGENCY_ERROR",
          recoverable: true,
          severity: "critical",
          suggestedAction: "immediate_retry",
          userMessage: "Notfall-Erkennung wird wiederhergestellt..."
        };
      }
      if (errorMessage.includes("network") || errorMessage.includes("fetch") || errorMessage.includes("timeout")) {
        return {
          message: "Network connectivity issue detected",
          code: "NETWORK_ERROR",
          recoverable: true,
          severity: "medium",
          suggestedAction: "retry_with_backoff",
          userMessage: "Verbindungsproblem erkannt, versuche Wiederherstellung..."
        };
      }
      if (errorMessage.includes("camera") || errorMessage.includes("media") || errorMessage.includes("permission")) {
        return {
          message: "Camera access issue detected",
          code: "CAMERA_ERROR",
          recoverable: true,
          severity: "high",
          suggestedAction: "request_permission",
          userMessage: "Kamera-Zugriff wird \xFCberpr\xFCft..."
        };
      }
      if (errorMessage.includes("mediapipe") || errorMessage.includes("wasm") || errorMessage.includes("webgl")) {
        return {
          message: "Gesture recognition system issue detected",
          code: "MEDIAPIPE_ERROR",
          recoverable: true,
          severity: "medium",
          suggestedAction: "fallback_mode",
          userMessage: "Gestenerkennung wird neu gestartet..."
        };
      }
      if (errorMessage.includes("memory") || errorMessage.includes("out of memory")) {
        return {
          message: "Memory issue detected",
          code: "MEMORY_ERROR",
          recoverable: true,
          severity: "high",
          suggestedAction: "cleanup_resources",
          userMessage: "Speicher wird optimiert..."
        };
      }
      if (errorMessage.includes("performance") || errorMessage.includes("slow") || errorMessage.includes("timeout")) {
        return {
          message: "Performance issue detected",
          code: "PERFORMANCE_ERROR",
          recoverable: true,
          severity: "low",
          suggestedAction: "reduce_quality",
          userMessage: "Leistung wird angepasst..."
        };
      }
      return {
        message: `System issue detected during ${context}`,
        code: "GENERIC_ERROR",
        recoverable: false,
        severity: "medium",
        suggestedAction: "log_and_continue",
        userMessage: "System wird \xFCberpr\xFCft..."
      };
    }
    recordFailure(error, context) {
      const now = Date.now();
      const errorInfo = this.getErrorInfo(error, context);
      const recoveryKey = `${errorInfo.code}_${context}`;
      const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
      if (attempts >= this.MAX_RECOVERY_ATTEMPTS) {
        console.warn(`Max recovery attempts reached for ${recoveryKey}`);
        return false;
      }
      if (now - this.lastFailureTime > this.FAILURE_WINDOW) {
        this.failureCount = 0;
        this.recoveryAttempts.clear();
      }
      this.failureCount++;
      this.lastFailureTime = now;
      this.recoveryAttempts.set(recoveryKey, attempts + 1);
      if (this.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
        this.circuitBreakerOpen = true;
        console.warn("Circuit breaker opened due to repeated failures");
        this.activateEmergencyMode();
        return false;
      }
      return true;
    }
    isCircuitBreakerOpen() {
      if (this.circuitBreakerOpen && Date.now() - this.lastFailureTime > this.CIRCUIT_BREAKER_TIMEOUT) {
        this.circuitBreakerOpen = false;
        this.failureCount = 0;
        this.recoveryAttempts.clear();
        console.info("Circuit breaker auto-closed");
        this.deactivateEmergencyMode();
      }
      return this.circuitBreakerOpen;
    }
    activateFallbackMode() {
      if (!this.fallbackMode) {
        this.fallbackMode = true;
        console.warn("Activating fallback gesture detection mode");
        this.sendTelemetryEvent("fallback_mode_activated", {
          timestamp: Date.now(),
          reason: "error_recovery"
        });
      }
    }
    activateEmergencyMode() {
      if (!this.emergencyMode) {
        this.emergencyMode = true;
        console.warn("\u{1F6A8} EMERGENCY MODE ACTIVATED - Critical gesture detection only");
        this.sendTelemetryEvent("emergency_mode_activated", {
          timestamp: Date.now(),
          reason: "circuit_breaker_opened"
        });
      }
    }
    deactivateEmergencyMode() {
      if (this.emergencyMode) {
        this.emergencyMode = false;
        console.info("\u2705 Emergency mode deactivated - Full functionality restored");
        this.sendTelemetryEvent("emergency_mode_deactivated", {
          timestamp: Date.now()
        });
      }
    }
    isInFallbackMode() {
      return this.fallbackMode;
    }
    isInEmergencyMode() {
      return this.emergencyMode;
    }
    canAttemptRecovery(context) {
      const now = Date.now();
      if (now - this.lastRecoveryTime < this.RECOVERY_COOLDOWN) {
        return false;
      }
      if (this.isCircuitBreakerOpen()) {
        return false;
      }
      return true;
    }
    recordSuccessfulRecovery(context) {
      this.lastRecoveryTime = Date.now();
      const recoveryKey = `recovery_${context}`;
      this.recoveryAttempts.delete(recoveryKey);
      this.sendTelemetryEvent("recovery_successful", {
        context,
        timestamp: Date.now()
      });
    }
    sendTelemetryEvent(event, data = {}) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "telemetry",
            event,
            data
          })
        );
      } catch (err2) {
        console.warn(`Failed to send telemetry event ${event}:`, err2);
      }
    }
    reset() {
      this.failureCount = 0;
      this.lastFailureTime = 0;
      this.circuitBreakerOpen = false;
      this.fallbackMode = false;
      this.emergencyMode = false;
      this.recoveryAttempts.clear();
      this.lastRecoveryTime = 0;
    }
    getHealthStatus() {
      return {
        healthy: !this.circuitBreakerOpen && !this.emergencyMode,
        fallbackActive: this.fallbackMode,
        emergencyActive: this.emergencyMode,
        failureCount: this.failureCount,
        lastFailure: this.lastFailureTime,
        circuitBreakerOpen: this.circuitBreakerOpen
      };
    }
  };

  // webview/gestureDetector.ts
  var onError = (e) => {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "error",
          message: "gesture_processing_error",
          // Generic identifier for React Native to handle
          // Keep technical details for logging but don't send to UI
          _technical: {
            message: e.message,
            file: e.filename,
            line: e.lineno,
            col: e.colno,
            stack: e.error?.stack || null
          }
        })
      );
    } catch (err2) {
      console.warn("Failed to forward script error event:", err2);
    }
  };
  window.addEventListener("error", onError);
  var onUnhandledRejection = (e) => {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "error",
          message: "gesture_processing_error",
          // Generic identifier for React Native to handle
          // Keep technical details for logging but don't send to UI
          _technical: {
            message: String(e?.reason?.message ?? e?.reason ?? "unhandledrejection"),
            stack: e.reason?.stack || null
          }
        })
      );
    } catch (err2) {
      console.warn("Failed to forward unhandledrejection:", err2);
    }
  };
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.fflate = { unzip, unzipSync };
  installMlp();
  var errorRecoveryManager = new ErrorRecoveryManager();
  var FallbackGestureDetector = class {
    constructor() {
      this.lastLandmarks = null;
      this.gestureHistory = [];
      this.HISTORY_SIZE = 5;
      this.ruleBasedConfidence = 0;
    }
    /**
     * Simple rule-based gesture detection as fallback
     */
    detectGesture(landmarks) {
      if (!landmarks || landmarks.length === 0) {
        return { gesture: "", confidence: 0, isFallback: true };
      }
      this.lastLandmarks = landmarks;
      const gesture = this.detectBasicGesture(landmarks[0]);
      const confidence = this.calculateRuleBasedConfidence(landmarks[0], gesture);
      this.gestureHistory.push({
        gesture,
        confidence,
        timestamp: Date.now()
      });
      if (this.gestureHistory.length > this.HISTORY_SIZE) {
        this.gestureHistory.shift();
      }
      const smoothedConfidence = this.smoothConfidence();
      return {
        gesture,
        confidence: smoothedConfidence,
        isFallback: true,
        feedback: this.getGestureFeedback(gesture, smoothedConfidence)
      };
    }
    detectBasicGesture(hand) {
      if (!hand || hand.length < 21) return "";
      const fingerTips = [8, 12, 16, 20];
      const fingerJoints = [6, 10, 14, 18];
      const thumbTip = hand[4];
      const thumbJoint = hand[3];
      let extendedFingers = 0;
      for (let i = 0; i < fingerTips.length; i++) {
        if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
          extendedFingers++;
        }
      }
      const thumbExtended = thumbTip[1] < thumbJoint[1];
      if (extendedFingers === 0 && !thumbExtended) {
        return "fist";
      } else if (extendedFingers === 1 && !thumbExtended) {
        return "point";
      } else if (extendedFingers === 2 && !thumbExtended) {
        return "peace";
      } else if (extendedFingers >= 3 && thumbExtended) {
        return "open_palm";
      } else if (extendedFingers === 0 && thumbExtended) {
        return "thumbs_up";
      }
      return "unknown";
    }
    calculateRuleBasedConfidence(hand, gesture) {
      if (!hand || gesture === "unknown") return 0.3;
      let confidence = 0.5;
      if (this.lastLandmarks && this.lastLandmarks[0]) {
        const movement = this.calculateMovement(this.lastLandmarks[0], hand);
        if (movement < 0.05) confidence += 0.2;
      }
      switch (gesture) {
        case "fist":
          confidence += this.checkFistClarity(hand) ? 0.2 : -0.1;
          break;
        case "point":
          confidence += this.checkPointClarity(hand) ? 0.2 : -0.1;
          break;
        case "thumbs_up":
          confidence += this.checkThumbsUpClarity(hand) ? 0.2 : -0.1;
          break;
      }
      return Math.max(0.1, Math.min(0.8, confidence));
    }
    checkFistClarity(hand) {
      const fingerTips = [8, 12, 16, 20];
      const fingerJoints = [6, 10, 14, 18];
      let curledFingers = 0;
      for (let i = 0; i < fingerTips.length; i++) {
        if (hand[fingerTips[i]][1] > hand[fingerJoints[i]][1]) {
          curledFingers++;
        }
      }
      return curledFingers >= 3;
    }
    checkPointClarity(hand) {
      const indexExtended = hand[8][1] < hand[6][1];
      const otherFingersCurled = hand[12][1] > hand[10][1] && // Middle
      hand[16][1] > hand[14][1] && // Ring
      hand[20][1] > hand[18][1];
      return indexExtended && otherFingersCurled;
    }
    checkThumbsUpClarity(hand) {
      const thumbExtended = hand[4][1] < hand[3][1];
      const otherFingersCurled = hand[8][1] > hand[6][1] && // Index
      hand[12][1] > hand[10][1] && // Middle
      hand[16][1] > hand[14][1] && // Ring
      hand[20][1] > hand[18][1];
      return thumbExtended && otherFingersCurled;
    }
    calculateMovement(prevHand, currHand) {
      let totalMovement = 0;
      let points = 0;
      for (let i = 0; i < Math.min(prevHand.length, currHand.length); i++) {
        if (prevHand[i] && currHand[i]) {
          const dx = prevHand[i][0] - currHand[i][0];
          const dy = prevHand[i][1] - currHand[i][1];
          totalMovement += Math.sqrt(dx * dx + dy * dy);
          points++;
        }
      }
      return points > 0 ? totalMovement / points : 0;
    }
    smoothConfidence() {
      if (this.gestureHistory.length === 0) return 0;
      const recent = this.gestureHistory.slice(-3);
      const avgConfidence = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
      return avgConfidence * 0.8 + (recent[recent.length - 1]?.confidence || 0) * 0.2;
    }
    getGestureFeedback(gesture, confidence) {
      if (confidence < 0.4) {
        return "Versuch es nochmal, halte deine Hand ruhig";
      }
      switch (gesture) {
        case "fist":
          return "Faust erkannt!";
        case "point":
          return "Zeigefinger erkannt!";
        case "thumbs_up":
          return "Daumen hoch erkannt!";
        case "open_palm":
          return "Offene Hand erkannt!";
        default:
          return "Geste erkannt!";
      }
    }
    reset() {
      this.lastLandmarks = null;
      this.gestureHistory = [];
    }
  };
  var fallbackGestureDetector = new FallbackGestureDetector();
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: "telemetry", event: "mlp_ready" })
    );
  } catch (err2) {
    console.warn("Failed to send 'mlp_ready' telemetry event:", err2);
  }
  var tapToStartText = window.__tapToStart || "";
  var recognizerInitFailed = window.__recognizerInitFailed || "Erkennung konnte nicht gestartet werden: ";
  var predictionError = window.__predictionError || "Vorhersagefehler: ";
  var cameraError = window.__cameraError || "Kamerafehler: ";
  var facingMode = window.__facingMode || "user";
  var mirrorOverlay = window.__mirrorOverlay === true;
  var MLP_CONFIDENCE_THRESHOLD = window.__mlpThreshold ?? 0.4;
  var FALLBACK_CONFIDENCE_THRESHOLD = window.__fallbackThreshold ?? 0.3;
  var GESTURE_SIZE_TOLERANCE = window.__gestureSizeTolerance ?? 0.3;
  var EmergencyGestureSystem = class {
    constructor() {
      this.EMERGENCY_GESTURES = /* @__PURE__ */ new Set([
        "hilfe",
        "help",
        "emergency",
        "stop",
        "danger",
        "notfall",
        "gefahr",
        "au",
        "schmerz",
        "angst"
      ]);
      this.EMERGENCY_CONFIDENCE_THRESHOLD = 0.25;
      // Very low threshold for emergencies
      this.lastEmergencyGestureTime = 0;
      this.EMERGENCY_COOLDOWN_MS = 500;
      // Quick response for repeated emergencies
      this.emergencyHistory = [];
      this.MAX_HISTORY = 10;
    }
    /**
     * Check if gesture is an emergency and should be prioritized
     */
    isEmergencyGesture(gesture, confidence) {
      if (!this.EMERGENCY_GESTURES.has(gesture.toLowerCase())) {
        return false;
      }
      return confidence >= this.EMERGENCY_CONFIDENCE_THRESHOLD;
    }
    /**
     * Process emergency gesture with priority handling
     */
    processEmergencyGesture(gesture, confidence, landmarks) {
      const now = Date.now();
      const timeSinceLastEmergency = now - this.lastEmergencyGestureTime;
      this.emergencyHistory.push({
        gesture,
        timestamp: now,
        confidence
      });
      if (this.emergencyHistory.length > this.MAX_HISTORY) {
        this.emergencyHistory.shift();
      }
      if (!this.isEmergencyGesture(gesture, confidence)) {
        return {
          shouldProcess: false,
          priority: "normal",
          cooldownRemaining: 0,
          feedback: ""
        };
      }
      if (timeSinceLastEmergency < this.EMERGENCY_COOLDOWN_MS) {
        return {
          shouldProcess: false,
          priority: "critical",
          cooldownRemaining: this.EMERGENCY_COOLDOWN_MS - timeSinceLastEmergency,
          feedback: "Notfall-Geste erkannt, wird verarbeitet..."
        };
      }
      this.lastEmergencyGestureTime = now;
      this.sendEmergencyTelemetry(gesture, confidence);
      return {
        shouldProcess: true,
        priority: "critical",
        cooldownRemaining: 0,
        feedback: this.getEmergencyFeedback(gesture)
      };
    }
    /**
     * Get appropriate feedback for emergency gesture
     */
    getEmergencyFeedback(gesture) {
      const feedbackMap = {
        "hilfe": "\u{1F198} Hilfe wird gerufen!",
        "help": "\u{1F198} Help is being called!",
        "emergency": "\u{1F6A8} Notfall erkannt!",
        "stop": "\u23F9\uFE0F Stop-Signal erkannt!",
        "danger": "\u26A0\uFE0F Gefahr erkannt!",
        "notfall": "\u{1F6A8} Notfall-Situation!",
        "gefahr": "\u26A0\uFE0F Gefahr-Signal!",
        "au": "\u{1F623} Schmerzsignal erkannt!",
        "schmerz": "\u{1F623} Pain signal detected!",
        "angst": "\u{1F628} Angstsignal erkannt!"
      };
      return feedbackMap[gesture.toLowerCase()] || "\u{1F6A8} Notfall-Geste erkannt!";
    }
    /**
     * Send emergency telemetry to React Native
     */
    sendEmergencyTelemetry(gesture, confidence) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "emergency_gesture",
            gesture,
            confidence,
            timestamp: Date.now(),
            systemHealth: errorRecoveryManager.getHealthStatus()
          })
        );
      } catch (err2) {
        console.error("Failed to send emergency telemetry:", err2);
      }
    }
    /**
     * Check if system should enter emergency-only mode
     */
    shouldEnterEmergencyMode() {
      const recentEmergencies = this.emergencyHistory.filter(
        (h) => Date.now() - h.timestamp < 3e4
        // Last 30 seconds
      );
      return recentEmergencies.length >= 3;
    }
    /**
     * Get emergency system status
     */
    getStatus() {
      const recentEmergencies = this.emergencyHistory.filter(
        (h) => Date.now() - h.timestamp < 6e4
        // Last minute
      );
      return {
        activeEmergencies: recentEmergencies.length,
        lastEmergencyTime: this.lastEmergencyGestureTime,
        emergencyModeRecommended: this.shouldEnterEmergencyMode()
      };
    }
    /**
     * Reset emergency system (for testing or recovery)
     */
    reset() {
      this.emergencyHistory = [];
      this.lastEmergencyGestureTime = 0;
    }
  };
  var emergencyGestureSystem = new EmergencyGestureSystem();
  var celebrationSystem = new CelebrationSystem();
  var feedbackSystem = new FeedbackSystem();
  var personalizedThresholdManager = new PersonalizedThresholdManager();
  var gestureCombinationManager = new GestureCombinationManager();
  var hapticFeedbackManager = new HapticFeedbackManager();
  var gestureReplayManager = new GestureReplayManager();
  var navigationGestureManager = new NavigationGestureManager();
  var visualCorrectionManager = new VisualCorrectionManager();
  var gestureUndoManager = new GestureUndoManager();
  var enhancedContextRecognizer = new EnhancedContextAwareRecognizer();
  var adaptivePracticeManager = new AdaptivePracticeManager();
  var positiveTelemetryManager = new PositiveTelemetryManager();
  var BatteryMonitor = class {
    constructor() {
      this.batteryLevel = 1;
      this.isMonitoring = false;
      this.emergencyMode = false;
      this.lastBatteryCheck = 0;
      this.BATTERY_CHECK_INTERVAL = 3e4;
      // Check every 30 seconds
      this.EMERGENCY_BATTERY_THRESHOLD = 0.05;
    }
    // 5% battery triggers emergency mode
    /**
     * Start battery monitoring for emergency mode activation
     */
    startMonitoring() {
      if (this.isMonitoring) return;
      this.isMonitoring = true;
      this.checkBatteryLevel();
      setInterval(() => {
        this.checkBatteryLevel();
      }, this.BATTERY_CHECK_INTERVAL);
    }
    /**
     * Check current battery level and activate emergency mode if critical
     */
    async checkBatteryLevel() {
      try {
        if ("getBattery" in navigator) {
          const battery = await navigator.getBattery();
          this.batteryLevel = battery.level;
          this.handleBatteryLevel(this.batteryLevel);
        } else if ("battery" in navigator) {
          this.batteryLevel = navigator.battery.level;
          this.handleBatteryLevel(this.batteryLevel);
        } else {
          this.batteryLevel = 0.5;
        }
      } catch (error) {
        console.warn("Battery monitoring failed:", error);
        this.batteryLevel = 0.5;
      }
      this.lastBatteryCheck = Date.now();
    }
    /**
     * Handle battery level changes and emergency mode activation
     */
    handleBatteryLevel(level) {
      const wasEmergency = this.emergencyMode;
      this.emergencyMode = level <= this.EMERGENCY_BATTERY_THRESHOLD;
      if (this.emergencyMode && !wasEmergency) {
        console.warn(`\u{1F50B} CRITICAL BATTERY: ${Math.round(level * 100)}% - Activating emergency mode`);
        this.activateEmergencyMode();
      } else if (!this.emergencyMode && wasEmergency) {
        console.log(`\u{1F50B} Battery recovered: ${Math.round(level * 100)}% - Deactivating emergency mode`);
        this.deactivateEmergencyMode();
      }
    }
    /**
     * Activate emergency mode for critical battery situations
     */
    activateEmergencyMode() {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "emergency_mode_activated",
            reason: "critical_battery",
            batteryLevel: this.batteryLevel,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.error("Failed to send emergency mode activation:", error);
      }
    }
    /**
     * Deactivate emergency mode when battery recovers
     */
    deactivateEmergencyMode() {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "emergency_mode_deactivated",
            reason: "battery_recovered",
            batteryLevel: this.batteryLevel,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.error("Failed to send emergency mode deactivation:", error);
      }
    }
    /**
     * Get current battery status
     */
    getStatus() {
      return {
        level: this.batteryLevel,
        emergencyMode: this.emergencyMode,
        lastCheck: this.lastBatteryCheck
      };
    }
    /**
     * Force emergency mode for testing
     */
    forceEmergencyMode() {
      this.emergencyMode = true;
      this.activateEmergencyMode();
    }
    /**
     * Reset emergency mode for testing
     */
    resetEmergencyMode() {
      this.emergencyMode = false;
      this.deactivateEmergencyMode();
    }
  };
  var batteryMonitor = new BatteryMonitor();
  var partialGestureDetector = new PartialGestureDetector();
  batteryMonitor.startMonitoring();
  gestureSizeNormalizer.setTolerance(GESTURE_SIZE_TOLERANCE);
  window.emergencyGestureSystem = emergencyGestureSystem;
  window.errorRecoveryManager = errorRecoveryManager;
  window.batteryMonitor = batteryMonitor;
  window.handStabilityAssistant = handStabilityAssistant;
  window.partialGestureDetector = partialGestureDetector;
  window.tremorCompensator = tremorCompensator;
  window.gestureSizeNormalizer = gestureSizeNormalizer;
  window.celebrationSystem = celebrationSystem;
  window.feedbackSystem = feedbackSystem;
  window.enhancedContextRecognizer = enhancedContextRecognizer;
  window.adaptivePracticeManager = adaptivePracticeManager;
  window.positiveTelemetryManager = positiveTelemetryManager;
  window.__mlpPredict = void 0;
  window.__modelUpdateInProgress = false;
  window.__activeRecognitionSession = false;
  var HandStabilityAssistant = class {
    constructor() {
      this.stabilityHistory = [];
      this.MAX_HISTORY = 10;
      this.stabilityThreshold = 0.02;
      // Movement threshold for stability
      this.stabilityScore = 0;
      this.lastStablePosition = null;
    }
    /**
     * Analyze hand stability based on landmark movement
     */
    analyzeStability(landmarks) {
      if (landmarks.length === 0 || !landmarks[0]) {
        return { isStable: false, stabilityScore: 0, feedback: "Positioniere deine Hand in der Kamera" };
      }
      const hand = landmarks[0];
      if (hand.length < 21) {
        return { isStable: false, stabilityScore: 0, feedback: "Halte deine Hand ruhig" };
      }
      const palmCenter = this.calculatePalmCenter(hand);
      const movement = this.lastStablePosition ? this.calculateMovement(this.lastStablePosition, palmCenter) : 0;
      this.stabilityHistory.push(movement);
      if (this.stabilityHistory.length > this.MAX_HISTORY) {
        this.stabilityHistory.shift();
      }
      const avgMovement = this.stabilityHistory.reduce((sum, m) => sum + m, 0) / this.stabilityHistory.length;
      this.stabilityScore = Math.max(0, 1 - avgMovement / this.stabilityThreshold);
      const isStable = this.stabilityScore > 0.7;
      if (isStable) {
        this.lastStablePosition = palmCenter;
      }
      let feedback = "";
      let guidePosition;
      if (!isStable) {
        if (this.stabilityScore < 0.3) {
          feedback = "Halte deine Hand ruhiger";
          guidePosition = { x: 0.5, y: 0.5 };
        } else if (this.stabilityScore < 0.7) {
          feedback = "Fast geschafft! Halte still";
        }
      } else {
        feedback = "Perfekt! Hand ist stabil";
      }
      return {
        isStable,
        stabilityScore: this.stabilityScore,
        feedback,
        guidePosition
      };
    }
    /**
     * Calculate center of palm using key landmarks
     */
    calculatePalmCenter(hand) {
      const wrist = hand[0];
      const indexBase = hand[5];
      const pinkyBase = hand[17];
      const centerX = (wrist[0] + indexBase[0] + pinkyBase[0]) / 3;
      const centerY = (wrist[1] + indexBase[1] + pinkyBase[1]) / 3;
      const centerZ = (wrist[2] + indexBase[2] + pinkyBase[2]) / 3;
      return [[centerX, centerY, centerZ]];
    }
    /**
     * Calculate movement between two positions
     */
    calculateMovement(pos1, pos2) {
      if (!pos1[0] || !pos2[0]) return 0;
      const dx = pos1[0][0] - pos2[0][0];
      const dy = pos1[0][1] - pos2[0][1];
      const dz = pos1[0][2] - pos2[0][2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * Reset stability tracking
     */
    reset() {
      this.stabilityHistory = [];
      this.stabilityScore = 0;
      this.lastStablePosition = null;
    }
    /**
     * Get current stability status
     */
    getStabilityStatus() {
      return {
        score: this.stabilityScore,
        isStable: this.stabilityScore > 0.7
      };
    }
  };
  var handStabilityAssistant = new HandStabilityAssistant();
  var tremorCompensator = new TremorCompensator();
  var lastProcessedLandmarks = [];
  var feedbackHistory = [];
  var resourceManager = new ResourceManager();
  var video = document.createElement("video");
  var overlay = document.createElement("canvas");
  overlay.id = "overlay";
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  var mainGestureDetector = null;
  function initDom() {
    document.body.appendChild(video);
    document.body.appendChild(overlay);
    try {
      resizeOverlay();
    } catch (e) {
      console.warn("Initial resize failed:", e);
    }
    if (typeof ResizeObserver === "function") {
      videoResizeObserver = new ResizeObserver(() => resizeOverlay());
      videoResizeObserver.observe(video);
      resourceManager.registerObserver(videoResizeObserver);
    } else {
      const onWinResize = () => resizeOverlay();
      window.addEventListener("resize", onWinResize);
      removeWindowResize = () => window.removeEventListener("resize", onWinResize);
      resourceManager.registerEventListener(window, "resize", onWinResize);
    }
    const tap = document.createElement("div");
    tap.id = "tapToStart";
    tap.innerText = tapToStartText;
    if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
      tap.classList.add("hidden");
    }
    const tapClickHandler = async () => {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: "telemetry", event: "tap_start" })
        );
      } catch (postErr) {
        console.warn("Failed to send 'tap_start' telemetry event:", postErr);
      }
      try {
        await startCamera();
        tap.classList.add("hidden");
      } catch (err2) {
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "error",
              message: cameraError + (err2 instanceof Error ? err2.message : String(err2))
            })
          );
        } catch (postErr) {
          console.warn("Failed to send camera error:", postErr);
        }
        return;
      }
    };
    tap.addEventListener("click", tapClickHandler);
    resourceManager.registerEventListener(tap, "click", tapClickHandler);
    document.body.appendChild(tap);
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: "telemetry", event: "dom_ready" })
      );
    } catch (err2) {
      console.warn("Failed to send 'dom_ready' telemetry event:", err2);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDom);
  } else {
    initDom();
  }
  async function createGestureRecognizer() {
    try {
      mainGestureDetector = new GestureDetector(video, overlay);
      await mainGestureDetector.initialize();
      mainGestureDetector.setResultCallback((results, timestamp) => {
        processGestureResults(results, timestamp);
      });
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: "telemetry", event: "recognizer_init", ms: 0 })
        );
      } catch (err2) {
        console.warn('Failed to send "recognizer_init" telemetry event:', err2);
      }
      resetGestureChangeState();
    } catch (e) {
      const errorInfo = errorRecoveryManager.getErrorInfo(e, "gesture_recognizer_initialization");
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "error",
            message: recognizerInitFailed + errorInfo.message,
            code: errorInfo.code,
            recoverable: errorInfo.recoverable
          })
        );
      } catch (err2) {
        console.warn("Failed to send initialization error message:", err2);
      }
      errorRecoveryManager.activateFallbackMode();
    }
  }
  var frameCount = 0;
  var lastSentAt = 0;
  var lastSentGestureSerialized = null;
  var lastSentScore = 0;
  var running = true;
  var cleanedUp = false;
  function isTwoHandGesture(gesture) {
    return gesture && typeof gesture === "object" && "left" in gesture && "right" in gesture;
  }
  function serializeGesture(g) {
    if (g == null) return null;
    if (typeof g === "string") return g;
    if (isTwoHandGesture(g)) {
      return JSON.stringify({ left: g.left, right: g.right });
    }
    return null;
  }
  function resetGestureChangeState() {
    lastSentGestureSerialized = null;
    lastSentScore = 0;
    lastSentAt = 0;
    tremorCompensator.clearHistory();
    lastProcessedLandmarks = [];
  }
  var currentConfig = loadConfig();
  var FRAME_LATENCY_SAMPLE_INTERVAL = currentConfig.timing.frameLatencySampleInterval;
  function isEmergencyGesture(gesture) {
    if (!gesture) return false;
    const lowerGesture = gesture.toLowerCase();
    return EMERGENCY_GESTURES.has(lowerGesture);
  }
  function shouldProcessEmergencyGesture(gesture, confidence) {
    if (!isEmergencyGesture(gesture)) return false;
    if (confidence < EMERGENCY_CONFIDENCE_THRESHOLD) return false;
    const now = performance.now();
    if (now - lastEmergencyGestureTime < EMERGENCY_COOLDOWN_MS) return false;
    lastEmergencyGestureTime = now;
    return true;
  }
  function sendEmergencyGesture(gesture, confidence, landmarks, handedArr) {
    try {
      const payload = {
        type: "gesture",
        gesture,
        confidence,
        landmarks,
        handednesses: handedArr,
        emergency: true,
        // Flag for priority processing
        timestamp: performance.now()
      };
      window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
    } catch (err2) {
      console.warn("Failed to send emergency gesture:", err2);
    }
  }
  function processGestureResults(results, timestamp) {
    try {
      const frameLatency = Math.round(performance.now() - timestamp);
      frameCount++;
      if (frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0) {
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({ type: "telemetry", event: "frame_latency", ms: frameLatency })
          );
        } catch (err2) {
          console.warn("Failed to send 'frame_latency' telemetry event:", err2);
        }
      }
      let allLandmarks = (results?.landmarks || []).map(
        (hand) => hand.map((lm) => [lm.x, lm.y, lm.z ?? 0])
      );
      if (allLandmarks.length > 0) {
        const stability = handStabilityAssistant.getStabilityStatus().score;
        hapticFeedbackManager.onHandDetected(allLandmarks.length, stability);
        if (!gestureReplayManager["currentRecording"]) {
        }
      }
      if (allLandmarks.length > 0) {
        const isIntentional = tremorCompensator.isIntentionalMovement(allLandmarks, lastProcessedLandmarks);
        if (isIntentional) {
          allLandmarks = tremorCompensator.smoothLandmarks(allLandmarks);
          lastProcessedLandmarks = JSON.parse(JSON.stringify(allLandmarks));
        } else {
          allLandmarks = lastProcessedLandmarks.length > 0 ? lastProcessedLandmarks : allLandmarks;
        }
      }
      if (allLandmarks.length > 0) {
        allLandmarks = gestureSizeNormalizer.normalizeHandSize(allLandmarks);
      }
      if (allLandmarks.length > 0) {
        const handedness = results?.handednesses?.map((h) => h.categoryName) || [];
        gestureReplayManager.addFrame(allLandmarks, handedness, 0);
      }
      if (allLandmarks.length > 0) {
        const stabilityAnalysis = handStabilityAssistant.analyzeStability(allLandmarks);
        if (frameCount % 15 === 0) {
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: "stability_feedback",
                isStable: stabilityAnalysis.isStable,
                stabilityScore: stabilityAnalysis.stabilityScore,
                feedback: stabilityAnalysis.feedback,
                guidePosition: stabilityAnalysis.guidePosition
              })
            );
          } catch (err2) {
            console.warn("Failed to send stability feedback:", err2);
          }
        }
      }
      let outGesture = null;
      let outScore = 0;
      const perHand = [];
      let multiHand = (results?.landmarks?.length ?? 0) >= 2;
      const handedArr = (results?.handednesses || []).map(
        (h) => h?.[0]?.categoryName || "unknown"
      );
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
          let left = perHand.find((h) => /left/i.test(h.hand)) || null;
          let right = perHand.find((h) => /right/i.test(h.hand)) || null;
          if (!left || !right) {
            const others = perHand.filter((h) => h !== left && h !== right);
            if (!left) left = others.shift() || null;
            if (!right) right = others.shift() || null;
          }
          if (left && right) {
            outGesture = { left: left.label, right: right.label };
            outScore = Math.sqrt(left.score * right.score);
          }
        }
      }
      if (window.__mlpPredict) {
        const mlpResult = window.__mlpPredict(
          allLandmarks,
          results?.handednesses ?? []
        );
        if (mlpResult) {
          if (!gestureReplayManager["currentRecording"]) {
            gestureReplayManager.startRecording(mlpResult.label, mlpResult.score);
          }
          const thresholdAdjustment = personalizedThresholdManager.getPersonalizedThreshold(
            mlpResult.label,
            currentConfig.thresholds.mlpConfidence
          );
          const effectiveThreshold = thresholdAdjustment.adjustedThreshold;
          if (mlpResult.score > effectiveThreshold) {
            outGesture = mlpResult.label;
            outScore = mlpResult.score;
            gestureReplayManager.stopRecording(true, mlpResult.score);
            const navigationTrigger = navigationGestureManager.checkNavigationTrigger(
              mlpResult.label,
              mlpResult.score,
              allLandmarks,
              { source: "mlp_prediction" }
            );
            if (navigationTrigger) {
              navigationGestureManager.processNavigationTrigger(navigationTrigger);
            }
            const undoSession = gestureUndoManager.checkUndoTrigger(
              mlpResult.label,
              mlpResult.score,
              { source: "mlp_prediction" }
            );
            if (undoSession) {
              try {
                window.ReactNativeWebView?.postMessage?.(
                  JSON.stringify({
                    type: "undo_session",
                    sessionId: undoSession.sessionId,
                    undoGesture: undoSession.undoGesture.gesture,
                    targetGesture: undoSession.targetGesture.gesture,
                    feedback: undoSession.undoGesture.feedback,
                    timestamp: undoSession.timestamp
                  })
                );
              } catch (error) {
                console.warn("Failed to send undo session:", error);
              }
            }
            visualCorrectionManager.recordGestureAttempt(mlpResult.label, mlpResult.score, mlpResult.score > 0.7);
            gestureUndoManager.recordGestureForUndo(
              mlpResult.label,
              mlpResult.score,
              allLandmarks,
              results?.handednesses?.map((h) => h.categoryName) || [],
              `gesture_${Date.now()}`
            );
            const isHighConfidence = mlpResult.score > 0.8;
            hapticFeedbackManager.onGestureRecognized(mlpResult.label, mlpResult.score, isHighConfidence);
          }
        }
      }
      if ((!outGesture || outScore < 0.5) && allLandmarks.length > 0) {
        const commonGestures = ["thumbs_up", "open_palm", "fist", "point"];
        for (const gestureId of commonGestures) {
          const partialAnalysis = partialGestureDetector.analyzePartialCompletion(allLandmarks, gestureId);
          if (partialAnalysis.isPartial && partialGestureDetector.shouldRecognizePartial(
            partialAnalysis.completion,
            partialAnalysis.confidence
          )) {
            if (partialAnalysis.confidence > outScore) {
              outGesture = gestureId;
              outScore = partialAnalysis.confidence;
              if (partialAnalysis.feedback) {
                const partialAttempt = {
                  gesture: gestureId,
                  effort: partialAnalysis.confidence,
                  success: false,
                  attemptCount: frameCount,
                  timeSinceLastAttempt: lastSentAt > 0 ? timestamp - lastSentAt : 0,
                  gestureType: "basic"
                };
                const detailedFeedback = feedbackSystem.generateFeedback(partialAttempt);
                try {
                  window.ReactNativeWebView?.postMessage?.(
                    JSON.stringify({
                      type: "partial_feedback",
                      gesture: gestureId,
                      completion: partialAnalysis.completion,
                      feedback: partialAnalysis.feedback,
                      // Enhanced feedback
                      primaryMessage: detailedFeedback.primaryMessage,
                      secondaryMessage: detailedFeedback.secondaryMessage,
                      encouragement: detailedFeedback.encouragement,
                      tip: detailedFeedback.tip,
                      showBreakSuggestion: detailedFeedback.showBreakSuggestion
                    })
                  );
                } catch (err2) {
                  console.warn("Failed to send partial feedback:", err2);
                }
              }
              break;
            }
          }
        }
      }
      if (frameCount % 30 === 0) {
        partialGestureDetector.cleanup();
      }
      if (shouldProcessEmergencyGesture(outGesture, outScore)) {
        sendEmergencyGesture(outGesture, outScore, allLandmarks, handedArr);
      }
      const batteryStatus = batteryMonitor.getStatus();
      if (batteryStatus.emergencyMode) {
        console.warn("\u{1F50B} EMERGENCY MODE ACTIVE: Prioritizing emergency gestures");
        if (!shouldProcessEmergencyGesture(outGesture, outScore)) {
          const emergencyFallback = emergencyGestureSystem.getStatus();
          if (emergencyFallback.emergencyModeRecommended) {
            console.warn("\u{1F6A8} EMERGENCY FALLBACK: Activating emergency-only processing");
          }
        }
      }
      const firstHand = allLandmarks[0] || [];
      if ((!outGesture || outScore < currentConfig.thresholds.fallbackConfidence) && firstHand.length === 21 && !multiHand) {
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
      let finalGesture = outGesture;
      let finalScore = outScore;
      let isUsingFallback = false;
      if (errorRecoveryManager.isInFallbackMode() || (!outGesture || outScore < currentConfig.thresholds.fallbackConfidence)) {
        try {
          const fallbackResult = fallbackGestureDetector.detectGesture(allLandmarks);
          if (errorRecoveryManager.isInFallbackMode() || fallbackResult.confidence > outScore && fallbackResult.gesture) {
            finalGesture = fallbackResult.gesture;
            finalScore = fallbackResult.confidence;
            isUsingFallback = true;
            if (fallbackResult.feedback) {
              const fallbackAttempt = {
                gesture: finalGesture,
                effort: finalScore,
                success: finalScore >= 0.6,
                // Lower threshold for fallback
                attemptCount: frameCount,
                timeSinceLastAttempt: lastSentAt > 0 ? timestamp - lastSentAt : 0,
                gestureType: "basic"
              };
              const detailedFeedback = feedbackSystem.generateFeedback(fallbackAttempt);
              try {
                window.ReactNativeWebView?.postMessage?.(
                  JSON.stringify({
                    type: "fallback_feedback",
                    gesture: finalGesture,
                    confidence: finalScore,
                    feedback: fallbackResult.feedback,
                    timestamp,
                    // Enhanced feedback
                    primaryMessage: detailedFeedback.primaryMessage,
                    secondaryMessage: detailedFeedback.secondaryMessage,
                    encouragement: detailedFeedback.encouragement,
                    tip: detailedFeedback.tip,
                    showBreakSuggestion: detailedFeedback.showBreakSuggestion
                  })
                );
              } catch (err2) {
                console.warn("Failed to send fallback feedback:", err2);
              }
            }
          }
        } catch (fallbackError) {
          console.warn("Fallback gesture detection failed:", fallbackError);
        }
      }
      if (finalGesture && typeof finalGesture === "string") {
        const emergencyResult = emergencyGestureSystem.processEmergencyGesture(
          finalGesture,
          finalScore,
          allLandmarks
        );
        if (emergencyResult.shouldProcess) {
          hapticFeedbackManager.onEmergencyGesture(finalGesture);
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: "emergency_gesture_detected",
                gesture: finalGesture,
                confidence: finalScore,
                feedback: emergencyResult.feedback,
                priority: emergencyResult.priority,
                timestamp,
                systemStatus: errorRecoveryManager.getHealthStatus()
              })
            );
          } catch (err2) {
            console.error("Failed to send emergency gesture message:", err2);
          }
          lastSentGestureSerialized = "";
          lastSentScore = 0;
        }
        if (emergencyGestureSystem.shouldEnterEmergencyMode() && !errorRecoveryManager.isInEmergencyMode()) {
          errorRecoveryManager.activateEmergencyMode();
        }
      }
      let contextInsights = null;
      if (finalGesture && typeof finalGesture === "string") {
        const gestureDuration = void 0;
        contextInsights = enhancedContextRecognizer.analyzeContext(finalGesture, finalScore, gestureDuration);
        finalScore = contextInsights.adjustedConfidence;
        const adaptiveContext = {
          timeOfDay: contextInsights.timeOfDay,
          activity: contextInsights.activityLevel,
          gesture: finalGesture,
          confidence: finalScore
        };
        currentConfig = getAdaptiveConfig(currentConfig, adaptiveContext);
      }
      if (!finalGesture || finalScore < 0.3) {
        if (allLandmarks.length > 0) {
          const attemptedGesture = fallbackGestureDetector.detectGesture(allLandmarks);
          if (attemptedGesture.gesture) {
            personalizedThresholdManager.recordAttempt(attemptedGesture.gesture, attemptedGesture.confidence, false);
          }
        }
      }
      let enhancedFeedback = null;
      if (finalGesture && typeof finalGesture === "string") {
        const timeOfDay = contextInsights?.timeOfDay || "afternoon";
        const recentAttempts = feedbackHistory.slice(-10);
        const recentSuccessRate = recentAttempts.length > 0 ? recentAttempts.filter((r) => r.success).length / recentAttempts.length : 0.5;
        const attemptResult = {
          success: finalScore >= 0.7,
          // Consider it a success if confidence is good
          gesture: finalGesture,
          effort: finalScore,
          attemptCount: frameCount,
          timeOfDay,
          recentSuccessRate,
          isEmergency: emergencyGestureSystem.isEmergencyGesture(finalGesture, finalScore),
          partialSuccess: finalScore >= 0.4 && finalScore < 0.7,
          // Add context awareness
          contextBonus: contextInsights?.contextBonus || 0,
          patternMatch: contextInsights?.patternMatch || false
        };
        const celebration = celebrationSystem.generateCelebration(attemptResult);
        const feedbackAttempt = {
          gesture: finalGesture,
          effort: finalScore,
          success: finalScore >= 0.7,
          attemptCount: frameCount,
          timeSinceLastAttempt: lastSentAt > 0 ? timestamp - lastSentAt : 0,
          gestureType: attemptResult.isEmergency ? "emergency" : "basic"
        };
        const detailedFeedback = feedbackSystem.generateFeedback(feedbackAttempt);
        enhancedFeedback = {
          celebration,
          detailedFeedback,
          attemptResult
        };
      }
      let combinationResult = null;
      if (finalGesture && typeof finalGesture === "string" && finalScore >= 0.6) {
        gestureCombinationManager.recordGesture(finalGesture, finalScore);
        combinationResult = gestureCombinationManager.checkForCombinations();
        if (combinationResult) {
          hapticFeedbackManager.onCombinationEvent("complete", combinationResult.combination);
        }
      }
      let correctionSession = null;
      if (finalGesture && typeof finalGesture === "string" && finalScore < 0.7 && finalScore > 0.3) {
        const alternatives = [
          { gesture: "thumbs_up", confidence: 0.6 },
          { gesture: "open_palm", confidence: 0.5 },
          { gesture: "fist", confidence: 0.5 },
          { gesture: "point", confidence: 0.4 }
        ];
        correctionSession = visualCorrectionManager.generateCorrectionOptions(
          finalGesture,
          finalScore,
          alternatives
        );
        if (correctionSession) {
          visualCorrectionManager.sendCorrectionOptionsToReactNative(correctionSession);
        }
      }
      const serialized = serializeGesture(finalGesture);
      const scoreChanged = Math.abs(finalScore - lastSentScore) >= 0.05;
      const gestureChanged = serialized !== lastSentGestureSerialized;
      const shouldSend = (gestureChanged || scoreChanged) && (finalScore >= 0.3 || finalGesture) && !errorRecoveryManager.isCircuitBreakerOpen();
      if (shouldSend) {
        if (finalGesture && typeof finalGesture === "string" && finalScore >= 0.5) {
          adaptivePracticeManager.recordGestureInSession();
        }
        if (finalGesture && typeof finalGesture === "string" && finalScore >= 0.7 && contextInsights) {
          positiveTelemetryManager.recordCommunicationMoment(
            finalGesture,
            finalScore,
            {
              timeOfDay: contextInsights.timeOfDay,
              activityLevel: contextInsights.activityLevel,
              dayOfWeek: (/* @__PURE__ */ new Date()).getDay()
            }
          );
        }
        lastSentGestureSerialized = serialized;
        lastSentScore = finalScore;
        lastSentAt = performance.now();
        try {
          if (finalGesture && typeof finalGesture === "string") {
            const success = finalScore >= 0.7;
            personalizedThresholdManager.recordAttempt(finalGesture, finalScore, success);
          }
          if (enhancedFeedback) {
            feedbackHistory.push({
              gesture: finalGesture,
              confidence: finalScore,
              success: finalScore >= 0.7,
              timestamp,
              effort: finalScore
            });
            if (feedbackHistory.length > 20) {
              feedbackHistory.shift();
            }
          }
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "gesture",
              gesture: finalGesture,
              confidence: finalScore,
              landmarks: allLandmarks,
              handednesses: handedArr,
              timestamp,
              isFallback: isUsingFallback,
              systemHealth: errorRecoveryManager.getHealthStatus(),
              // Enhanced context-aware recognition data
              contextAwareness: contextInsights ? {
                timeOfDay: contextInsights.timeOfDay,
                activityLevel: contextInsights.activityLevel,
                contextBonus: contextInsights.contextBonus,
                patternMatch: contextInsights.patternMatch,
                recentFrequency: contextInsights.recentFrequency,
                habitStrength: contextInsights.habitStrength,
                adjustedConfidence: contextInsights.adjustedConfidence,
                stressIndicators: contextInsights.stressIndicators,
                recommendations: contextInsights.recommendations
              } : null,
              // Enhanced feedback for 22q11 accessibility
              enhancedFeedback: enhancedFeedback ? {
                message: enhancedFeedback.celebration.message,
                emoji: enhancedFeedback.celebration.emoji,
                encouragement: enhancedFeedback.celebration.encouragement,
                showProgress: enhancedFeedback.celebration.showProgress,
                primaryFeedback: enhancedFeedback.detailedFeedback.primaryMessage,
                secondaryFeedback: enhancedFeedback.detailedFeedback.secondaryFeedback,
                tip: enhancedFeedback.detailedFeedback.tip,
                showBreakSuggestion: enhancedFeedback.detailedFeedback.showBreakSuggestion
              } : null,
              // Personalized threshold data for Amy's learning insights
              personalizedThresholds: finalGesture && typeof finalGesture === "string" ? {
                currentAdjustment: personalizedThresholdManager.getPersonalizedThreshold(
                  finalGesture,
                  currentConfig.thresholds.mlpConfidence
                ),
                performanceInsights: personalizedThresholdManager.getPerformanceInsights()
              } : null,
              // Gesture combination results for complex communication
              gestureCombination: combinationResult,
              // Adaptive practice timing data
              practiceTiming: {
                isCommunicationActive: adaptivePracticeManager.isCommunicationActive(),
                practiceSuggestion: contextInsights ? adaptivePracticeManager.shouldSuggestPractice(
                  contextInsights.timeOfDay,
                  contextInsights.activityLevel,
                  0
                  // Will be calculated based on actual timing
                ) : null
              },
              // Positive telemetry insights
              positiveInsights: finalGesture && finalScore >= 0.7 ? positiveTelemetryManager.getPositiveInsights() : null
            })
          );
        } catch (err2) {
          console.warn("Failed to send gesture message:", err2);
          errorRecoveryManager.recordFailure(err2, "gesture_message_send");
        }
      }
      if (!finalGesture || finalScore < 0.5) {
        navigationGestureManager.resetHoldTimers();
        gestureUndoManager.resetHoldTimers();
      }
      if (combinationResult) {
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "gesture_combination",
              combination: combinationResult.combination,
              confidence: combinationResult.confidence,
              sequence: combinationResult.sequence,
              description: combinationResult.description,
              timeSpan: combinationResult.timeSpan,
              feedback: combinationResult.feedback,
              timestamp,
              systemHealth: errorRecoveryManager.getHealthStatus()
            })
          );
        } catch (err2) {
          console.warn("Failed to send gesture combination message:", err2);
          errorRecoveryManager.recordFailure(err2, "combination_message_send");
        }
      }
      try {
        const ctx = overlay.getContext("2d");
        if (ctx && overlayWidth && overlayHeight) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          ctx.save();
          ctx.scale(overlayDpr, overlayDpr);
          if (mirrorOverlay) {
            ctx.scale(-1, 1);
            ctx.translate(-overlayWidth, 0);
          }
          const stabilityStatus = handStabilityAssistant.getStabilityStatus();
          if (!stabilityStatus.isStable && stabilityStatus.score < 0.7) {
            const centerX = overlayWidth / 2;
            const centerY = overlayHeight / 2;
            const radius = Math.min(overlayWidth, overlayHeight) * 0.15;
            ctx.strokeStyle = stabilityStatus.score > 0.3 ? "rgba(255, 165, 0, 0.8)" : "rgba(255, 0, 0, 0.8)";
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(centerX - radius * 0.7, centerY);
            ctx.lineTo(centerX + radius * 0.7, centerY);
            ctx.moveTo(centerX, centerY - radius * 0.7);
            ctx.lineTo(centerX, centerY + radius * 0.7);
            ctx.stroke();
          }
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0, 255, 180, 0.9)";
          ctx.fillStyle = "rgba(0, 255, 180, 0.9)";
          for (const hand of allLandmarks) {
            if (!hand || hand.length === 0) continue;
            ctx.beginPath();
            let hasMoves = false;
            for (const [a, b] of HAND_CONNECTIONS) {
              const pa = hand[a];
              const pb = hand[b];
              if (!pa || !pb) continue;
              const x1 = pa[0] * overlayWidth;
              const y1 = pa[1] * overlayHeight;
              const x2 = pb[0] * overlayWidth;
              const y2 = pb[1] * overlayHeight;
              if (!hasMoves) {
                ctx.moveTo(x1, y1);
                hasMoves = true;
              } else {
                ctx.moveTo(x1, y1);
              }
              ctx.lineTo(x2, y2);
            }
            if (hasMoves) {
              ctx.stroke();
            }
            for (const lm of hand) {
              if (!lm || lm.length < 2) continue;
              ctx.beginPath();
              ctx.arc(
                lm[0] * overlayWidth,
                lm[1] * overlayHeight,
                4,
                0,
                Math.PI * 2
              );
              ctx.fill();
            }
          }
        }
      } catch (err2) {
        console.warn("Failed to draw overlay:", err2);
      }
    } catch (processingError) {
      console.error("Gesture processing failed:", processingError);
      const error = processingError;
      const errorInfo = errorRecoveryManager.getErrorInfo(error, "gesture_processing");
      const shouldRetry = errorRecoveryManager.recordFailure(error, "gesture_processing");
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "gesture_processing_error",
            message: errorInfo.userMessage,
            code: errorInfo.code,
            recoverable: errorInfo.recoverable,
            severity: errorInfo.severity,
            suggestedAction: errorInfo.suggestedAction,
            systemHealth: errorRecoveryManager.getHealthStatus(),
            timestamp
          })
        );
      } catch (msgError) {
        console.error("Failed to send error message to React Native:", msgError);
      }
      if (errorInfo.severity === "critical") {
        errorRecoveryManager.activateEmergencyMode();
      } else if (errorInfo.recoverable && shouldRetry) {
        errorRecoveryManager.activateFallbackMode();
      }
      if (results?.landmarks && errorRecoveryManager.canAttemptRecovery("gesture_processing")) {
        try {
          const fallbackResult = fallbackGestureDetector.detectGesture(
            results.landmarks.map(
              (hand) => hand.map((lm) => [lm.x, lm.y, lm.z ?? 0])
            )
          );
          if (fallbackResult.gesture && fallbackResult.confidence > 0.2) {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: "gesture",
                gesture: fallbackResult.gesture,
                confidence: fallbackResult.confidence,
                isFallback: true,
                errorRecovery: true,
                timestamp,
                systemHealth: errorRecoveryManager.getHealthStatus()
              })
            );
            errorRecoveryManager.recordSuccessfulRecovery("gesture_processing");
          }
        } catch (fallbackError) {
          console.warn("Fallback detection also failed:", fallbackError);
        }
      }
      if (errorRecoveryManager.isInEmergencyMode()) {
        console.warn("System in emergency mode - prioritizing critical gesture detection");
      }
    }
  }
  function resizeOverlay() {
    try {
      const rect = video.getBoundingClientRect();
      const w = (rect.width || video.clientWidth || 0) | 0;
      const h = (rect.height || video.clientHeight || 0) | 0;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const sizeChanged = overlayWidth !== w || overlayHeight !== h;
      const dprChanged = dpr !== overlayDpr;
      if (sizeChanged || dprChanged) {
        if (sizeChanged) {
          overlay.style.width = w + "px";
          overlay.style.height = h + "px";
        }
        overlay.width = Math.round(w * dpr);
        overlay.height = Math.round(h * dpr);
        overlayWidth = w;
        overlayHeight = h;
        overlayDpr = dpr;
      }
      lastVideoWidth = video.videoWidth;
      lastVideoHeight = video.videoHeight;
    } catch (err2) {
      console.warn("Failed to resize overlay:", err2);
    }
  }
  async function startCamera() {
    resetGestureChangeState();
    tremorCompensator.clearHistory();
    lastProcessedLandmarks = [];
    try {
      if (mainGestureDetector) {
        await mainGestureDetector.start();
      } else {
        throw new Error("Gesture detector not initialized");
      }
    } catch (err2) {
      const error = err2;
      const errorInfo = errorRecoveryManager.getErrorInfo(error, "camera_initialization");
      errorRecoveryManager.recordFailure(error);
      const msg = `${error.name}: ${error.message}`;
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "error",
            message: cameraError + msg,
            code: errorInfo.code,
            recoverable: errorInfo.recoverable
          })
        );
      } catch (postErr) {
        console.warn("Failed to send camera error:", postErr);
      }
      throw err2;
    }
  }
  if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
    startCamera().then(() => {
      document.getElementById("tapToStart")?.classList.add("hidden");
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: "telemetry", event: "tap_start_autostart" })
        );
      } catch (err2) {
        console.warn("Failed to send 'tap_start_autostart' telemetry event:", err2);
      }
    }).catch((err2) => {
      console.warn("Camera autostart failed:", err2);
      document.getElementById("tapToStart")?.classList.remove("hidden");
    });
  }
  createGestureRecognizer();
  var stopPromise = null;
  async function stopCamera() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      try {
        if (mainGestureDetector) {
          await mainGestureDetector.stop();
        }
      } catch (e) {
        console.warn("Failed to stop gesture detector:", e);
      }
    })().finally(() => {
      stopPromise = null;
    });
    return stopPromise;
  }
  var onPageHide = () => void cleanup();
  var onBeforeUnload = () => void cleanup();
  var onVisibilityChange = () => {
    if (document.hidden) {
      running = false;
    } else {
      running = true;
      lastFrameTs = 0;
      resetGestureChangeState();
      try {
        resizeOverlay();
      } catch (e) {
        console.warn("Resize on visibility change failed:", e);
      }
    }
  };
  resourceManager.registerEventListener(window, "pagehide", onPageHide);
  resourceManager.registerEventListener(window, "beforeunload", onBeforeUnload);
  resourceManager.registerEventListener(document, "visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);
  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    running = false;
    await stopCamera();
    try {
      const tapEl = document.getElementById("tapToStart");
      if (tapEl) {
        tapEl.remove();
      }
    } catch (e) {
      console.warn("Failed to remove 'tapToStart' element:", e);
    }
    try {
      overlay.remove();
    } catch (e) {
      console.warn("Failed to remove 'overlay' element:", e);
    }
    try {
      video.remove();
    } catch (e) {
      console.warn("Failed to remove 'video' element:", e);
    }
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: "telemetry", event: "cleanup_done" })
      );
    } catch (e) {
      console.warn("Failed to send 'cleanup_done' telemetry event:", e);
    }
  }
  window.__getPersonalizedThresholdInsights = () => {
    try {
      const insights = personalizedThresholdManager.getPerformanceInsights();
      const allThresholds = personalizedThresholdManager.getAllPersonalizedThresholds(0.4);
      return {
        performanceInsights: insights,
        personalizedThresholds: allThresholds,
        exportData: personalizedThresholdManager.exportPerformanceData()
      };
    } catch (error) {
      console.warn("Failed to get personalized threshold insights:", error);
      return null;
    }
  };
  window.__getGestureCombinations = () => {
    try {
      return gestureCombinationManager.getAllCombinations();
    } catch (error) {
      console.warn("Failed to get gesture combinations:", error);
      return [];
    }
  };
  window.__addCustomGestureCombination = (combination) => {
    try {
      gestureCombinationManager.addCustomCombination(combination);
      return true;
    } catch (error) {
      console.warn("Failed to add custom gesture combination:", error);
      return false;
    }
  };
  window.__removeGestureCombination = (combinationName) => {
    try {
      gestureCombinationManager.removeCustomCombination(combinationName);
      return true;
    } catch (error) {
      console.warn("Failed to remove gesture combination:", error);
      return false;
    }
  };
  window.__getCombinationProgress = () => {
    try {
      return gestureCombinationManager.getCombinationProgress();
    } catch (error) {
      console.warn("Failed to get combination progress:", error);
      return null;
    }
  };
  window.__updateHapticPreferences = (preferences) => {
    try {
      hapticFeedbackManager.updatePreferences(preferences);
      return true;
    } catch (error) {
      console.warn("Failed to update haptic preferences:", error);
      return false;
    }
  };
  window.__getHapticPreferences = () => {
    try {
      return hapticFeedbackManager.getPreferences();
    } catch (error) {
      console.warn("Failed to get haptic preferences:", error);
      return null;
    }
  };
  window.__getHapticStats = () => {
    try {
      return hapticFeedbackManager.getHapticStats();
    } catch (error) {
      console.warn("Failed to get haptic stats:", error);
      return null;
    }
  };
  window.__startGestureReplay = (recordingId, options) => {
    try {
      return gestureReplayManager.startReplay(recordingId, options);
    } catch (error) {
      console.warn("Failed to start gesture replay:", error);
      return false;
    }
  };
  window.__stopGestureReplay = () => {
    try {
      gestureReplayManager.stopReplay();
      return true;
    } catch (error) {
      console.warn("Failed to stop gesture replay:", error);
      return false;
    }
  };
  window.__pauseGestureReplay = () => {
    try {
      gestureReplayManager.pauseReplay();
      return true;
    } catch (error) {
      console.warn("Failed to pause gesture replay:", error);
      return false;
    }
  };
  window.__getAvailableReplays = () => {
    try {
      return gestureReplayManager.getAvailableRecordings();
    } catch (error) {
      console.warn("Failed to get available replays:", error);
      return [];
    }
  };
  window.__getReplayStats = () => {
    try {
      return gestureReplayManager.getReplayStats();
    } catch (error) {
      console.warn("Failed to get replay stats:", error);
      return null;
    }
  };
  window.__deleteGestureReplay = (recordingId) => {
    try {
      return gestureReplayManager.deleteRecording(recordingId);
    } catch (error) {
      console.warn("Failed to delete gesture replay:", error);
      return false;
    }
  };
  window.__getNavigationGestures = () => {
    try {
      return navigationGestureManager.getAvailableNavigationGestures();
    } catch (error) {
      console.warn("Failed to get navigation gestures:", error);
      return [];
    }
  };
  window.__addNavigationGesture = (gesture) => {
    try {
      navigationGestureManager.addCustomNavigationGesture(gesture);
      return true;
    } catch (error) {
      console.warn("Failed to add navigation gesture:", error);
      return false;
    }
  };
  window.__removeNavigationGesture = (gestureName) => {
    try {
      return navigationGestureManager.removeNavigationGesture(gestureName);
    } catch (error) {
      console.warn("Failed to remove navigation gesture:", error);
      return false;
    }
  };
  window.__updateNavigationGesture = (gestureName, updates) => {
    try {
      return navigationGestureManager.updateNavigationGesture(gestureName, updates);
    } catch (error) {
      console.warn("Failed to update navigation gesture:", error);
      return false;
    }
  };
  window.__getNavigationStats = () => {
    try {
      return navigationGestureManager.getNavigationStats();
    } catch (error) {
      console.warn("Failed to get navigation stats:", error);
      return null;
    }
  };
  window.__getNavigationHoldProgress = (gestureName) => {
    try {
      return navigationGestureManager.getHoldProgress(gestureName);
    } catch (error) {
      console.warn("Failed to get navigation hold progress:", error);
      return 0;
    }
  };
  window.__selectVisualCorrection = (sessionId, selectedGesture) => {
    try {
      return visualCorrectionManager.selectCorrection(sessionId, selectedGesture);
    } catch (error) {
      console.warn("Failed to select visual correction:", error);
      return false;
    }
  };
  window.__cancelVisualCorrection = (sessionId) => {
    try {
      return visualCorrectionManager.cancelCorrection(sessionId);
    } catch (error) {
      console.warn("Failed to cancel visual correction:", error);
      return false;
    }
  };
  window.__getCurrentCorrectionSession = () => {
    try {
      return visualCorrectionManager.getCurrentCorrectionSession();
    } catch (error) {
      console.warn("Failed to get current correction session:", error);
      return null;
    }
  };
  window.__addCustomVisual = (gesture, emoji, description) => {
    try {
      visualCorrectionManager.addCustomVisual(gesture, emoji, description);
      return true;
    } catch (error) {
      console.warn("Failed to add custom visual:", error);
      return false;
    }
  };
  window.__getCorrectionStats = () => {
    try {
      return visualCorrectionManager.getCorrectionStats();
    } catch (error) {
      console.warn("Failed to get correction stats:", error);
      return null;
    }
  };
  window.__confirmGestureUndo = (sessionId) => {
    try {
      return gestureUndoManager.confirmUndo(sessionId);
    } catch (error) {
      console.warn("Failed to confirm gesture undo:", error);
      return false;
    }
  };
  window.__cancelGestureUndo = (sessionId) => {
    try {
      return gestureUndoManager.cancelUndo(sessionId);
    } catch (error) {
      console.warn("Failed to cancel gesture undo:", error);
      return false;
    }
  };
  window.__getCurrentUndoSession = () => {
    try {
      return gestureUndoManager.getCurrentUndoSession();
    } catch (error) {
      console.warn("Failed to get current undo session:", error);
      return null;
    }
  };
  window.__getUndoableGestures = () => {
    try {
      return gestureUndoManager.getUndoableGestures();
    } catch (error) {
      console.warn("Failed to get undoable gestures:", error);
      return [];
    }
  };
  window.__addCustomUndoGesture = (gesture) => {
    try {
      gestureUndoManager.addCustomUndoGesture(gesture);
      return true;
    } catch (error) {
      console.warn("Failed to add custom undo gesture:", error);
      return false;
    }
  };
  window.__getUndoStats = () => {
    try {
      return gestureUndoManager.getUndoStats();
    } catch (error) {
      console.warn("Failed to get undo stats:", error);
      return null;
    }
  };
  window.__getUndoHoldProgress = (gestureName) => {
    try {
      return gestureUndoManager.getUndoHoldProgress(gestureName);
    } catch (error) {
      console.warn("Failed to get undo hold progress:", error);
      return 0;
    }
  };
  window.__cleanupGestureDetector = cleanup;
})();
