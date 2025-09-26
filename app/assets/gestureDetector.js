/**
 * Generated from app/webview/gestureDetector.ts
 * Run scripts/update-webview-base64.js after modifying gestureDetector.ts.
 */
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
      if (!descr) {
        throw new Error("npy header missing descriptor");
      }
      const endian = descr[0];
      if (endian !== "<" && endian !== "|") {
        throw new Error("big-endian dtype not supported");
      }
      const fortran = fortranMatch[1] === "True";
      const shapeCaptured = shapeMatch[1];
      if (!shapeCaptured) {
        throw new Error("npy header missing shape");
      }
      const shapeStr = shapeCaptured.trim();
      let shape = shapeStr.length ? shapeStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)) : [1];
      const offset = headerStart + headerLen;
      const type = descr.slice(1);
      const size = shape.reduce((a, b) => a * b, 1);
      let data;
      if (type === "f8") {
        data = new Float32Array(new Float64Array(buf.buffer, buf.byteOffset + offset, size));
      } else if (type === "f4") {
        data = new Float32Array(buf.buffer, buf.byteOffset + offset, size);
      } else if (type === "f2") {
        const src = new Uint16Array(buf.buffer, buf.byteOffset + offset, size);
        data = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          const value = src[i] ?? 0;
          data[i] = f16ToF32(value);
        }
      } else if (type === "i4") {
        const src = new Int32Array(buf.buffer, buf.byteOffset + offset, size);
        data = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          data[i] = src[i] ?? 0;
        }
      } else if (type === "i2") {
        const src = new Int16Array(buf.buffer, buf.byteOffset + offset, size);
        data = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          data[i] = src[i] ?? 0;
        }
      } else if (type === "u1") {
        const src = new Uint8Array(buf.buffer, buf.byteOffset + offset, size);
        data = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          data[i] = src[i] ?? 0;
        }
      } else if (type.startsWith("U")) {
        const itemSize = parseInt(type.slice(1), 10);
        const raw = new Uint32Array(buf.buffer, buf.byteOffset + offset, size * itemSize);
        const out = [];
        for (let i = 0; i < size; i++) {
          const start = i * itemSize;
          let s = "";
          for (let j = 0; j < itemSize; j++) {
            const code = raw[start + j];
            if (!code) break;
            s += String.fromCodePoint(code);
          }
          out.push(s);
        }
        return { data: out, shape };
      } else {
        throw new Error("dtype " + type);
      }
      if (fortran && shape.length === 2) {
        const rows = shape[0];
        const cols = shape[1];
        if (rows === void 0 || cols === void 0) {
          throw new Error("Invalid shape for Fortran array");
        }
        const newData = new Float32Array(size);
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const value = data[i * cols + j] ?? 0;
            newData[j * rows + i] = value;
          }
        }
        data = newData;
        shape = [cols, rows];
      }
      return { data, shape };
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
        const computedBits = s | 2139095040 | f << 13;
        const view2 = new Float32Array(new Uint32Array([computedBits]).buffer);
        return view2[0] ?? 0;
      }
      e = e + (127 - 15);
      const bits2 = s | e << 23 | f << 13;
      const view = new Float32Array(new Uint32Array([bits2]).buffer);
      return view[0] ?? 0;
    }
    async function loadMlpFromB64(b64) {
      try {
        let npzFind2 = function(m, prefix) {
          const k = Object.keys(m).find((n) => n === prefix || n === prefix + ".npy");
          return k ? m[k] : void 0;
        };
        var npzFind = npzFind2;
        if (!b64 || typeof b64 !== "string" || b64.length === 0) {
          throw new Error("Invalid base64 data: empty or not a string");
        }
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
          throw new Error("Invalid base64 format: contains invalid characters");
        }
        let bin;
        try {
          bin = atob(b64);
        } catch (e) {
          throw new Error("Failed to decode base64: " + (e instanceof Error ? e.message : String(e)));
        }
        if (bin.length === 0) {
          throw new Error("Decoded base64 is empty");
        }
        const u82 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u82[i] = bin.charCodeAt(i);
        const unzip2 = window.fflate?.unzip;
        if (!unzip2) throw new Error("fflate unavailable");
        const files = await new Promise((resolve, reject) => {
          unzip2(u82, (err2, data) => {
            if (err2) {
              if (err2.code === 20) {
                reject(new Error("Invalid zip data: corrupted or incomplete file"));
              } else if (err2.code === 13) {
                reject(new Error("Invalid zip data: not a valid zip archive"));
              } else {
                reject(new Error("Zip extraction failed: " + (err2.message || String(err2))));
              }
            } else resolve(data);
          });
        });
        const entries = Object.keys(files);
        if (entries.length > 32) throw new Error("too many entries");
        const map = {};
        for (const name of entries) {
          const file = files[name];
          if (file) {
            map[name.replace(/.*\//, "")] = file;
          }
        }
        const w1b = npzFind2(map, "w1");
        const b1b = npzFind2(map, "b1");
        const w2b = npzFind2(map, "w2");
        const b2b = npzFind2(map, "b2");
        if (!w1b || !b1b || !w2b || !b2b) throw new Error("missing weights");
        let w1, b1, w2, b22, labels = [];
        try {
          w1 = parseNPY(w1b);
          if (!w1.data || w1.shape.length !== 2) {
            throw new Error("Invalid w1 tensor: expected 2D array");
          }
        } catch (e) {
          throw new Error("Failed to parse w1 weights: " + (e instanceof Error ? e.message : String(e)));
        }
        try {
          b1 = parseNPY(b1b);
          if (!b1.data || b1.shape.length !== 1) {
            throw new Error("Invalid b1 tensor: expected 1D array");
          }
        } catch (e) {
          throw new Error("Failed to parse b1 biases: " + (e instanceof Error ? e.message : String(e)));
        }
        try {
          w2 = parseNPY(w2b);
          if (!w2.data || w2.shape.length !== 2) {
            throw new Error("Invalid w2 tensor: expected 2D array");
          }
        } catch (e) {
          throw new Error("Failed to parse w2 weights: " + (e instanceof Error ? e.message : String(e)));
        }
        try {
          b22 = parseNPY(b2b);
          if (!b22.data || b22.shape.length !== 1) {
            throw new Error("Invalid b2 tensor: expected 1D array");
          }
        } catch (e) {
          throw new Error("Failed to parse b2 biases: " + (e instanceof Error ? e.message : String(e)));
        }
        const lb = npzFind2(map, "labels");
        if (lb) {
          try {
            const parsed = parseNPY(lb);
            if (parsed.data && Array.isArray(parsed.data)) {
              labels = parsed.data;
            } else {
              console.warn("Labels data is not an array, using empty labels");
              labels = [];
            }
          } catch (e) {
            console.warn("Failed to parse labels, using empty labels:", e);
            labels = [];
          }
        }
        const inputSize = w1.shape[1];
        const hiddenSize = w1.shape[0];
        const outputSize = w2.shape[0];
        if (b1.shape[0] !== hiddenSize) {
          throw new Error(`Dimension mismatch: b1 has ${b1.shape[0]} elements but expected ${hiddenSize}`);
        }
        if (w2.shape[1] !== hiddenSize) {
          throw new Error(`Dimension mismatch: w2 input size ${w2.shape[1]} doesn't match hidden size ${hiddenSize}`);
        }
        if (b22.shape[0] !== outputSize) {
          throw new Error(`Dimension mismatch: b2 has ${b22.shape[0]} elements but expected ${outputSize}`);
        }
        console.log(`MLP model loaded successfully: ${inputSize} -> ${hiddenSize} -> ${outputSize} with ${labels.length} labels`);
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
      for (let i = 0; i < x.length; i++) {
        const value = x[i] ?? 0;
        if (value < 0) {
          x[i] = 0;
        }
      }
      return x;
    }
    function softmax(x) {
      let max2 = -Infinity;
      for (let i = 0; i < x.length; i++) {
        const value = x[i] ?? -Infinity;
        if (value > max2) max2 = value;
      }
      let s = 0;
      for (let i = 0; i < x.length; i++) {
        const value = x[i] ?? 0;
        const expValue = Math.exp(value - max2);
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
    function affineMV(mat, rows, cols, vec, bias) {
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
    const EMPTY_HAND = new Array(21).fill(0).map(() => [0, 0, 0]);
    function normalizeLandmarks(all, handednesses) {
      const flat = new Float32Array(21 * 2 * 3);
      function normHand(hand) {
        if (!hand || hand.length < 21) return null;
        const wrist = hand[0];
        if (!wrist) {
          return null;
        }
        const [wx = 0, wy = 0, wz = 0] = wrist;
        const centered = hand.map(
          (p) => {
            const [x = 0, y = 0, z = 0] = p ?? [0, 0, 0];
            return [x - wx, y - wy, z - wz];
          }
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
      const leftHand = leftHandIndex > -1 ? all[leftHandIndex] ?? null : null;
      const rightHand = rightHandIndex > -1 ? all[rightHandIndex] ?? null : null;
      const left = normHand(leftHand) ?? EMPTY_HAND;
      const right = normHand(rightHand) ?? EMPTY_HAND;
      const both = [...left, ...right];
      let k = 0;
      for (const p of both) {
        const [px = 0, py = 0, pz = 0] = p ?? [0, 0, 0];
        flat[k++] = px;
        flat[k++] = py;
        flat[k++] = pz;
      }
      return flat;
    }
    function mlpPredict(all, handednesses) {
      try {
        if (!mlp) return null;
        const x = normalizeLandmarks(all, handednesses);
        if (!x) return null;
        if (x.every((v) => v === 0)) return null;
        const cols1 = x.length;
        const [rows1Raw, cols1Expected] = mlp.w1.shape;
        const rows1 = rows1Raw ?? 0;
        if (cols1Expected === void 0 || rows1 === 0) {
          throw new Error("Invalid w1 shape");
        }
        if (cols1Expected !== cols1) throw new Error("Input dimension mismatch");
        const b1Shape = mlp.b1.shape[0];
        if (b1Shape === void 0 || b1Shape !== rows1) throw new Error("b1 dimension mismatch");
        const z1 = affineMV(mlp.w1.data, rows1, cols1, x, mlp.b1.data);
        const a1 = relu(z1);
        const [rows2Raw, cols2] = mlp.w2.shape;
        const rows2 = rows2Raw ?? 0;
        if (cols2 === void 0 || rows2 === 0) {
          throw new Error("Invalid w2 shape");
        }
        if (cols2 !== a1.length) throw new Error("Hidden layer size mismatch");
        const b2Shape = mlp.b2.shape[0];
        if (b2Shape === void 0 || b2Shape !== rows2) throw new Error("b2 dimension mismatch");
        const z2 = affineMV(mlp.w2.data, rows2, cols2, a1, mlp.b2.data);
        const probs = softmax(z2);
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
          console.warn(`Script load timeout after ${timeoutMs}ms: ${src}`);
          reject(new Error(`Script load timeout after ${timeoutMs}ms: ${src}`));
        }, timeoutMs);
        s.onload = () => {
          clearTimeout(to);
          cleanup2();
          console.log(`Script loaded successfully: ${src}`);
          resolve(null);
        };
        s.onerror = (event) => {
          clearTimeout(to);
          cleanup2();
          console.error(`Script failed to load: ${src}`, event);
          reject(new Error(`Script failed to load: ${src}`));
        };
        document.head.appendChild(s);
      });
    }
    const haveUMD = () => window.fileset_resolver && window.fileset_resolver.FilesetResolver && window.vision && window.vision.GestureRecognizer;
    const pinned = await resolvePinnedBase();
    const candidates = [];
    if (pinned) {
      candidates.push({
        umd: pinned.base + "/@mediapipe/tasks-vision@" + pinned.version + "/vision_bundle.cjs",
        esm: pinned.base + "/@mediapipe/tasks-vision@" + pinned.version + "/vision_bundle.mjs",
        wasm: pinned.base + "/@mediapipe/tasks-vision@" + pinned.version + "/wasm"
      });
    }
    candidates.push({
      umd: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.cjs",
      esm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs",
      wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    });
    candidates.push({
      umd: "https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.cjs",
      esm: "https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs",
      wasm: "https://unpkg.com/@mediapipe/tasks-vision/wasm"
    });
    let lastError = null;
    let attemptCount = 0;
    for (const c of candidates) {
      attemptCount++;
      try {
        console.log(`Attempting to load MediaPipe from ${c.esm} (attempt ${attemptCount}/${candidates.length})`);
        try {
          const mod = await import(
            /* @vite-ignore */
            c.esm
          );
          if (mod?.FilesetResolver && mod?.GestureRecognizer) {
            console.log("Successfully loaded MediaPipe via ESM");
            return {
              FilesetResolver: mod.FilesetResolver,
              GestureRecognizer: mod.GestureRecognizer,
              wasmBase: c.wasm
            };
          }
        } catch (e) {
          console.warn(`ESM import failed for ${c.esm}:`, e);
          lastError = e;
        }
        console.log(`Attempting to load MediaPipe from ${c.umd} (attempt ${attemptCount}/${candidates.length})`);
        if (!haveUMD()) {
          const sri = pinned && c.umd.includes(`@${pinned.version}/`) ? window.__visionBundleSri : void 0;
          await tryLoadScript(c.umd, sri);
        }
        if (haveUMD()) {
          console.log("Successfully loaded MediaPipe via UMD");
          return {
            FilesetResolver: window.fileset_resolver.FilesetResolver,
            GestureRecognizer: window.vision.GestureRecognizer,
            wasmBase: c.wasm
          };
        }
      } catch (e) {
        console.warn(`MediaPipe load attempt ${attemptCount} failed:`, e);
        lastError = e;
      }
    }
    const errorDetails = {
      attempts: attemptCount,
      candidates: candidates.map((c) => ({ umd: c.umd, esm: c.esm })),
      lastError: lastError ? {
        message: lastError.message,
        name: lastError.name,
        stack: lastError.stack
      } : null,
      userAgent: navigator.userAgent,
      hasFetch: typeof fetch !== "undefined",
      isSecureContext: window.isSecureContext
    };
    console.error("All MediaPipe loading attempts failed:", errorDetails);
    throw new Error(
      "Tasks Vision globals not available after " + attemptCount + " attempts" + (lastError ? ": " + (lastError.message || lastError) : "")
    );
  }

  // webview/core/CameraManager.ts
  var CameraManager = class {
    constructor(video2, resourceManager) {
      this.lastVideoWidth = 0;
      this.lastVideoHeight = 0;
      this.stream = null;
      this.video = video2;
      this.resourceManager = resourceManager;
    }
    /**
     * Start camera stream
     */
    async startCamera() {
      const facingMode2 = window.__facingMode || "user";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode2, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        this.stream = stream;
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Camera access failed:", errorMessage);
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "error",
              message: "CAMERA_ERROR",
              details: {
                reason: errorMessage,
                facingMode: facingMode2,
                userAgent: navigator.userAgent,
                hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia
              }
            })
          );
        } catch (postErr) {
          console.warn("Failed to send camera error message:", postErr);
        }
        throw error;
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
        if (this.stream) {
          try {
            this.stream.getTracks().forEach((t) => t.stop());
          } catch (err2) {
            console.warn("Failed to stop stored stream:", err2);
          }
        }
        this.stream = null;
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
    getStream() {
      return this.stream;
    }
    /**
     * Check if video is ready for processing
     */
    isVideoReady() {
      return this.video.currentTime > 0 && !this.video.paused && !this.video.ended && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }
  };

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

  // webview/core/OverlayRenderer.ts
  var OverlayRenderer = class {
    constructor(overlay2) {
      this.overlayWidth = 0;
      this.overlayHeight = 0;
      this.overlayDpr = 1;
      this.overlay = overlay2;
      try {
        this.ctx = overlay2.getContext("2d");
      } catch (e) {
        this.ctx = null;
        try {
          console.error(e);
        } catch {
        }
      }
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
      const frameCount = recentFrames.length - 1;
      return frameCount / timeSpan * 1e3;
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
        thresholds: { mlpConfidence: 0.25, fallbackConfidence: 0.35 },
        gestures: { sizeTolerance: 0.25 },
        // Stricter for learning
        performance: { messageThrottleMs: 80 }
        // Faster feedback
      },
      eveningMode: {
        // Relaxation-focused settings
        thresholds: { mlpConfidence: 0.2, fallbackConfidence: 0.3 },
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

  // webview/utils/FrameCaptureManager.ts
  var MAX_CAPTURE_DIMENSION = 640;
  var MAX_DATA_URL_LENGTH = 4e5;
  var frameCaptureEnabled = false;
  var frameCaptureInterval = 500;
  var lastCapturedFrame = null;
  var lastCaptureTimestamp = 0;
  var captureCanvas = null;
  var captureContext = null;
  function ensureCanvas(video2) {
    if (!captureCanvas) {
      captureCanvas = document.createElement("canvas");
      captureContext = captureCanvas.getContext("2d");
    }
    if (!captureCanvas || !captureContext) {
      throw new Error("Unable to initialize frame capture canvas");
    }
    const width = video2.videoWidth;
    const height = video2.videoHeight;
    if (width && height) {
      const scale = Math.min(1, MAX_CAPTURE_DIMENSION / width, MAX_CAPTURE_DIMENSION / height);
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      if (captureCanvas.width !== targetWidth || captureCanvas.height !== targetHeight) {
        captureCanvas.width = targetWidth;
        captureCanvas.height = targetHeight;
      }
    }
  }
  function initializeFrameCapture(video2) {
    try {
      ensureCanvas(video2);
      lastCapturedFrame = null;
      lastCaptureTimestamp = 0;
    } catch (error) {
      console.warn("Failed to initialize frame capture:", error);
    }
  }
  function setFrameCaptureEnabled(enabled, intervalMs) {
    frameCaptureEnabled = enabled;
    if (typeof intervalMs === "number" && intervalMs > 0) {
      frameCaptureInterval = intervalMs;
    }
    if (!enabled) {
      lastCapturedFrame = null;
    }
  }
  function captureFrameForOpenAI(video2) {
    if (!frameCaptureEnabled) {
      return lastCapturedFrame;
    }
    try {
      ensureCanvas(video2);
      if (!captureCanvas || !captureContext || !video2.videoWidth || !video2.videoHeight) {
        return lastCapturedFrame;
      }
      const now = Date.now();
      if (now - lastCaptureTimestamp < frameCaptureInterval) {
        return lastCapturedFrame;
      }
      captureContext.drawImage(video2, 0, 0, captureCanvas.width, captureCanvas.height);
      const qualityLevels = [0.7, 0.5, 0.3];
      let dataUrl = null;
      for (const quality of qualityLevels) {
        try {
          dataUrl = captureCanvas.toDataURL("image/jpeg", quality);
        } catch (error) {
          console.warn("Frame capture encoding failed", error);
          dataUrl = null;
          break;
        }
        if (!dataUrl || dataUrl.length <= MAX_DATA_URL_LENGTH) {
          break;
        }
      }
      if (dataUrl && dataUrl.length <= MAX_DATA_URL_LENGTH) {
        lastCapturedFrame = dataUrl;
        lastCaptureTimestamp = now;
      }
    } catch (error) {
      console.warn("Frame capture failed:", error);
    }
    return lastCapturedFrame;
  }
  function getLastCapturedFrame() {
    return lastCapturedFrame;
  }
  var frameCaptureState = {
    get frameCaptureEnabled() {
      return frameCaptureEnabled;
    },
    get frameCaptureInterval() {
      return frameCaptureInterval;
    },
    get lastCapturedFrame() {
      return lastCapturedFrame;
    }
  };
  function disposeFrameCapture() {
    frameCaptureEnabled = false;
    lastCapturedFrame = null;
    captureCanvas = null;
    captureContext = null;
  }

  // webview/core/GestureDetector.ts
  var GestureDetector = class _GestureDetector {
    constructor(video2, overlay2) {
      this.gestureRecognizer = null;
      this.running = false;
      this.lastCaptureAttempt = 0;
      this.video = video2;
      this.overlay = overlay2;
      this.config = loadConfig();
      this.resourceManager = new ResourceManager();
      this.cameraManager = new CameraManager(video2, this.resourceManager);
      this.overlayRenderer = new OverlayRenderer(overlay2);
      this.healthMonitor = new HealthMonitor();
    }
    static {
      this.loadTasksVisionImpl = loadTasksVision;
    }
    /**
     * Allows tests to override the MediaPipe loader implementation
     */
    static setLoadTasksVisionImplementation(loader) {
      _GestureDetector.loadTasksVisionImpl = loader ?? loadTasksVision;
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
        const components = await _GestureDetector.loadTasksVisionImpl();
        if (!components) {
          throw new Error("Tasks Vision components not available");
        }
        const filesetResolver = components.FilesetResolver ?? window?.fileset_resolver?.FilesetResolver;
        if (!filesetResolver || typeof filesetResolver.forVisionTasks !== "function") {
          throw new Error("Tasks Vision FilesetResolver not available");
        }
        const vision = await filesetResolver.forVisionTasks(components.wasmBase);
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
        const onLoadedData = () => {
          initializeFrameCapture(this.video);
          this.lastCaptureAttempt = 0;
          this.startDetection();
        };
        this.video.addEventListener("loadeddata", onLoadedData);
        this.resourceManager.registerEventListener(this.video, "loadeddata", onLoadedData);
      } catch (error) {
        console.error("Failed to initialize gesture detector:", error);
        throw error;
      }
    }
    /**
     * Start camera and detection
     */
    async start() {
      try {
        await this.cameraManager.startCamera();
        setFrameCaptureEnabled(true);
      } catch (error) {
        console.error("Failed to start camera:", error);
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: "telemetry",
              event: "camera_start_failed",
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            })
          );
        } catch (telemetryErr) {
          console.warn("Failed to send camera error telemetry:", telemetryErr);
        }
        console.warn("Continuing gesture detector initialization despite camera failure");
      }
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
          console.log("MediaPipe recognition results:", {
            hasResults: !!results,
            gestures: results?.gestures?.length || 0,
            landmarks: results?.landmarks?.length || 0,
            handednesses: results?.handednesses?.length || 0,
            recognitionTime: Math.round(recognitionTime)
          });
          if (this.resultCallback && results) {
            this.resultCallback(results, frameStart);
          }
          if (results?.landmarks) {
            const shouldRedraw = this.shouldRedrawOverlay(results, recognitionTime);
            if (shouldRedraw) {
              this.overlayRenderer.clear();
              this.overlayRenderer.drawHandLandmarks(results.landmarks, this.config.camera.mirrorOverlay);
            }
            const captureInterval = frameCaptureState.frameCaptureInterval;
            if (frameStart - this.lastCaptureAttempt >= captureInterval) {
              captureFrameForOpenAI(this.video);
              this.lastCaptureAttempt = frameStart;
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
      setFrameCaptureEnabled(false);
      disposeFrameCapture();
    }
    getCameraStream() {
      return this.cameraManager.getStream();
    }
    /**
     * Get current configuration
     */
    getConfig() {
      return this.config;
    }
  };

  // webview/utils/PerformanceOptimizer.ts
  var PerformanceOptimizer = class {
    constructor() {
      this.frameCount = 0;
      this.lastProcessingTime = 0;
      this.processingTimes = [];
      this.MAX_PROCESSING_HISTORY = 10;
      this.targetFrameRate = 30;
      // Target FPS
      this.adaptiveFrameSkipping = false;
      // Frame skipping configuration
      this.skipFrameCount = 0;
      this.MAX_SKIP_FRAMES = 3;
      // Maximum consecutive frames to skip
      this.PROCESSING_TIME_THRESHOLD = 50;
      // ms - if processing takes longer, consider skipping
      // Landmark change tracking for overlay optimization
      this.lastLandmarksSignature = "";
      this.landmarkChangeThreshold = 0.01;
    }
    // Minimum change to trigger redraw
    /**
     * Determine if current frame should be processed
     */
    shouldProcessFrame() {
      this.frameCount++;
      if (this.frameCount <= 5) {
        return true;
      }
      if (this.adaptiveFrameSkipping && this.shouldSkipFrame()) {
        this.skipFrameCount++;
        return false;
      }
      this.skipFrameCount = 0;
      return true;
    }
    /**
     * Check if we should skip the current frame (public for testing)
     */
    shouldSkipCurrentFrame() {
      return this.adaptiveFrameSkipping && this.shouldSkipFrame();
    }
    /**
     * Record processing time for adaptive optimization
     */
    recordProcessingTime(processingTime) {
      this.lastProcessingTime = processingTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > this.MAX_PROCESSING_HISTORY) {
        this.processingTimes.shift();
      }
      const avgProcessingTime = this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
      this.adaptiveFrameSkipping = avgProcessingTime > this.PROCESSING_TIME_THRESHOLD;
    }
    /**
     * Determine if frame should be skipped based on performance
     */
    shouldSkipFrame() {
      if (this.skipFrameCount >= this.MAX_SKIP_FRAMES) {
        return false;
      }
      const targetFrameTime = 1e3 / this.targetFrameRate;
      return this.lastProcessingTime > targetFrameTime * 1.5;
    }
    /**
     * Check if overlay should be redrawn based on landmark changes
     */
    shouldRedrawOverlay(currentLandmarks, processingTime) {
      if (processingTime < 20) {
        return true;
      }
      const signature = this.generateLandmarksSignature(currentLandmarks);
      if (signature === this.lastLandmarksSignature) {
        return false;
      }
      const changeMagnitude = this.calculateLandmarkChange(currentLandmarks);
      if (changeMagnitude < this.landmarkChangeThreshold) {
        return false;
      }
      this.lastLandmarksSignature = signature;
      return true;
    }
    /**
     * Generate a simplified signature of landmark positions
     */
    generateLandmarksSignature(landmarks) {
      if (!landmarks || landmarks.length === 0) return "";
      const hand = landmarks[0];
      if (!hand || hand.length === 0) return "";
      const keyPoints = Math.min(hand.length, 5);
      const signature = [];
      for (let i = 0; i < keyPoints; i++) {
        const point = hand[i];
        if (point && point.length >= 2) {
          signature.push(`${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`);
        }
      }
      return signature.join("|");
    }
    /**
     * Calculate magnitude of landmark changes from last signature
     */
    calculateLandmarkChange(currentLandmarks) {
      if (!currentLandmarks || currentLandmarks.length === 0) return 0;
      if (!this.lastLandmarksSignature) return 1;
      const currentSignature = this.generateLandmarksSignature(currentLandmarks);
      if (currentSignature === this.lastLandmarksSignature) return 0;
      const currentParts = currentSignature.split("|");
      const lastParts = this.lastLandmarksSignature.split("|");
      if (currentParts.length !== lastParts.length) return 1;
      let totalChange = 0;
      for (let i = 0; i < currentParts.length; i++) {
        const currentCoords = currentParts[i].split(",").map(Number);
        const lastCoords = lastParts[i].split(",").map(Number);
        if (currentCoords.length === 2 && lastCoords.length === 2) {
          const dx = currentCoords[0] - lastCoords[0];
          const dy = currentCoords[1] - lastCoords[1];
          totalChange += Math.sqrt(dx * dx + dy * dy);
        }
      }
      return totalChange / currentParts.length;
    }
    /**
     * Get current performance metrics
     */
    getPerformanceMetrics() {
      const avgProcessingTime = this.processingTimes.length > 0 ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length : 0;
      return {
        frameCount: this.frameCount,
        averageProcessingTime: avgProcessingTime,
        adaptiveFrameSkipping: this.adaptiveFrameSkipping,
        skipFrameCount: this.skipFrameCount,
        targetFrameRate: this.targetFrameRate
      };
    }
    /**
     * Reset performance tracking
     */
    reset() {
      this.frameCount = 0;
      this.processingTimes = [];
      this.skipFrameCount = 0;
      this.adaptiveFrameSkipping = false;
      this.lastLandmarksSignature = "";
    }
    /**
     * Set target frame rate for optimization
     */
    setTargetFrameRate(fps) {
      this.targetFrameRate = Math.max(15, Math.min(60, fps));
    }
    /**
     * Set landmark change threshold for overlay optimization
     */
    setLandmarkChangeThreshold(threshold) {
      this.landmarkChangeThreshold = Math.max(1e-3, Math.min(0.1, threshold));
    }
  };

  // webview/utils/MemoryOptimizer.ts
  var MemoryOptimizer = class _MemoryOptimizer {
    // 100MB
    constructor() {
      this.cleanupCallbacks = /* @__PURE__ */ new Map();
      this.memoryPressureLevel = 0;
      // 0 = normal, 1 = moderate, 2 = high
      this.lastCleanupTime = 0;
      this.CLEANUP_INTERVAL = 3e4;
      // 30 seconds
      this.HIGH_MEMORY_THRESHOLD = 50 * 1024 * 1024;
      // 50MB
      this.CRITICAL_MEMORY_THRESHOLD = 100 * 1024 * 1024;
      this.startMemoryMonitoring();
    }
    static getInstance() {
      if (!_MemoryOptimizer.instance) {
        _MemoryOptimizer.instance = new _MemoryOptimizer();
      }
      return _MemoryOptimizer.instance;
    }
    /**
     * Register a cleanup callback for a component
     */
    registerCleanupCallback(componentId, callback) {
      this.cleanupCallbacks.set(componentId, callback);
    }
    /**
     * Unregister a cleanup callback
     */
    unregisterCleanupCallback(componentId) {
      this.cleanupCallbacks.delete(componentId);
    }
    /**
     * Perform memory cleanup based on current pressure level
     */
    performCleanup() {
      const now = Date.now();
      if (now - this.lastCleanupTime < this.CLEANUP_INTERVAL && this.memoryPressureLevel === 0) {
        return;
      }
      this.lastCleanupTime = now;
      for (const [componentId, callback] of this.cleanupCallbacks) {
        try {
          callback();
        } catch (error) {
          console.warn(`Memory cleanup failed for ${componentId}:`, error);
        }
      }
      if (typeof window !== "undefined" && window.gc) {
        window.gc();
      }
    }
    /**
     * Get optimized history buffer size based on memory pressure
     */
    getOptimizedHistorySize(baseSize) {
      switch (this.memoryPressureLevel) {
        case 0:
          return baseSize;
        // Normal
        case 1:
          return Math.max(3, Math.floor(baseSize * 0.7));
        // Moderate - reduce by 30%
        case 2:
          return Math.max(2, Math.floor(baseSize * 0.5));
        // High - reduce by 50%
        default:
          return baseSize;
      }
    }
    /**
     * Create a memory-efficient circular buffer
     */
    createCircularBuffer(maxSize) {
      return new CircularBuffer(this.getOptimizedHistorySize(maxSize));
    }
    /**
     * Optimize array operations for memory efficiency
     */
    optimizeArrayOperations(array, operation) {
      if (this.memoryPressureLevel >= 1) {
        const result = [];
        for (let i = 0; i < array.length; i++) {
          if (operation(array[i])) {
            result.push(array[i]);
          }
        }
        return result;
      }
      return array.filter(operation);
    }
    /**
     * Get current memory status
     */
    getMemoryStatus() {
      return {
        pressureLevel: this.memoryPressureLevel,
        lastCleanupTime: this.lastCleanupTime,
        registeredComponents: this.cleanupCallbacks.size,
        estimatedMemoryUsage: this.estimateMemoryUsage()
      };
    }
    /**
     * Estimate current memory usage (rough approximation)
     */
    estimateMemoryUsage() {
      let estimatedUsage = 0;
      estimatedUsage += 1024 * 1024;
      estimatedUsage += this.cleanupCallbacks.size * 512 * 1024;
      switch (this.memoryPressureLevel) {
        case 1:
          estimatedUsage *= 1.2;
          break;
        case 2:
          estimatedUsage *= 1.5;
          break;
      }
      return estimatedUsage;
    }
    /**
     * Start memory monitoring
     */
    startMemoryMonitoring() {
      if (typeof window === "undefined") return;
      setInterval(() => {
        this.checkMemoryPressure();
      }, 1e4);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          this.checkMemoryPressure();
          this.performCleanup();
        }
      });
    }
    /**
     * Check current memory pressure level
     */
    checkMemoryPressure() {
      if (typeof window === "undefined" || !window.performance) return;
      try {
        const memory = window.performance.memory;
        if (memory) {
          const usedMemory = memory.usedJSHeapSize;
          const totalMemory = memory.totalJSHeapSize;
          if (usedMemory > this.CRITICAL_MEMORY_THRESHOLD) {
            this.memoryPressureLevel = 2;
          } else if (usedMemory > this.HIGH_MEMORY_THRESHOLD || usedMemory / totalMemory > 0.8) {
            this.memoryPressureLevel = 1;
          } else {
            this.memoryPressureLevel = 0;
          }
        } else {
          const componentCount = this.cleanupCallbacks.size;
          const timeSinceStart = Date.now() - this.lastCleanupTime;
          if (componentCount > 10 && timeSinceStart > 3e5) {
            this.memoryPressureLevel = 1;
          } else if (componentCount > 15 && timeSinceStart > 6e5) {
            this.memoryPressureLevel = 2;
          } else {
            this.memoryPressureLevel = 0;
          }
        }
      } catch (error) {
        this.memoryPressureLevel = 0;
      }
    }
    /**
     * Force garbage collection (development only)
     */
    forceGC() {
      if (typeof window !== "undefined" && window.gc) {
        window.gc();
      }
    }
  };
  var CircularBuffer = class {
    constructor(maxSize) {
      this.buffer = [];
      this.writeIndex = 0;
      this.readIndex = 0;
      this.size = 0;
      this.maxSize = maxSize;
      this.buffer = new Array(maxSize);
    }
    /**
     * Add item to buffer
     */
    push(item) {
      this.buffer[this.writeIndex] = item;
      this.writeIndex = (this.writeIndex + 1) % this.maxSize;
      if (this.size < this.maxSize) {
        this.size++;
      } else {
        this.readIndex = (this.readIndex + 1) % this.maxSize;
      }
    }
    /**
     * Get item at index (0 = most recent)
     */
    get(index) {
      if (index >= this.size) return void 0;
      const actualIndex = (this.writeIndex - 1 - index + this.maxSize) % this.maxSize;
      return this.buffer[actualIndex];
    }
    /**
     * Get all items as array (most recent first)
     */
    toArray() {
      const result = [];
      for (let i = 0; i < this.size; i++) {
        const item = this.get(i);
        if (item !== void 0) {
          result.push(item);
        }
      }
      return result;
    }
    /**
     * Get buffer size
     */
    getSize() {
      return this.size;
    }
    /**
     * Clear buffer
     */
    clear() {
      this.buffer.fill(void 0);
      this.writeIndex = 0;
      this.readIndex = 0;
      this.size = 0;
    }
    /**
     * Resize buffer (creates new buffer)
     */
    resize(newMaxSize) {
      const currentItems = this.toArray();
      this.maxSize = newMaxSize;
      this.buffer = new Array(newMaxSize);
      this.writeIndex = 0;
      this.readIndex = 0;
      this.size = 0;
      const itemsToAdd = Math.min(currentItems.length, newMaxSize);
      for (let i = itemsToAdd - 1; i >= 0; i--) {
        this.push(currentItems[i]);
      }
    }
  };

  // webview/utils/ProcessingPipeline.ts
  var ProcessingPipeline = class {
    constructor() {
      this.processingSteps = [];
      this.lastProcessingResult = null;
      this.performanceOptimizer = new PerformanceOptimizer();
      this.memoryOptimizer = MemoryOptimizer.getInstance();
    }
    /**
     * Add a processing step to the pipeline
     */
    addStep(step) {
      this.processingSteps.push(step);
    }
    /**
     * Execute the processing pipeline with optimizations
     */
    async executePipeline(context) {
      const startTime = performance.now();
      const stepsExecuted = [];
      const skippedSteps = [];
      if (!this.performanceOptimizer.shouldProcessFrame()) {
        return this.createSkippedResult(context, startTime);
      }
      let currentLandmarks = context.landmarks;
      let currentConfidence = 0;
      let detectedGesture;
      const aggregated = {};
      for (const step of this.processingSteps) {
        const stepStartTime = performance.now();
        try {
          if (context.skipExpensiveSteps && step.isExpensive && this.shouldSkipExpensiveStep(step, context)) {
            skippedSteps.push(step.name);
            continue;
          }
          const stepResult = await step.execute({
            ...context,
            landmarks: currentLandmarks
          });
          stepsExecuted.push(step.name);
          if (stepResult && typeof stepResult === "object") {
            Object.assign(aggregated, stepResult);
          }
          if (stepResult.landmarks) {
            currentLandmarks = stepResult.landmarks;
          }
          if (stepResult.gesture && stepResult.confidence > currentConfidence) {
            detectedGesture = stepResult.gesture;
            currentConfidence = stepResult.confidence;
          }
          const stepEnd = performance.now();
          const stepDuration = this.sanitizeDuration(stepEnd - stepStartTime);
          this.recordStepPerformance(step.name, stepDuration);
        } catch (error) {
          console.warn(`Processing step ${step.name} failed:`, error);
          stepsExecuted.push(step.name);
        }
      }
      const endTime = performance.now();
      const totalTime = this.sanitizeDuration(endTime - startTime);
      this.performanceOptimizer.recordProcessingTime(totalTime);
      aggregated.timestamp = aggregated.timestamp ?? context.timestamp;
      const result = {
        ...aggregated,
        gesture: detectedGesture ?? aggregated.gesture,
        confidence: detectedGesture !== void 0 ? currentConfidence : typeof aggregated.confidence === "number" ? aggregated.confidence : currentConfidence,
        landmarks: currentLandmarks,
        processingTime: totalTime,
        stepsExecuted,
        skippedSteps
      };
      this.lastProcessingResult = result;
      return result;
    }
    sanitizeDuration(duration) {
      if (!Number.isFinite(duration)) {
        return 0.01;
      }
      return duration <= 0 ? 0.01 : duration;
    }
    /**
     * Determine if an expensive step should be skipped
     */
    shouldSkipExpensiveStep(step, context) {
      if (this.lastProcessingResult && this.lastProcessingResult.confidence > 0.8) {
        return true;
      }
      if (context.previousLandmarks && this.landmarksUnchanged(context.landmarks, context.previousLandmarks)) {
        return true;
      }
      const metrics = this.performanceOptimizer.getPerformanceMetrics();
      if (metrics.averageProcessingTime > 50) {
        return Math.random() < 0.5;
      }
      return false;
    }
    /**
     * Check if landmarks have changed significantly
     */
    landmarksUnchanged(current, previous) {
      if (current.length !== previous.length) return false;
      for (let handIdx = 0; handIdx < current.length; handIdx++) {
        const currentHand = current[handIdx];
        const previousHand = previous[handIdx];
        if (!currentHand || !previousHand || currentHand.length !== previousHand.length) {
          return false;
        }
        for (let pointIdx = 0; pointIdx < currentHand.length; pointIdx++) {
          const currentPoint = currentHand[pointIdx];
          const previousPoint = previousHand[pointIdx];
          if (!currentPoint || !previousPoint) continue;
          for (let coord = 0; coord < Math.min(currentPoint.length, previousPoint.length); coord++) {
            if (Math.abs(currentPoint[coord] - previousPoint[coord]) > 0.01) {
              return false;
            }
          }
        }
      }
      return true;
    }
    /**
     * Create a result when processing is skipped
     */
    createSkippedResult(context, startTime) {
      return {
        gesture: this.lastProcessingResult?.gesture,
        confidence: this.lastProcessingResult?.confidence || 0,
        landmarks: context.landmarks,
        processingTime: this.sanitizeDuration(performance.now() - startTime),
        stepsExecuted: [],
        skippedSteps: ["frame_skipped"]
      };
    }
    /**
     * Record performance metrics for a processing step
     */
    recordStepPerformance(stepName, executionTime) {
      if (executionTime > 100) {
        console.warn(`Slow processing step: ${stepName} (${executionTime.toFixed(2)}ms)`);
      }
    }
    /**
     * Get pipeline performance metrics
     */
    getPerformanceMetrics() {
      return {
        pipelineMetrics: this.performanceOptimizer.getPerformanceMetrics(),
        stepMetrics: {},
        // Could be enhanced to track per-step metrics
        memoryMetrics: this.memoryOptimizer.getMemoryStatus()
      };
    }
    /**
     * Reset pipeline state
     */
    reset() {
      this.lastProcessingResult = null;
      this.performanceOptimizer.reset();
    }
    /**
     * Configure pipeline optimization settings
     */
    configureOptimization(settings) {
      if (settings.targetFrameRate) {
        this.performanceOptimizer.setTargetFrameRate(settings.targetFrameRate);
      }
      if (settings.landmarkChangeThreshold) {
        this.performanceOptimizer.setLandmarkChangeThreshold(settings.landmarkChangeThreshold);
      }
    }
  };

  // webview/utils/OptimizedTremorCompensator.ts
  var OptimizedTremorCompensator = class {
    constructor() {
      this.landmarkHistory = null;
      this.SMOOTHING_FACTOR = 0.7;
      this.INTENTIONAL_MOVEMENT_THRESHOLD = 0.02;
      this.enabled = true;
      this.lastProcessedLandmarks = [];
      this.memoryOptimizer = MemoryOptimizer.getInstance();
      this.initializeHistoryBuffer();
      this.memoryOptimizer.registerCleanupCallback("tremorCompensator", () => this.cleanup());
    }
    /**
     * Initialize or reinitialize the history buffer with optimized size
     */
    initializeHistoryBuffer() {
      const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(5);
      this.landmarkHistory = this.memoryOptimizer.createCircularBuffer(optimizedSize);
    }
    /**
     * Smooth landmarks with optimized processing
     */
    smoothLandmarks(landmarks) {
      if (!this.enabled || !landmarks || landmarks.length === 0) {
        return landmarks;
      }
      if (this.landmarksUnchanged(landmarks, this.lastProcessedLandmarks)) {
        return this.lastProcessedLandmarks;
      }
      this.landmarkHistory.push(JSON.parse(JSON.stringify(landmarks)));
      if (this.landmarkHistory.getSize() < 2) {
        this.lastProcessedLandmarks = landmarks;
        return landmarks;
      }
      const smoothed = this.applyOptimizedSmoothing(landmarks);
      this.lastProcessedLandmarks = smoothed;
      return smoothed;
    }
    /**
     * Apply optimized smoothing algorithm
     */
    applyOptimizedSmoothing(currentLandmarks) {
      const smoothed = JSON.parse(JSON.stringify(currentLandmarks));
      for (let handIdx = 0; handIdx < currentLandmarks.length; handIdx++) {
        const currentHand = currentLandmarks[handIdx];
        if (!currentHand) continue;
        for (let pointIdx = 0; pointIdx < currentHand.length; pointIdx++) {
          const currentPoint = currentHand[pointIdx];
          if (!currentPoint) continue;
          const smoothedPoint = this.calculateSmoothedPoint(handIdx, pointIdx, currentPoint);
          smoothed[handIdx][pointIdx] = smoothedPoint;
        }
      }
      return smoothed;
    }
    /**
     * Calculate smoothed point with optimized history access
     */
    calculateSmoothedPoint(handIdx, pointIdx, currentPoint) {
      let smoothedX = currentPoint[0];
      let smoothedY = currentPoint[1];
      let smoothedZ = currentPoint[2] || 0;
      let totalWeight = 1;
      const historySize = this.landmarkHistory.getSize();
      for (let historyIdx = 1; historyIdx < historySize; historyIdx++) {
        const weight = Math.pow(1 - this.SMOOTHING_FACTOR, historyIdx);
        const historyFrame = this.landmarkHistory.get(historyIdx - 1);
        if (historyFrame && historyFrame[handIdx] && historyFrame[handIdx][pointIdx]) {
          const historyPoint = historyFrame[handIdx][pointIdx];
          smoothedX += historyPoint[0] * weight;
          smoothedY += historyPoint[1] * weight;
          smoothedZ += (historyPoint[2] || 0) * weight;
          totalWeight += weight;
        }
      }
      return [
        smoothedX / totalWeight,
        smoothedY / totalWeight,
        smoothedZ / totalWeight
      ];
    }
    /**
     * Check if movement is likely intentional vs tremor
     */
    isIntentionalMovement(currentLandmarks, previousLandmarks) {
      if (!this.enabled) return true;
      if (!previousLandmarks || previousLandmarks.length === 0) return true;
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
      return averageMovement > this.INTENTIONAL_MOVEMENT_THRESHOLD;
    }
    /**
     * Check if landmarks have changed significantly
     */
    landmarksUnchanged(current, previous) {
      if (!previous || current.length !== previous.length) return false;
      for (let handIdx = 0; handIdx < current.length; handIdx++) {
        const currentHand = current[handIdx];
        const previousHand = previous[handIdx];
        if (!currentHand || !previousHand || currentHand.length !== previousHand.length) {
          return false;
        }
        const keyPoints = [0, 4, 8, 12, 16, 20];
        for (const pointIdx of keyPoints) {
          const currentPoint = currentHand[pointIdx];
          const previousPoint = previousHand[pointIdx];
          if (!currentPoint || !previousPoint) continue;
          for (let coord = 0; coord < 2; coord++) {
            if (Math.abs(currentPoint[coord] - previousPoint[coord]) > 5e-3) {
              return false;
            }
          }
        }
      }
      return true;
    }
    /**
     * Clear history and reset state
     */
    clearHistory() {
      if (this.landmarkHistory) {
        this.landmarkHistory.clear();
      }
      this.lastProcessedLandmarks = [];
    }
    /**
     * Cleanup resources
     */
    cleanup() {
      this.clearHistory();
      if (this.landmarkHistory) {
        const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(3);
        this.landmarkHistory.resize(optimizedSize);
      }
    }
    /**
     * Enable or disable tremor compensation
     */
    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) {
        this.clearHistory();
      }
    }
    /**
     * Get current status
     */
    getStatus() {
      return {
        enabled: this.enabled,
        historySize: this.landmarkHistory?.getSize() || 0,
        optimizedSize: this.landmarkHistory?.["maxSize"] || 0
      };
    }
  };

  // webview/gestureProcessing.ts
  var PartialGestureDetector = class {
    constructor() {
      this.gestureHistory = /* @__PURE__ */ new Map();
      this.MAX_HISTORY = 5;
      this.COMPLETION_THRESHOLDS = {
        fist: 0.7,
        point: 0.8,
        thumbs_up: 0.75,
        open_palm: 0.6,
        peace: 0.7
      };
      this.recognitionThreshold = 0.6;
    }
    /**
     * Optimized partial gesture analysis with reduced memory allocation
     */
    analyzePartialCompletion(landmarks, gestureId) {
      if (!landmarks?.[0] || landmarks[0].length < 21) {
        return { isPartial: false, completion: 0, confidence: 0, feedback: "" };
      }
      const hand = landmarks[0];
      const completion = this.calculateCompletion(hand, gestureId);
      const confidence = this.calculatePartialConfidence(hand, gestureId, completion);
      this.updateGestureHistory(gestureId, confidence);
      const isPartial = completion >= 0.3 && completion < 0.9;
      const feedback = isPartial ? this.generatePartialFeedback(gestureId, completion) : "";
      return { isPartial, completion, confidence, feedback };
    }
    calculateCompletion(hand, gestureId) {
      switch (gestureId) {
        case "fist":
          return this.calculateFistCompletion(hand);
        case "point":
          return this.calculatePointCompletion(hand);
        case "thumbs_up":
          return this.calculateThumbsUpCompletion(hand);
        case "open_palm":
          return this.calculateOpenPalmCompletion(hand);
        default:
          return 0;
      }
    }
    calculateFistCompletion(hand) {
      let curledFingers = 0;
      const fingerTips = [8, 12, 16, 20];
      const fingerJoints = [6, 10, 14, 18];
      for (let i = 0; i < fingerTips.length; i++) {
        if (hand[fingerTips[i]][1] > hand[fingerJoints[i]][1]) {
          curledFingers++;
        }
      }
      return Math.min(curledFingers / 4, 1);
    }
    calculatePointCompletion(hand) {
      const indexExtended = hand[8][1] < hand[6][1];
      const otherFingersCurled = hand[12][1] > hand[10][1] && // Middle
      hand[16][1] > hand[14][1] && // Ring
      hand[20][1] > hand[18][1];
      if (indexExtended && otherFingersCurled) return 1;
      if (indexExtended) return 0.7;
      return 0;
    }
    calculateThumbsUpCompletion(hand) {
      const thumbExtended = hand[4][1] < hand[3][1];
      if (thumbExtended) return 1;
      return 0;
    }
    calculateOpenPalmCompletion(hand) {
      let extendedFingers = 0;
      const fingerTips = [8, 12, 16, 20];
      const fingerJoints = [6, 10, 14, 18];
      for (let i = 0; i < fingerTips.length; i++) {
        if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
          extendedFingers++;
        }
      }
      return Math.min(extendedFingers / 4, 1);
    }
    calculatePartialConfidence(hand, gestureId, completion) {
      if (completion <= 0) {
        return 0;
      }
      const baseConfidence = completion * 0.8;
      const stability = this.calculateHandStability(hand);
      const stabilityBonus = stability * 0.2;
      return Math.min(baseConfidence + stabilityBonus, 0.9);
    }
    calculateHandStability(hand) {
      if (hand.length < 21) return 0;
      const wrist = hand[0];
      const middleTip = hand[12];
      const distance = Math.sqrt(
        Math.pow(middleTip[0] - wrist[0], 2) + Math.pow(middleTip[1] - wrist[1], 2)
      );
      return Math.min(Math.max(distance, 0.1), 0.5) / 0.5;
    }
    updateGestureHistory(gestureId, confidence) {
      if (!this.gestureHistory.has(gestureId)) {
        this.gestureHistory.set(gestureId, []);
      }
      const history = this.gestureHistory.get(gestureId);
      history.push({ confidence, timestamp: Date.now() });
      if (history.length > this.MAX_HISTORY) {
        history.shift();
      }
    }
    generatePartialFeedback(gestureId, completion) {
      const completionPercent = Math.round(completion * 100);
      switch (gestureId) {
        case "fist":
          return completionPercent < 50 ? "Fast eine Faust! Schlie\xDFe deine Finger mehr." : "Gute Faust! Schlie\xDFe die Finger ganz.";
        case "point":
          return completionPercent < 70 ? "Zeigefinger ausstrecken, andere Finger einrollen." : "Fast perfekt! Halte den Zeigefinger gerade.";
        case "thumbs_up":
          return "Daumen nach oben! Strecke ihn weiter aus.";
        case "open_palm":
          return completionPercent < 50 ? "Hand \xF6ffnen und Finger ausstrecken." : "Fast offen! Strecke alle Finger aus.";
        default:
          return `Geste zu ${completionPercent}% fertig.`;
      }
    }
    setThreshold(threshold) {
      if (Number.isFinite(threshold)) {
        const clamped = Math.max(0, Math.min(1, threshold));
        this.recognitionThreshold = clamped;
      }
    }
    shouldRecognizePartial(completion, confidence) {
      return completion >= 0.4 && confidence >= this.recognitionThreshold;
    }
    cleanup() {
      const cutoffTime = Date.now() - 3e4;
      for (const [gestureId, history] of this.gestureHistory) {
        const filtered = history.filter((entry) => entry.timestamp > cutoffTime);
        if (filtered.length === 0) {
          this.gestureHistory.delete(gestureId);
        } else {
          this.gestureHistory.set(gestureId, filtered);
        }
      }
    }
  };
  var TremorCompensator = class {
    constructor() {
      this.movementHistory = [];
      this.MAX_HISTORY = 3;
      this.SMOOTHING_FACTOR = 0.7;
      this.MOVEMENT_THRESHOLD = 0.02;
    }
    /**
     * Optimized tremor compensation with reduced memory usage
     */
    smoothLandmarks(landmarks) {
      if (!Array.isArray(landmarks) || landmarks.length === 0) {
        return landmarks;
      }
      const normalizedLandmarks = this.cloneHands(landmarks);
      const now = Date.now();
      this.movementHistory.push({ landmarks: normalizedLandmarks, timestamp: now });
      if (this.movementHistory.length > this.MAX_HISTORY) {
        this.movementHistory.shift();
      }
      if (this.movementHistory.length < 2) {
        return normalizedLandmarks;
      }
      const previousEntry = this.movementHistory[this.movementHistory.length - 2];
      const smoothedHands = normalizedLandmarks.map((hand, index) => {
        const previousHand = previousEntry.landmarks[index];
        if (!hand || hand.length === 0) {
          return hand;
        }
        if (!previousHand || previousHand.length === 0) {
          return hand;
        }
        if (!this.isIntentionalMovementForHand(hand, previousHand)) {
          return this.cloneHand(previousHand);
        }
        return this.applySmoothing(hand, previousHand);
      });
      return smoothedHands;
    }
    applySmoothing(current, previous) {
      const smoothed = [];
      const length = Math.min(current.length, previous.length);
      for (let i = 0; i < length; i++) {
        const currentPoint = current[i];
        const previousPoint = previous[i];
        if (!currentPoint || !previousPoint) {
          smoothed.push(currentPoint || previousPoint || [0, 0, 0]);
          continue;
        }
        const smoothedPoint = [
          previousPoint[0] * this.SMOOTHING_FACTOR + currentPoint[0] * (1 - this.SMOOTHING_FACTOR),
          previousPoint[1] * this.SMOOTHING_FACTOR + currentPoint[1] * (1 - this.SMOOTHING_FACTOR),
          (previousPoint[2] ?? 0) * this.SMOOTHING_FACTOR + (currentPoint[2] ?? 0) * (1 - this.SMOOTHING_FACTOR)
        ];
        smoothed.push(smoothedPoint);
      }
      if (current.length > length) {
        for (let i = length; i < current.length; i++) {
          smoothed.push(current[i]);
        }
      }
      return smoothed;
    }
    isIntentionalMovement(currentLandmarks, previousLandmarks) {
      if (!currentLandmarks?.length || !previousLandmarks?.length) return true;
      let totalMovement = 0;
      let points = 0;
      for (let handIdx = 0; handIdx < Math.min(currentLandmarks.length, previousLandmarks.length); handIdx++) {
        const currentHand = currentLandmarks[handIdx];
        const previousHand = previousLandmarks[handIdx];
        if (!currentHand || !previousHand) {
          continue;
        }
        const length = Math.min(currentHand.length, previousHand.length, 21);
        for (let i = 0; i < length; i++) {
          const currentPoint = currentHand[i];
          const previousPoint = previousHand[i];
          if (!currentPoint || !previousPoint) {
            continue;
          }
          const movement = Math.sqrt(
            Math.pow((currentPoint[0] ?? 0) - (previousPoint[0] ?? 0), 2) + Math.pow((currentPoint[1] ?? 0) - (previousPoint[1] ?? 0), 2) + Math.pow((currentPoint[2] ?? 0) - (previousPoint[2] ?? 0), 2)
          );
          totalMovement += movement;
          points++;
        }
      }
      if (points === 0) {
        return true;
      }
      const averageMovement = totalMovement / points;
      return averageMovement > this.MOVEMENT_THRESHOLD;
    }
    isIntentionalMovementForHand(currentHand, previousHand) {
      if (!currentHand?.length || !previousHand?.length) {
        return true;
      }
      const length = Math.min(currentHand.length, previousHand.length, 21);
      let totalMovement = 0;
      let points = 0;
      for (let i = 0; i < length; i++) {
        const currentPoint = currentHand[i];
        const previousPoint = previousHand[i];
        if (!currentPoint || !previousPoint) {
          continue;
        }
        const movement = Math.sqrt(
          Math.pow((currentPoint[0] ?? 0) - (previousPoint[0] ?? 0), 2) + Math.pow((currentPoint[1] ?? 0) - (previousPoint[1] ?? 0), 2) + Math.pow((currentPoint[2] ?? 0) - (previousPoint[2] ?? 0), 2)
        );
        totalMovement += movement;
        points++;
      }
      if (points === 0) {
        return true;
      }
      const averageMovement = totalMovement / points;
      return averageMovement > this.MOVEMENT_THRESHOLD;
    }
    cloneHands(landmarks) {
      return landmarks.map((hand) => this.cloneHand(hand));
    }
    cloneHand(hand) {
      if (!Array.isArray(hand)) {
        return [];
      }
      return hand.map((point) => {
        if (!Array.isArray(point)) {
          return [0, 0, 0];
        }
        return [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0];
      });
    }
    clearHistory() {
      this.movementHistory = [];
    }
  };
  var GestureSizeNormalizer = class _GestureSizeNormalizer {
    constructor() {
      this.tolerance = _GestureSizeNormalizer.DEFAULT_TOLERANCE;
      this.referenceHandSizes = [];
    }
    static {
      this.DEFAULT_TOLERANCE = 0.3;
    }
    static {
      this.MIN_TOLERANCE = 0.1;
    }
    static {
      this.MAX_TOLERANCE = 1;
    }
    static {
      this.DEFAULT_MAX_SCALE = 1.4;
    }
    /**
     * Optimized gesture size normalization
     */
    normalizeHandSize(landmarks) {
      if (!Array.isArray(landmarks) || landmarks.length === 0) {
        return landmarks;
      }
      const normalizedHands = landmarks.map((hand, index) => {
        if (!Array.isArray(hand) || hand.length < 21) {
          this.referenceHandSizes[index] = null;
          return hand;
        }
        const handSize = this.calculateHandSize(hand);
        if (this.referenceHandSizes[index] === null || this.referenceHandSizes[index] === void 0) {
          this.referenceHandSizes[index] = handSize;
          return hand;
        }
        const referenceSize = this.referenceHandSizes[index] ?? 0;
        if (referenceSize <= 0) {
          this.referenceHandSizes[index] = handSize;
          return hand;
        }
        const sizeRatio = handSize / referenceSize;
        if (Math.abs(sizeRatio - 1) <= this.tolerance) {
          return hand;
        }
        const { minScale, maxScale } = this.computeScaleBounds();
        const clampedRatio = this.clampSizeRatio(sizeRatio, minScale, maxScale);
        return this.applySizeNormalization(hand, clampedRatio);
      });
      return normalizedHands;
    }
    calculateHandSize(hand) {
      if (hand.length < 21) return 1;
      const wrist = hand[0];
      const middleTip = hand[12];
      return Math.sqrt(
        Math.pow(middleTip[0] - wrist[0], 2) + Math.pow(middleTip[1] - wrist[1], 2) + Math.pow(middleTip[2] - wrist[2], 2)
      );
    }
    applySizeNormalization(hand, sizeRatio) {
      const wrist = hand[0];
      const normalized = [];
      for (const point of hand) {
        const normalizedPoint = [
          wrist[0] + (point[0] - wrist[0]) / sizeRatio,
          wrist[1] + (point[1] - wrist[1]) / sizeRatio,
          wrist[2] + (point[2] - wrist[2]) / sizeRatio
        ];
        normalized.push(normalizedPoint);
      }
      return normalized;
    }
    clampSizeRatio(sizeRatio, minScale, maxScale) {
      if (!Number.isFinite(sizeRatio) || sizeRatio <= 0) {
        return 1;
      }
      if (sizeRatio < minScale) {
        return minScale;
      }
      if (sizeRatio > maxScale) {
        return maxScale;
      }
      return sizeRatio;
    }
    clampTolerance(value) {
      if (!Number.isFinite(value)) {
        return this.tolerance;
      }
      const clamped = Math.max(_GestureSizeNormalizer.MIN_TOLERANCE, Math.min(_GestureSizeNormalizer.MAX_TOLERANCE, value));
      return clamped;
    }
    computeScaleBounds() {
      const tolerance = this.tolerance;
      const minScale = Math.max(0, 1 - tolerance);
      const defaultMaxScale = _GestureSizeNormalizer.DEFAULT_MAX_SCALE;
      const computedMax = 1 + tolerance;
      const isDefaultTolerance = Math.abs(tolerance - _GestureSizeNormalizer.DEFAULT_TOLERANCE) < 1e-6;
      const maxScale = isDefaultTolerance ? Math.max(defaultMaxScale, computedMax) : computedMax;
      return {
        minScale,
        maxScale
      };
    }
    setTolerance(tolerance) {
      this.tolerance = this.clampTolerance(tolerance);
    }
    getTolerance() {
      const { minScale, maxScale } = this.computeScaleBounds();
      return {
        tolerance: this.tolerance,
        minScale,
        maxScale
      };
    }
    reset() {
      this.referenceHandSizes = [];
    }
  };
  var partialGestureDetector = new PartialGestureDetector();
  var tremorCompensator = new TremorCompensator();
  var gestureSizeNormalizer = new GestureSizeNormalizer();

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
      const ctxLower = context.toLowerCase();
      const isMediaPipeCtx = ctxLower.includes("mediapipe");
      if (errorInfo.code === "MEDIAPIPE_ERROR" || isMediaPipeCtx || ctxLower.includes("model") || ctxLower.includes("performance") || ctxLower.includes("network") || ctxLower.includes("memory")) {
        this.activateFallbackMode();
      }
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
      if (this.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD || isMediaPipeCtx && typeof process !== "undefined" && false) {
        this.circuitBreakerOpen = true;
        console.warn("Circuit breaker opened due to repeated failures");
        this.activateEmergencyMode();
        return false;
      }
      return true;
    }
    isCircuitBreakerOpen() {
      const timeout = typeof process !== "undefined" && false ? 10 : this.CIRCUIT_BREAKER_TIMEOUT;
      if (this.circuitBreakerOpen && Date.now() - this.lastFailureTime > timeout) {
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
      this.isCircuitBreakerOpen();
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

  // webview/core/FallbackGestureDetector.ts
  var FallbackGestureDetector = class _FallbackGestureDetector {
    constructor() {
      this.lastLandmarks = null;
      this.gestureHistory = [];
      this.HISTORY_SIZE = 5;
      this.ruleBasedConfidence = 0;
    }
    static {
      this.MIN_PALM_NORMALIZED_WIDTH = 0.15;
    }
    static {
      this.MIN_PALM_NORMALIZED_HEIGHT = 0.15;
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
        case "open_palm":
          confidence += this.checkOpenPalmClarity(hand) ? 0.2 : -0.05;
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
    checkOpenPalmClarity(hand) {
      const fingerTips = [8, 12, 16, 20];
      const fingerJoints = [6, 10, 14, 18];
      let extendedFingers = 0;
      for (let i = 0; i < fingerTips.length; i++) {
        if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
          extendedFingers += 1;
        }
      }
      const thumbExtended = hand[4][1] < hand[2][1];
      const palmWidth = Math.abs((hand[5]?.[0] ?? 0) - (hand[17]?.[0] ?? 0));
      const palmHeight = Math.abs((hand[0]?.[1] ?? 0) - (hand[9]?.[1] ?? 0));
      return extendedFingers >= 3 && thumbExtended && palmWidth > _FallbackGestureDetector.MIN_PALM_NORMALIZED_WIDTH && palmHeight > _FallbackGestureDetector.MIN_PALM_NORMALIZED_HEIGHT;
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
        return "Versuch es nochmal, wir schaffen das gemeinsam!";
      }
      const celebrationMessages = [
        "Super! Deine Hand bewegt sich richtig.",
        "Toll! Ich sehe deine Geste ganz deutlich.",
        "Fantastisch! Das war eine klasse Geste."
      ];
      const gestureLabels = {
        fist: "Faust",
        point: "Zeigefinger",
        peace: "Peace-Geste",
        thumbs_up: "Daumen hoch",
        open_palm: "offene Hand"
      };
      const clampedConfidence = Math.max(0, Math.min(1, confidence));
      const messageIndex = Math.min(
        celebrationMessages.length - 1,
        Math.floor((clampedConfidence - 0.4) / 0.2)
      );
      const celebration = celebrationMessages[Math.max(0, messageIndex)];
      const friendlyLabel = gestureLabels[gesture] ?? "deine Geste";
      return `${celebration} (${friendlyLabel}).`;
    }
    reset() {
      this.lastLandmarks = null;
      this.gestureHistory = [];
    }
  };

  // webview/utils/MessageBatcher.ts
  var BATCH_INTERVAL_MS = 50;
  var MAX_BATCH_SIZE = 5;
  var FRAME_LATENCY_SAMPLE_INTERVAL = 10;
  var MessageBatcher = class {
    constructor() {
      this.queue = [];
      this.timer = null;
      this.frameCount = 0;
      this.lastSentAt = 0;
    }
    queueMessage(payload, options = {}) {
      this.queue.push(payload);
      this.frameCount += 1;
      if (options.flushImmediately) {
        this.forceFlush();
        return;
      }
      if (this.queue.length >= MAX_BATCH_SIZE || this.frameCount > 0 && this.frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0) {
        this.flushBatch();
        return;
      }
      if (!this.timer) {
        this.timer = setTimeout(() => this.flushBatch(), BATCH_INTERVAL_MS);
      }
    }
    flushBatch() {
      if (!this.queue.length) {
        this.clearTimer();
        return;
      }
      const messages = this.queue.slice();
      this.queue = [];
      this.clearTimer();
      const batchPayload = {
        type: "gesture_batch",
        messageCount: messages.length,
        frameCount: this.frameCount,
        lastSentAt: Date.now(),
        messages
      };
      try {
        if (window.ReactNativeWebView?.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(batchPayload));
        } else {
          console.warn("MessageBatcher: ReactNativeWebView not available, logging batch", batchPayload);
        }
        this.lastSentAt = batchPayload.lastSentAt;
      } catch (error) {
        console.error("MessageBatcher failed to flush batch:", error);
      } finally {
        this.frameCount = 0;
      }
    }
    forceFlush() {
      this.flushBatch();
    }
    getQueueStatus() {
      return {
        pending: this.queue.length,
        frameCount: this.frameCount,
        lastSentAt: this.lastSentAt
      };
    }
    clearTimer() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  };
  var messageBatcher = new MessageBatcher();

  // webview/core/EmergencyGestureSystem.ts
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
      if (!gesture) return false;
      if (!this.EMERGENCY_GESTURES.has(gesture.toLowerCase())) return false;
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
      const timestamp = Date.now();
      const basePayload = {
        gesture,
        confidence,
        timestamp,
        systemHealth: "active"
      };
      try {
        messageBatcher.queueMessage(
          {
            type: "telemetry",
            event: "emergency_gesture_detected",
            ...basePayload
          },
          { flushImmediately: false }
        );
        messageBatcher.queueMessage(
          {
            type: "emergency_gesture",
            ...basePayload
          },
          { flushImmediately: true }
        );
      } catch (err2) {
        console.error("Failed to enqueue emergency telemetry:", err2);
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

  // webview/core/HandStabilityAssistant.ts
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
    /**
     * Set stability threshold
     */
    setStabilityThreshold(threshold) {
      this.stabilityThreshold = Math.max(0.01, Math.min(0.1, threshold));
    }
    /**
     * Get stability statistics
     */
    getStabilityStats() {
      const avgMovement = this.stabilityHistory.length > 0 ? this.stabilityHistory.reduce((sum, m) => sum + m, 0) / this.stabilityHistory.length : 0;
      return {
        currentScore: this.stabilityScore,
        averageMovement: avgMovement,
        historySize: this.stabilityHistory.length,
        threshold: this.stabilityThreshold
      };
    }
  };

  // webview/core/BatteryMonitor.ts
  var BatteryMonitor = class {
    constructor() {
      this.batteryLevel = 1;
      this.isMonitoring = false;
      this.emergencyMode = false;
      this.lastBatteryCheck = 0;
      this.BATTERY_CHECK_INTERVAL = 3e4;
      // Check every 30 seconds
      this.EMERGENCY_BATTERY_THRESHOLD = 0.05;
      this.emergencyBatteryThreshold = this.EMERGENCY_BATTERY_THRESHOLD;
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
    /**
     * Stop battery monitoring
     */
    stopMonitoring() {
      this.isMonitoring = false;
    }
    /**
     * Set emergency battery threshold
     */
    setEmergencyThreshold(threshold) {
      this.emergencyBatteryThreshold = Math.max(0.01, Math.min(0.2, threshold));
    }
  };

  // webview/utils/mapMediaPipeResults.ts
  function normalizeHandLandmarks(hand) {
    if (!hand) {
      return [];
    }
    const normalized = [];
    for (const point of hand) {
      if (!point) {
        normalized.push([0, 0, 0]);
        continue;
      }
      const { x = 0, y = 0, z = 0 } = point;
      normalized.push([x, y, z]);
    }
    return normalized;
  }
  function mapMediaPipeResult(result) {
    if (!result) {
      return { hands: [], landmarks: [], handednesses: [] };
    }
    const maxHands = Math.max(
      result.landmarks?.length ?? 0,
      result.handednesses?.length ?? 0,
      result.gestures?.length ?? 0
    );
    const hands = [];
    for (let i = 0; i < maxHands; i += 1) {
      const landmarks = normalizeHandLandmarks(result.landmarks?.[i]);
      const handedness = result.handednesses?.[i]?.[0]?.categoryName ?? "unknown";
      const gestures = (result.gestures?.[i] ?? []).map((gesture) => ({
        label: gesture.categoryName,
        score: gesture.score
      }));
      if (!landmarks.length && !gestures.length && handedness === "unknown") {
        continue;
      }
      hands.push({ landmarks, handedness, gestures });
    }
    return {
      hands,
      landmarks: hands.map((hand) => hand.landmarks),
      handednesses: hands.map((hand) => hand.handedness)
    };
  }

  // webview/core/GestureRecognitionOrchestrator.ts
  var FALLBACK_CONFIDENCE_THRESHOLD = typeof window.__fallbackThreshold === "number" ? window.__fallbackThreshold : 0.35;
  var MLP_CONFIDENCE_THRESHOLD = typeof window.__mlpThreshold === "number" ? window.__mlpThreshold : 0.05;
  var FRAME_BATCH_INTERVAL_MS = 400;
  var FRAME_BUFFER_LIMIT = 24;
  var GestureRecognitionOrchestrator = class {
    constructor(video2, overlay2, dependencies = {}) {
      this.video = video2;
      this.overlay = overlay2;
      this.gestureDetector = null;
      this.isInitialized = false;
      this.isRunning = false;
      this.frameSampleCounter = 0;
      this.lastLandmarkSendTime = 0;
      this.frameBuffer = [];
      this.frameBatchTimer = null;
      this.clipCaptureState = null;
      this.performanceOptimizer = new PerformanceOptimizer();
      this.memoryOptimizer = MemoryOptimizer.getInstance();
      this.processingPipeline = new ProcessingPipeline();
      this.config = loadConfig();
      this.createGestureDetector = dependencies.createGestureDetector ?? ((videoEl, overlayEl) => new GestureDetector(videoEl, overlayEl));
      this.errorRecoveryManager = dependencies.errorRecoveryManager ?? new ErrorRecoveryManager();
      this.initializeComponents();
      this.setupProcessingPipeline();
    }
    /**
     * Initialize all gesture recognition components
     */
    initializeComponents() {
      this.tremorCompensator = new OptimizedTremorCompensator();
      this.sizeNormalizer = new GestureSizeNormalizer();
      this.partialDetector = new PartialGestureDetector();
      this.fallbackDetector = new FallbackGestureDetector();
      this.emergencySystem = new EmergencyGestureSystem();
      this.handStabilityAssistant = new HandStabilityAssistant();
      this.batteryMonitor = new BatteryMonitor();
      this.sizeNormalizer.setTolerance(this.config.processing?.sizeTolerance ?? 0.3);
      this.partialDetector.setThreshold(this.config.processing?.partialThreshold ?? 0.6);
    }
    /**
     * Set up the processing pipeline with all necessary steps
     */
    setupProcessingPipeline() {
      this.processingPipeline.addStep(new LandmarkPreprocessingStep(this.sizeNormalizer, this.tremorCompensator));
      this.processingPipeline.addStep(new StabilityAnalysisStep(this.handStabilityAssistant));
      this.processingPipeline.addStep(new GestureDetectionStep(this.config));
      this.processingPipeline.addStep(new PartialGestureAnalysisStep(this.partialDetector));
      this.processingPipeline.addStep(new EmergencyGestureCheckStep(this.emergencySystem));
      this.processingPipeline.addStep(new FallbackProcessingStep(this.fallbackDetector, this.errorRecoveryManager));
      this.processingPipeline.addStep(new ResultProcessingStep(this.errorRecoveryManager));
      this.processingPipeline.configureOptimization({
        targetFrameRate: this.config.performance?.targetFrameRate ?? 30,
        landmarkChangeThreshold: this.config.processing?.landmarkChangeThreshold ?? 0.01,
        enableMemoryOptimization: true
      });
    }
    /**
     * Initialize the gesture recognition system
     */
    async initialize() {
      if (this.isInitialized) return;
      try {
        this.gestureDetector = this.createGestureDetector(this.video, this.overlay);
        this.gestureDetector.setResultCallback((results, timestamp) => {
          this.handleGestureResults(results, timestamp);
        });
        await this.gestureDetector.initialize();
        this.batteryMonitor.startMonitoring();
        setFrameCaptureEnabled(true);
        this.isInitialized = true;
      } catch (error) {
        console.error("Failed to initialize gesture recognition orchestrator:", error);
        throw error;
      }
    }
    /**
     * Start gesture recognition
     */
    async start() {
      if (!this.isInitialized) {
        await this.initialize();
      }
      if (this.isRunning) return;
      await this.gestureDetector?.start();
      this.isRunning = true;
    }
    /**
     * Stop gesture recognition
     */
    async stop() {
      if (!this.isRunning) return;
      this.cancelClipCapture();
      this.flushFrameBatch(true);
      this.frameBuffer = [];
      await this.gestureDetector?.stop();
      this.isRunning = false;
    }
    /**
     * Handle gesture detection results
     */
    async handleGestureResults(results, timestamp) {
      try {
        if (!this.performanceOptimizer.shouldProcessFrame()) {
          return;
        }
        const normalized = mapMediaPipeResult(results);
        this.collectFrameForBatch(normalized);
        const context = {
          landmarks: normalized.landmarks,
          timestamp,
          processingStep: "gesture_results",
          skipExpensiveSteps: this.shouldSkipExpensiveSteps(),
          rawResults: results,
          handednesses: normalized.handednesses,
          normalizedResults: normalized
        };
        const processingResult = await this.processingPipeline.executePipeline(context);
        const hasLandmarks = normalized.landmarks.some((hand) => hand.length > 0);
        const now = Date.now();
        if (hasLandmarks && now - this.lastLandmarkSendTime > 500) {
          this.sendLandmarks(normalized.landmarks, normalized.handednesses, timestamp);
          this.lastLandmarkSendTime = now;
        }
        const hasGestureResult = Boolean(processingResult.gesture) || (processingResult.confidence ?? 0) > 0.3 || // Lower threshold for fallback gestures
        Boolean(processingResult.fallback?.gesture);
        console.log("Gesture result check:", JSON.stringify({
          hasGestureResult,
          gesture: processingResult.gesture,
          confidence: processingResult.confidence,
          hasFallback: Boolean(processingResult.fallback?.gesture)
        }));
        if (hasGestureResult) {
          console.log("Sending gesture result:", JSON.stringify(processingResult));
          this.sendGestureResult(processingResult, results);
        } else if (hasLandmarks) {
          this.sendGestureResult({
            gesture: null,
            confidence: 0,
            landmarks: normalized.landmarks,
            metadata: {
              method: "none",
              perHand: [],
              handednesses: normalized.handednesses,
              mlp: null,
              twoHand: null
            },
            timestamp,
            isFallback: false,
            systemHealth: this.errorRecoveryManager.getHealthStatus(),
            processingTime: processingResult.processingTime,
            stepsExecuted: processingResult.stepsExecuted,
            skippedSteps: processingResult.skippedSteps
          }, results);
        }
        this.performanceOptimizer.recordProcessingTime(processingResult.processingTime);
        this.frameSampleCounter += 1;
        if (this.frameSampleCounter >= FRAME_LATENCY_SAMPLE_INTERVAL) {
          const metrics = this.performanceOptimizer.getPerformanceMetrics();
          if (metrics.averageProcessingTime > 30) {
            messageBatcher.forceFlush();
          }
          this.frameSampleCounter = 0;
        }
      } catch (error) {
        console.error("Error handling gesture results:", error);
        this.errorRecoveryManager.recordFailure(error, "gesture_result_processing");
      }
    }
    collectFrameForBatch(normalized) {
      try {
        const frameDataUrl = captureFrameForOpenAI(this.video);
        if (!frameDataUrl) {
          return;
        }
        const entry = {
          frame: frameDataUrl,
          landmarks: normalized.landmarks,
          handednesses: normalized.handednesses,
          timestamp: Date.now()
        };
        this.frameBuffer.push(entry);
        if (this.frameBuffer.length > FRAME_BUFFER_LIMIT) {
          this.frameBuffer = this.frameBuffer.slice(-FRAME_BUFFER_LIMIT);
        }
        if (this.clipCaptureState) {
          this.clipCaptureState.frameCount += 1;
        }
        if (this.frameBatchTimer === null) {
          this.frameBatchTimer = window.setTimeout(() => this.flushFrameBatch(), FRAME_BATCH_INTERVAL_MS);
        }
      } catch (error) {
        console.warn("Failed to collect frame batch:", error);
      }
    }
    flushFrameBatch(sendFullBuffer = false) {
      if (this.frameBatchTimer !== null) {
        clearTimeout(this.frameBatchTimer);
        this.frameBatchTimer = null;
      }
      if (this.frameBuffer.length === 0) {
        return;
      }
      const entries = sendFullBuffer ? [...this.frameBuffer] : this.frameBuffer.slice(-Math.min(this.frameBuffer.length, 6));
      try {
        const payload = {
          type: "FRAME_BATCH",
          landmarks: entries.map((entry) => entry.landmarks),
          frames: entries.map((entry) => entry.frame)
        };
        messageBatcher.queueMessage(payload, { flushImmediately: false });
      } catch (error) {
        console.warn("Failed to enqueue frame batch payload:", error);
      }
      if (!sendFullBuffer && this.frameBuffer.length > FRAME_BUFFER_LIMIT) {
        this.frameBuffer = this.frameBuffer.slice(-FRAME_BUFFER_LIMIT);
      }
    }
    startClipCapture(requestId) {
      if (this.clipCaptureState) {
        this.sendClipError(requestId, "capture_in_progress");
        return;
      }
      if (typeof window.MediaRecorder === "undefined") {
        this.sendClipError(requestId, "media_recorder_unavailable");
        return;
      }
      const stream = this.gestureDetector?.getCameraStream();
      if (!stream) {
        this.sendClipError(requestId, "no_camera_stream");
        return;
      }
      const mimeType = this.selectClipMimeType();
      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (error) {
        this.sendClipError(requestId, "recorder_init_failed", error);
        return;
      }
      const state = {
        id: requestId,
        recorder,
        chunks: [],
        startedAt: Date.now(),
        mimeType: recorder.mimeType || mimeType || "video/mp4",
        frameCount: 0,
        timeoutHandle: null
      };
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          state.chunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        this.sendClipError(requestId, "recorder_error", event?.error);
        this.resetClipCapture(true);
      };
      recorder.onstop = () => {
        this.handleClipStop(state);
      };
      try {
        recorder.start(500);
      } catch (error) {
        this.sendClipError(requestId, "recorder_start_failed", error);
        this.resetClipCapture(true);
        return;
      }
      state.timeoutHandle = window.setTimeout(() => {
        this.sendClipError(requestId, "recorder_timeout");
        this.resetClipCapture(true);
      }, 15e3);
      this.clipCaptureState = state;
      this.sendClipTelemetry("clip_started", requestId, { mimeType: state.mimeType });
    }
    stopClipCapture(requestId) {
      if (!this.clipCaptureState || this.clipCaptureState.id !== requestId) {
        this.sendClipError(requestId, "unknown_capture_id");
        return;
      }
      try {
        if (this.clipCaptureState.recorder.state !== "inactive") {
          this.clipCaptureState.recorder.stop();
        }
        this.sendClipTelemetry("clip_stop_requested", requestId, void 0);
      } catch (error) {
        this.sendClipError(requestId, "recorder_stop_failed", error);
        this.resetClipCapture(true);
      }
    }
    cancelClipCapture() {
      if (!this.clipCaptureState) {
        return;
      }
      try {
        if (this.clipCaptureState.recorder.state !== "inactive") {
          this.clipCaptureState.recorder.stop();
        }
      } catch (error) {
        console.warn("Failed to cancel clip capture:", error);
      }
      this.resetClipCapture(true);
    }
    resetClipCapture(stopRecorder) {
      if (!this.clipCaptureState) {
        return;
      }
      const state = this.clipCaptureState;
      if (state.timeoutHandle) {
        clearTimeout(state.timeoutHandle);
      }
      if (stopRecorder) {
        try {
          if (state.recorder.state !== "inactive") {
            state.recorder.stop();
          }
        } catch (error) {
          console.warn("Failed to stop recorder during reset:", error);
        }
      }
      this.clipCaptureState = null;
    }
    handleClipStop(state) {
      if (state.timeoutHandle) {
        clearTimeout(state.timeoutHandle);
      }
      const blob = new Blob(state.chunks, { type: state.mimeType || "video/mp4" });
      if (blob.size === 0) {
        this.sendClipError(state.id, "empty_clip_blob");
        this.resetClipCapture(false);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const result = reader.result;
          if (!result) {
            throw new Error("clip_read_failed");
          }
          const base64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
          const durationMs = Math.max(0, Date.now() - state.startedAt);
          this.postClipReady({
            id: state.id,
            base64,
            mimeType: state.mimeType || "video/mp4",
            durationMs,
            frameCount: state.frameCount,
            capturedAt: new Date(state.startedAt).toISOString()
          });
        } catch (error) {
          this.sendClipError(state.id, "clip_read_failed", error);
        } finally {
          this.resetClipCapture(false);
        }
      };
      reader.onerror = () => {
        this.sendClipError(state.id, "clip_read_failed", reader.error);
        this.resetClipCapture(false);
      };
      try {
        reader.readAsDataURL(blob);
      } catch (error) {
        this.sendClipError(state.id, "clip_read_failed", error);
        this.resetClipCapture(false);
      }
    }
    postClipReady(payload) {
      try {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "clip_ready", ...payload }));
        this.flushFrameBatch(true);
        this.sendClipTelemetry("clip_ready", payload.id, {
          durationMs: payload.durationMs,
          frameCount: payload.frameCount,
          mimeType: payload.mimeType
        });
      } catch (error) {
        console.warn("Failed to post clip_ready message:", error);
      }
    }
    sendClipError(requestId, reason, details) {
      try {
        const payload = {
          type: "clip_error",
          id: requestId,
          reason,
          details: this.serializeError(details)
        };
        window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
        this.sendClipTelemetry("clip_error", requestId, { reason, details: this.serializeError(details) });
      } catch (error) {
        console.warn("Failed to post clip_error message:", error);
      }
    }
    sendClipTelemetry(event, requestId, data) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "telemetry",
            event,
            requestId,
            data,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        console.warn("Failed to send clip telemetry:", error);
      }
    }
    selectClipMimeType() {
      if (typeof window.MediaRecorder === "undefined" || typeof window.MediaRecorder.isTypeSupported !== "function") {
        return void 0;
      }
      const candidates = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];
      return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate));
    }
    serializeError(details) {
      if (!details) {
        return void 0;
      }
      if (details instanceof Error) {
        return { message: details.message, name: details.name };
      }
      if (typeof details === "object") {
        try {
          return JSON.parse(JSON.stringify(details));
        } catch {
          return String(details);
        }
      }
      return details;
    }
    /**
     * Determine if expensive processing steps should be skipped
     */
    shouldSkipExpensiveSteps() {
      const metrics = this.performanceOptimizer.getPerformanceMetrics();
      const memoryStatus = this.memoryOptimizer.getMemoryStatus();
      const shouldSkip = metrics.averageProcessingTime > 50 || memoryStatus.pressureLevel > 1;
      console.log("shouldSkipExpensiveSteps:", shouldSkip, "avgTime:", metrics.averageProcessingTime, "memoryPressure:", memoryStatus.pressureLevel);
      return shouldSkip;
    }
    /**
     * Send gesture result to React Native
     */
    sendLandmarks(landmarks, handedness, timestamp) {
      const payload = {
        type: "landmarks",
        landmarks,
        handedness,
        timestamp
      };
      messageBatcher.queueMessage(payload, {});
    }
    sendGestureResult(processingResult, originalResults) {
      try {
        const handednessLabels = processingResult.metadata?.handednesses?.map((label) => String(label)) ?? originalResults.handednesses?.map((hand) => {
          const category = hand?.[0]?.categoryName;
          return typeof category === "string" ? category : "unknown";
        }) ?? [];
        const payload = {
          type: "gesture",
          gesture: processingResult.gesture,
          confidence: processingResult.confidence,
          landmarks: processingResult.landmarks,
          handednesses: handednessLabels,
          timestamp: processingResult.timestamp ?? Date.now(),
          isFallback: processingResult.isFallback,
          systemHealth: this.errorRecoveryManager.getHealthStatus(),
          processingTime: processingResult.processingTime,
          stepsExecuted: processingResult.stepsExecuted,
          skippedSteps: processingResult.skippedSteps,
          thresholds: {
            fallback: FALLBACK_CONFIDENCE_THRESHOLD,
            mlp: MLP_CONFIDENCE_THRESHOLD
          }
        };
        const fallbackResult = processingResult.fallback;
        if (!payload.gesture && fallbackResult?.gesture) {
          payload.gesture = fallbackResult.gesture;
        }
        if ((payload.confidence ?? 0) === 0 && typeof fallbackResult?.confidence === "number") {
          payload.confidence = fallbackResult.confidence;
        }
        if (!payload.isFallback && fallbackResult?.isFallback) {
          payload.isFallback = true;
        }
        const frameCapture = getLastCapturedFrame();
        const effectiveConfidence = payload.confidence ?? 0;
        if (frameCapture && (effectiveConfidence < FALLBACK_CONFIDENCE_THRESHOLD || payload.isFallback)) {
          payload.frameCapture = frameCapture;
        }
        const shouldFlushImmediately = Boolean(
          processingResult.emergency?.detected || processingResult.isFallback || fallbackResult?.isFallback || processingResult.isUsingFallback
        );
        messageBatcher.queueMessage(payload, {
          flushImmediately: shouldFlushImmediately
        });
      } catch (error) {
        console.warn("Failed to send gesture result:", error);
      }
    }
    /**
     * Get current system status
     */
    getStatus() {
      return {
        initialized: this.isInitialized,
        running: this.isRunning,
        performance: this.performanceOptimizer.getPerformanceMetrics(),
        memory: this.memoryOptimizer.getMemoryStatus(),
        health: this.errorRecoveryManager.getHealthStatus()
      };
    }
    /**
     * Cleanup resources
     */
    async cleanup() {
      await this.stop();
      messageBatcher.forceFlush();
      setFrameCaptureEnabled(false);
      this.memoryOptimizer.performCleanup();
    }
  };
  var LandmarkPreprocessingStep = class {
    constructor(sizeNormalizer, tremorCompensator2) {
      this.sizeNormalizer = sizeNormalizer;
      this.tremorCompensator = tremorCompensator2;
      this.name = "landmark_preprocessing";
      this.isExpensive = false;
    }
    async execute(context) {
      if (!context.landmarks || context.landmarks.length === 0) {
        return { landmarks: context.landmarks };
      }
      let processedLandmarks = this.sizeNormalizer.normalizeHandSize(context.landmarks);
      processedLandmarks = this.tremorCompensator.smoothLandmarks(processedLandmarks);
      return {
        landmarks: processedLandmarks,
        rawLandmarks: context.landmarks,
        preprocessing: {
          sizeNormalized: true,
          tremorCompensated: true
        }
      };
    }
  };
  var StabilityAnalysisStep = class {
    constructor(stabilityAssistant) {
      this.stabilityAssistant = stabilityAssistant;
      this.name = "stability_analysis";
      this.isExpensive = false;
    }
    async execute(context) {
      if (!context.landmarks || context.landmarks.length === 0) {
        return { stability: { isStable: false, score: 0 } };
      }
      const stability = this.stabilityAssistant.analyzeStability(context.landmarks);
      return {
        stability,
        feedback: stability.feedback
      };
    }
  };
  var GestureDetectionStep = class {
    // MediaPipe processing can be expensive
    constructor(config) {
      this.config = config;
      this.name = "gesture_detection";
      this.isExpensive = true;
    }
    async execute(context) {
      console.log("GestureDetectionStep executing, skipExpensive:", context.skipExpensiveSteps);
      const rawResults = context.rawResults;
      const normalized = context.normalizedResults ?? mapMediaPipeResult(rawResults);
      const handednesses = normalized.handednesses;
      const rawHandednesses = rawResults?.handednesses ?? [];
      const perHand = this.extractPerHandDetections(normalized);
      console.log("Per hand detections:", perHand);
      let selectedGesture = null;
      let selectedConfidence = 0;
      let detectionMethod = "none";
      let twoHandMetadata = null;
      if (perHand.length > 0) {
        for (const candidate of perHand) {
          if (candidate.score > selectedConfidence) {
            selectedGesture = this.normalizeLabel(candidate.label);
            selectedConfidence = candidate.score;
            detectionMethod = "mediapipe";
          }
        }
        if (perHand.length >= 2) {
          const twoHandCandidate = this.resolveTwoHandGesture(perHand);
          if (twoHandCandidate) {
            selectedGesture = this.formatTwoHandGesture(twoHandCandidate.gesture);
            selectedConfidence = twoHandCandidate.score;
            detectionMethod = "mediapipe";
            twoHandMetadata = twoHandCandidate.gesture;
          }
        }
      }
      let mlpMetadata = null;
      console.log("Checking MLP availability:", typeof window.__mlpPredict);
      if (typeof window.__mlpPredict === "function") {
        console.log("MLP function available, attempting prediction");
        try {
          console.log("MLP input landmarks:", context.landmarks);
          console.log("MLP input handednesses:", rawHandednesses.length > 0 ? rawHandednesses : handednesses);
          const mlpResult = window.__mlpPredict(
            context.rawLandmarks ?? context.landmarks ?? [],
            rawHandednesses.length > 0 ? rawHandednesses : handednesses
          );
          console.log("MLP prediction result:", JSON.stringify(mlpResult));
          if (mlpResult && typeof mlpResult.score === "number") {
            mlpMetadata = mlpResult;
            const threshold = this.config?.thresholds?.mlpConfidence ?? MLP_CONFIDENCE_THRESHOLD;
            console.log("MLP threshold check:", JSON.stringify({ score: mlpResult.score, threshold, selectedConfidence }));
            const isMediaPipeConfident = selectedConfidence > 0.3;
            const confidenceMargin = isMediaPipeConfident ? 0.15 : 0;
            if (mlpResult.score >= threshold && (selectedGesture === null || selectedGesture === "none" || mlpResult.score >= selectedConfidence + confidenceMargin)) {
              console.log("MLP gesture selected:", JSON.stringify({
                label: mlpResult.label,
                score: mlpResult.score,
                margin: confidenceMargin
              }));
              selectedGesture = this.normalizeLabel(mlpResult.label);
              selectedConfidence = mlpResult.score;
              detectionMethod = "mlp";
              twoHandMetadata = null;
            } else {
              console.log("MLP gesture not selected:", JSON.stringify({
                score: mlpResult.score,
                threshold,
                selectedConfidence,
                margin: confidenceMargin
              }));
            }
          } else {
            console.log("MLP result invalid:", JSON.stringify({ mlpResult, hasScore: typeof mlpResult?.score === "number" }));
          }
        } catch (error) {
          console.warn("MLP prediction failed:", error);
        }
      }
      return {
        gesture: selectedGesture,
        confidence: selectedConfidence,
        landmarks: context.landmarks,
        metadata: {
          method: detectionMethod,
          perHand: perHand.map(({ hand, label, score }) => ({ hand, label, score })),
          handednesses,
          mlp: mlpMetadata,
          twoHand: twoHandMetadata
        }
      };
    }
    extractPerHandDetections(normalized) {
      const detections = [];
      normalized.hands.forEach((hand, index) => {
        const topGesture = hand.gestures[0];
        if (!topGesture) {
          return;
        }
        const normalizedLabel = this.normalizeLabel(topGesture.label);
        if (!normalizedLabel) {
          return;
        }
        detections.push({
          index,
          hand: hand.handedness ?? "unknown",
          label: normalizedLabel,
          score: topGesture.score
        });
      });
      return detections;
    }
    resolveTwoHandGesture(perHand) {
      if (perHand.length < 2) {
        return null;
      }
      const leftCandidate = this.findCandidate(perHand, /left/i);
      const rightCandidate = this.findCandidate(perHand, /right/i, leftCandidate?.index);
      const finalLeft = leftCandidate ?? null;
      const finalRight = rightCandidate ?? null;
      if (!finalLeft || !finalRight) {
        return null;
      }
      return {
        gesture: {
          left: finalLeft.label,
          right: finalRight.label
        },
        score: Math.sqrt(finalLeft.score * finalRight.score)
      };
    }
    findCandidate(perHand, pattern, excludeIndex) {
      return perHand.find((candidate) => {
        if (excludeIndex !== void 0 && candidate.index === excludeIndex) {
          return false;
        }
        return pattern.test(candidate.hand);
      });
    }
    formatTwoHandGesture(gesture) {
      return `${gesture.left}+${gesture.right}`;
    }
    normalizeLabel(label) {
      if (!label) {
        return null;
      }
      const normalized = label.trim().toLowerCase();
      return normalized.length > 0 ? normalized : null;
    }
  };
  var PartialGestureAnalysisStep = class {
    constructor(partialDetector) {
      this.partialDetector = partialDetector;
      this.name = "partial_gesture_analysis";
      this.isExpensive = false;
    }
    async execute(context) {
      if (!context.landmarks || context.landmarks.length === 0) {
        return { partial: null };
      }
      const commonGestures = ["thumbs_up", "open_palm", "fist", "point"];
      let bestPartial = null;
      for (const gesture of commonGestures) {
        const partial = this.partialDetector.analyzePartialCompletion(context.landmarks, gesture);
        if (partial.isPartial && (!bestPartial || partial.completion > bestPartial.completion)) {
          bestPartial = { ...partial, gesture };
        }
      }
      return { partial: bestPartial };
    }
  };
  var EmergencyGestureCheckStep = class {
    constructor(emergencySystem) {
      this.emergencySystem = emergencySystem;
      this.name = "emergency_gesture_check";
      this.isExpensive = false;
    }
    async execute(context) {
      const normalized = context.normalizedResults ?? mapMediaPipeResult(context.rawResults);
      const emergencyStatus = {
        detected: false,
        priority: "normal",
        feedback: "",
        cooldownRemaining: 0
      };
      for (const hand of normalized.hands) {
        const candidate = hand.gestures?.[0];
        if (!candidate || !candidate.label) {
          continue;
        }
        if (!this.emergencySystem.isEmergencyGesture(candidate.label, candidate.score ?? 0)) {
          continue;
        }
        const processed = this.emergencySystem.processEmergencyGesture(
          candidate.label,
          candidate.score ?? 0,
          context.landmarks
        );
        emergencyStatus.priority = processed.priority;
        emergencyStatus.cooldownRemaining = processed.cooldownRemaining;
        emergencyStatus.feedback = processed.feedback;
        if (processed.shouldProcess) {
          emergencyStatus.detected = true;
          break;
        }
      }
      return { emergency: emergencyStatus };
    }
  };
  var FallbackProcessingStep = class {
    constructor(fallbackDetector, errorRecoveryManager) {
      this.fallbackDetector = fallbackDetector;
      this.errorRecoveryManager = errorRecoveryManager;
      this.name = "fallback_processing";
      this.isExpensive = false;
    }
    async execute(context) {
      if (!this.errorRecoveryManager.isInFallbackMode()) {
        return { fallback: null };
      }
      if (!context.landmarks || context.landmarks.length === 0) {
        return { fallback: null };
      }
      const fallback = this.fallbackDetector.detectGesture(context.landmarks);
      return {
        fallback,
        isUsingFallback: true
      };
    }
  };
  var ResultProcessingStep = class {
    constructor(errorRecoveryManager) {
      this.errorRecoveryManager = errorRecoveryManager;
      this.name = "result_processing";
      this.isExpensive = false;
    }
    async execute(context) {
      return {
        finalResult: {
          validated: true,
          timestamp: context.timestamp
        }
      };
    }
  };

  // webview/gestureDetector.new.ts
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
  var originalConsoleLog = console.log;
  console.log = (...args) => {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "telemetry",
          event: "console_log",
          message: args.join(" "),
          timestamp: Date.now()
        })
      );
    } catch (err2) {
    }
    originalConsoleLog(...args);
  };
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
  var tapToStartText = window.__tapToStart || "";
  var recognizerInitFailed = window.__recognizerInitFailed || "Erkennung konnte nicht gestartet werden: ";
  var predictionError = window.__predictionError || "Vorhersagefehler: ";
  var cameraError = window.__cameraError || "Kamerafehler: ";
  var facingMode = window.__facingMode || "user";
  var mirrorOverlay = window.__mirrorOverlay === true;
  var container = document.createElement("div");
  container.id = "gestureCameraContainer";
  var video = document.createElement("video");
  var overlay = document.createElement("canvas");
  overlay.id = "overlay";
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  function ensureStyleSheet() {
    if (document.getElementById("gesture-detector-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "gesture-detector-styles";
    style.textContent = `
    html, body {
      height: 100%;
      width: 100%;
    }

    body.gesture-detector {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #ecfdf5;
      background-image: radial-gradient(circle at 20% 20%, rgba(134, 239, 172, 0.25), transparent 60%),
        radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.18), transparent 55%);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .gesture-detector-container {
      position: relative;
      width: min(96vw, 640px);
      height: min(72vh, 480px);
      max-width: 100vw;
      max-height: 100vh;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(226, 252, 245, 0.92));
    }

    .gesture-detector-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background-color: #f8fafc;
      filter: brightness(1.08);
      transition: filter 0.2s ease;
      transform-origin: center;
    }

    .gesture-detector-video.mirrored {
      transform: scaleX(-1);
    }

    .gesture-detector-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background-color: rgba(255, 255, 255, 0.08);
      mix-blend-mode: screen;
    }

    .gesture-detector-tap {
      position: absolute;
      bottom: 5%;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: linear-gradient(135deg, #10b981, #22d3ee);
      color: #0f172a;
      font-weight: 600;
      border-radius: 999px;
      box-shadow: 0 12px 24px rgba(14, 116, 144, 0.35);
      cursor: pointer;
      user-select: none;
      transition: transform 0.15s ease, box-shadow 0.2s ease;
    }

    .gesture-detector-tap:active {
      transform: translateX(-50%) scale(0.98);
    }

    .gesture-detector-tap.hidden {
      display: none;
    }
  `;
    document.head.appendChild(style);
  }
  function applyBaseStyles() {
    ensureStyleSheet();
    document.body.classList.add("gesture-detector");
    container.classList.add("gesture-detector-container");
    video.classList.add("gesture-detector-video");
    overlay.classList.add("gesture-detector-overlay");
    const shouldMirrorVideo = mirrorOverlay || facingMode === "user";
    video.classList.toggle("mirrored", shouldMirrorVideo);
  }
  window.fflate = { unzip, unzipSync };
  installMlp();
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: "telemetry", event: "mlp_ready" })
    );
  } catch (err2) {
    console.warn("Failed to signal 'mlp_ready' event:", err2);
  }
  var orchestrator = null;
  function initDom() {
    applyBaseStyles();
    container.appendChild(video);
    container.appendChild(overlay);
    document.body.appendChild(container);
    orchestrator = new GestureRecognitionOrchestrator(video, overlay);
    window.__gestureOrchestrator = orchestrator;
    orchestrator.initialize().catch((error) => {
      console.error("Failed to initialize gesture recognition:", error);
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "error",
          message: recognizerInitFailed + (error instanceof Error ? error.message : String(error))
        })
      );
    });
    const tap = document.createElement("div");
    tap.id = "tapToStart";
    tap.innerText = tapToStartText;
    if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
      tap.classList.add("hidden");
    }
    tap.addEventListener("click", async () => {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: "telemetry", event: "tap_start" })
        );
        if (orchestrator) {
          await orchestrator.start();
          tap.classList.add("hidden");
        }
      } catch (err2) {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: "error",
            message: cameraError + (err2 instanceof Error ? err2.message : String(err2))
          })
        );
      }
    });
    tap.classList.add("gesture-detector-tap");
    document.body.appendChild(tap);
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: "telemetry", event: "dom_ready" })
    );
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDom);
  } else {
    initDom();
  }
  if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
    orchestrator?.start().then(() => {
      document.getElementById("tapToStart")?.classList.add("hidden");
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: "telemetry", event: "tap_start_autostart" })
      );
    }).catch((err2) => {
      console.warn("Camera autostart failed:", err2);
      document.getElementById("tapToStart")?.classList.remove("hidden");
    });
  }
  var onVisibilityChange = () => {
    if (document.hidden) {
      orchestrator?.stop();
    } else {
      orchestrator?.start();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  async function cleanup() {
    try {
      orchestrator?.cancelClipCapture();
    } catch (err2) {
      console.warn("Failed to cancel clip capture during cleanup:", err2);
    }
    await orchestrator?.cleanup();
    orchestrator = null;
    window.__gestureOrchestrator = null;
    try {
      const tapEl = document.getElementById("tapToStart");
      if (tapEl) tapEl.remove();
    } catch (e) {
      console.warn("Failed to remove 'tapToStart' element:", e);
    }
    try {
      overlay.remove();
    } catch (e) {
      console.warn("Failed to remove 'overlay' element:", e);
    }
    try {
      container.remove();
    } catch (e) {
      console.warn("Failed to remove camera container:", e);
    }
    try {
      video.remove();
    } catch (e) {
      console.warn("Failed to remove 'video' element:", e);
    }
    document.body.classList.remove("gesture-detector");
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: "telemetry", event: "cleanup_done" })
    );
  }
  window.__cleanupGestureDetector = cleanup;
  window.__startClipCapture = (id) => {
    try {
      if (!orchestrator) {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: "clip_error", id, reason: "orchestrator_unavailable" })
        );
        return;
      }
      orchestrator.startClipCapture(id);
    } catch (error) {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "clip_error",
          id,
          reason: "start_clip_failed",
          details: error instanceof Error ? error.message : String(error)
        })
      );
    }
  };
  window.__stopClipCapture = (id) => {
    try {
      if (!orchestrator) {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: "clip_error", id, reason: "orchestrator_unavailable" })
        );
        return;
      }
      orchestrator.stopClipCapture(id);
    } catch (error) {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "clip_error",
          id,
          reason: "stop_clip_failed",
          details: error instanceof Error ? error.message : String(error)
        })
      );
    }
  };
  window.__getGestureSystemStatus = () => {
    return orchestrator?.getStatus() || { error: "Orchestrator not initialized" };
  };
})();
