import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { API_TOKEN, ANALYTICS_TELEMETRY_ENDPOINT } from '../constants';
import { fetchMlpModel, getCachedMlpModel } from '../services/dgsModelClient';
import { loadActiveProfileId } from '../storage';

interface Props {
  onGestureDetected: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
  ) => void;
  onError: (error: string) => void;
  onWebViewEvent?: (event: string) => void;
  facingMode?: 'user' | 'environment';
}

// Optional require to avoid crashing when native WebView module is not in the binary
let WebViewImpl: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewImpl = require('react-native-webview').WebView;
} catch (e) {
  WebViewImpl = null;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError, onWebViewEvent, facingMode = 'user' }) => {
  const webviewRef = useRef<any>(null);
  const mlpLoadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const pid = await loadActiveProfileId().catch(() => null);

        const inject = (b64: string) => {
          if (!b64 || !webviewRef.current) return;
          const safe = b64
            .replace(/\\/g, "\\\\")
            .replace(/`/g, "\``")
            .replace(/[\u2028\u2029]/g, '');
          webviewRef.current.injectJavaScript(
            `try{window.__setMlpModelB64 && window.__setMlpModelB64(\`${safe}\`);}catch(e){}`,
          );
          mlpLoadedRef.current = true;
        };

        const cached = await getCachedMlpModel(pid ?? undefined);
        if (cached) {
          inject(cached);
        }

        const latest = await fetchMlpModel(pid ?? undefined);
        if (latest && latest !== cached) {
          inject(latest);
        }
      } catch {}
    })();
  }, []);

  if (!WebViewImpl) {
    // Provide a non-crashing fallback with a clear developer hint
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text accessibilityRole="alert" style={{ textAlign: 'center' }}>
          WebView nicht verfügbar. Baue den Development-Client inklusive react-native-webview.
          {'\n'}Befehl: expo run:android (oder npm run android --prefix app)
        </Text>
      </View>
    );
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: #000; }
    video { position: absolute; inset: 0; width: 100vw; height: 100vh; object-fit: cover; transform: scaleX(-1); }
    canvas#overlay { position: absolute; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
    #tapToStart { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(0,0,0,0.4); font-family: sans-serif; }
    #tapToStart.hidden { display: none; }
  </style>
  <script>
    // Minimal NPZ + NPY parsing and MLP inference
    (function(){
      const loadFflate = () => new Promise((res, rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/fflate/umd/index.min.js'; s.onload=()=>res(null); s.onerror=()=>rej(new Error('fflate load failed')); document.head.appendChild(s); });
      let mlp = null; // { w1,b1,w2,b2,labels }
      let maxSize = 5*1024*1024; // 5MB safety
      function parseNPY(buf){
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        if (view.getUint8(0)!==0x93) throw new Error('bad npy');
        const ver= view.getUint8(2);
        const headerLen = ver===1? view.getUint16(8,true) : view.getUint32(8,true);
        const headerStart = ver===1?10:12;
        const headerBytes = buf.subarray(headerStart, headerStart+headerLen);
        const headerStr = new TextDecoder().decode(headerBytes);
        const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/);
        const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
        const shapeMatch = headerStr.match(/'shape':\s*\(([^\)]*)\)/);
        if(!dtypeMatch||!fortranMatch||!shapeMatch) throw new Error('npy header');
        const descr = dtypeMatch[1];
        const fortran = fortranMatch[1]==='True';
        const shapeStr = shapeMatch[1].trim();
        const shape = shapeStr.length? shapeStr.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!Number.isNaN(n)) : [1];
        const offset = headerStart+headerLen;
        const type = descr.slice(1);
        if(fortran) throw new Error('fortran not supported');
        const size = shape.reduce((a,b)=>a*(b||1),1);
        if(type==='f8'){ return { data:new Float64Array(buf.buffer, buf.byteOffset+offset, size), shape}; }
        if(type==='f4'){ return { data:new Float32Array(buf.buffer, buf.byteOffset+offset, size), shape}; }
        if(type==='i4'){ return { data:new Int32Array(buf.buffer, buf.byteOffset+offset, size), shape}; }
        if(type==='i2'){ return { data:new Int16Array(buf.buffer, buf.byteOffset+offset, size), shape}; }
        if(type==='u1'){ return { data:new Uint8Array(buf.buffer, buf.byteOffset+offset, size), shape}; }
        if(type.startsWith('U')){ const itemSize = parseInt(type.slice(1),10); const raw = new Uint16Array(buf.buffer, buf.byteOffset+offset, size*itemSize); const out=[]; for(let i=0;i<size;i++){ const start=i*itemSize; let s=''; for(let j=0;j<itemSize;j++){ const code=raw[start+j]; if(code===0) break; s+=String.fromCharCode(code);} out.push(s);} return { data: out, shape}; }
        throw new Error('dtype '+type);
      }
      async function loadMlpFromB64(b64){
        try{
          const bin = atob(b64);
          if(bin.length>maxSize) throw new Error('too big');
          const u8 = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
          if(!(window.fflate&&window.fflate.unzipSync)) await loadFflate();
          const files = window.fflate.unzipSync(u8);
          const entries = Object.keys(files);
          if(entries.length>32) throw new Error('too many entries');
          const map = {}; for(const name of entries){ map[name.replace(/^.*\\//,'')] = files[name]; }
          function npzFind(prefix){ const k = Object.keys(map).find(n=>n===prefix || n===prefix+'.npy'); return k? map[k]: undefined; }
          const w1b = npzFind('w1'); const b1b = npzFind('b1'); const w2b = npzFind('w2'); const b2b = npzFind('b2');
          if(!w1b||!b1b||!w2b||!b2b) throw new Error('missing weights');
          const w1 = parseNPY(w1b); const b1 = parseNPY(b1b); const w2 = parseNPY(w2b); const b2 = parseNPY(b2b);
          let labels = [];
          const lb = npzFind('labels'); if(lb){ const parsed = parseNPY(lb); labels = parsed.data; }
          mlp = { w1: w1.data, b1: b1.data, w2: w2.data, b2: b2.data, labels };
          return true;
        }catch(e){ console.warn('mlp load failed', e?.message||e); mlp=null; return false; }
      }
      function relu(x){ for(let i=0;i<x.length;i++) if(x[i]<0) x[i]=0; return x; }
      function softmax(x){ const max=Math.max(...x); let s=0; for(let i=0;i<x.length;i++){ x[i]=Math.exp(x[i]-max); s+=x[i]; } for(let i=0;i<x.length;i++){ x[i]/=s; } return x; }
      function dotMV(mat, rows, cols, vec){ const out=new Float64Array(rows); for(let r=0;r<rows;r++){ let sum=0; for(let c=0;c<cols;c++){ sum += mat[r*cols+c]*vec[c]; } out[r]=sum; } return out; }
      function addBias(vec, bias){ const out=new Float64Array(vec.length); for(let i=0;i<vec.length;i++){ out[i]=vec[i]+bias[i%bias.length]; } return out; }
      function normalizeLandmarks(all){
        const flat = [];
        function normHand(hand){ if(!hand||hand.length<21) return null; const wrist=hand[0]; const centered=hand.map(p=>[p[0]-wrist[0], p[1]-wrist[1], (p[2]||0)-(wrist[2]||0)]); let maxd=0; for(let i=0;i<centered.length;i++){ const d = Math.abs(centered[i][0])+Math.abs(centered[i][1]); if(d>maxd) maxd=d; } if(maxd===0) return null; for(let i=0;i<centered.length;i++){ centered[i][0]/=maxd; centered[i][1]/=maxd; } return centered; }
        const left = normHand(all[0]||[]);
        const right = normHand(all[1]||[]);
        if(!left) return null;
        const r = right || new Array(21).fill(0).map(()=>[0,0,0]);
        const both = left.concat(r);
        for(const p of both){ flat.push(p[0], p[1], p[2]||0); }
        return new Float64Array(flat);
      }
      function mlpPredict(all){ if(!mlp) return null; const x = normalizeLandmarks(all); if(!x) return null; const cols1 = x.length; const rows1 = (mlp.b1 as any).length || 128; const z1 = addBias(dotMV(new Float64Array(mlp.w1 as any), rows1, cols1, x), new Float64Array(mlp.b1 as any)); const a1 = relu(z1); const rows2 = (mlp.b2 as any).length || 1; const cols2 = a1.length; const z2 = addBias(dotMV(new Float64Array(mlp.w2 as any), rows2, cols2, a1), new Float64Array(mlp.b2 as any)); const probs = softmax(Array.from(z2)); let bestI=0, best=probs[0]; for(let i=1;i<probs.length;i++){ if(probs[i]>best){best=probs[i]; bestI=i;} } const label = (mlp.labels && (mlp.labels as any)[bestI]) || String(bestI); return { label, score: best }; }
      (window as any).__setMlpModelB64 = (b64)=>{ loadMlpFromB64(b64).then(()=>{ try{ window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type:'telemetry', event:'mlp_loaded'})); }catch{} }); };
      ;(window as any).__mlpPredict = mlpPredict;
    })();
    // Dynamically load MediaPipe Tasks Vision from CDN and wait until it's ready
    async function loadTasksVision() {
      // Resolve a pinned version dynamically if possible, otherwise fall back to generic.
      async function resolvePinnedBase() {
        const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
        for (const base of cdns) {
          try {
            const pkg = await fetch(base + '/@mediapipe/tasks-vision/package.json', { method: 'GET' });
            if (pkg.ok) {
              const json = await pkg.json().catch(()=>null);
              const v = json?.version;
              if (typeof v === 'string' && v.length) {
                return { base, version: v };
              }
            }
          } catch {}
        }
        return null;
      }

      function tryLoadScript(src) {
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load script: ' + src));
          document.head.appendChild(s);
        });
      }

      const haveUMD = () => (window.fileset_resolver && window.fileset_resolver.FilesetResolver) && (window.vision && window.vision.GestureRecognizer);

      // Compute preferred URLs
      const pinned = await resolvePinnedBase();
      const candidates = [];
      if (pinned) {
        candidates.push({
          umd: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.js',
          esm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.mjs',
          wasm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/wasm',
        });
      }
      // Generic latest as fallback
      candidates.push({
        umd: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js',
        esm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs',
        wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
      });
      candidates.push({
        umd: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.js',
        esm: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs',
        wasm: 'https://unpkg.com/@mediapipe/tasks-vision/wasm',
      });

      let lastError = null;
      for (const c of candidates) {
        try {
          // Try UMD first
          if (!haveUMD()) {
            await tryLoadScript(c.umd);
          }
          if (haveUMD()) {
            return {
              FilesetResolver: window.fileset_resolver.FilesetResolver,
              GestureRecognizer: window.vision.GestureRecognizer,
              wasmBase: c.wasm,
            };
          }
          // Try ESM next
          try {
            const mod = await import(/* @vite-ignore */ c.esm);
            if (mod?.FilesetResolver && mod?.GestureRecognizer) {
              return { FilesetResolver: mod.FilesetResolver, GestureRecognizer: mod.GestureRecognizer, wasmBase: c.wasm };
            }
          } catch (e) { lastError = e; }
        } catch (e) { lastError = e; }
      }
      throw new Error('Tasks Vision globals not available' + (lastError ? (': ' + (lastError.message||lastError)) : ''));
    }
    let gestureRecognizer;
    let runningMode = "VIDEO";
    const video = document.createElement('video');
    const overlay = document.createElement('canvas');
    overlay.id = 'overlay';
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(video);
      document.body.appendChild(overlay);
      const tap = document.createElement('div');
      tap.id = 'tapToStart';
      tap.innerText = 'Tippe, um die Kamera zu starten';
      tap.addEventListener('click', async () => {
        try { await startCamera(); tap.classList.add('hidden'); window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type:'telemetry', event:'tap_start' })); } catch {}
      });
      document.body.appendChild(tap);
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'dom_ready' }));
    });

    async function createGestureRecognizer() {
      try {
        const visionStart = performance.now();
        const { FilesetResolver, GestureRecognizer, wasmBase } = await loadTasksVision();
        const vision = await FilesetResolver.forVisionTasks(wasmBase || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode,
          numHands: 2,
        });
        const initMs = Math.round(performance.now() - visionStart);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'recognizer_init', ms: initMs }));
        // Start prediction loop after recognizer is created and video is loaded
        video.addEventListener('loadeddata', predictWebcam);
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Recognizer init failed: ' + (e?.message || e) }));
      }
    }

    let lastVideoTime = -1; // Added for performance optimization
    let frameCount = 0;
    function predictWebcam() {
      try {
        if (gestureRecognizer && video.currentTime > 0 && !video.paused && !video.ended) {
          if (lastVideoTime !== video.currentTime) { // Only process if video frame has changed
            lastVideoTime = video.currentTime;
            const start = performance.now();
            const results = gestureRecognizer.recognizeForVideo(video, start);
            const frameLatency = Math.round(performance.now() - start);
            frameCount++;
            if (frameCount % 30 === 0) {
              window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'frame_latency', ms: frameLatency }));
            }
            const allLandmarks = (results?.landmarks || []).map(hand =>
              hand.map(lm => [lm.x, lm.y, lm.z ?? 0])
            );
            let outGesture = null;
            let outScore = 0;
            const perHand = [];
            if (results?.gestures?.length) {
              for (let i=0; i<results.gestures.length; i++) {
                const handGestures = results.gestures[i] || [];
                const top = handGestures?.[0];
                const handed = (results?.handednesses?.[i]?.[0]?.categoryName) || 'unknown';
                if (top) {
                  perHand.push({ hand: handed, label: top.categoryName, score: top.score });
                  if (top.score > outScore) {
                    outGesture = top.categoryName;
                    outScore = top.score;
                  }
                }
              }
              if (perHand.length >= 2) {
                const left = perHand.find(h => /left/i.test(h.hand)) || perHand[0];
                const right = perHand.find(h => /right/i.test(h.hand)) || perHand[1];
                if (left && right) {
                  outGesture = left.label + '+' + right.label;
                  outScore = Math.min(left.score, right.score);
                }
              }
            }
            // ** MLP Gesture Prediction **
            if ((window as any).__mlpPredict) {
              const mlpResult = (window as any).__mlpPredict(allLandmarks);
              if (mlpResult && mlpResult.score > 0.6) {
                outGesture = mlpResult.label;
                outScore = mlpResult.score;
              }
            }
            // Custom gesture logic (preserved for single-hand fallback)
            const firstHand = allLandmarks[0] || [];
            if ((!outGesture || outScore < 0.5) && firstHand.length === 21) {
              const thumbUp = firstHand[4][1] < firstHand[2][1];
              const indexUp = firstHand[8][1] < firstHand[6][1];
              const middleUp = firstHand[12][1] < firstHand[10][1];
              const ringUp = firstHand[16][1] < firstHand[14][1];
              const pinkyUp = firstHand[20][1] < firstHand[18][1];
              const allUp = indexUp && middleUp && ringUp && pinkyUp;
              const noneUp = !indexUp && !middleUp && !ringUp && !pinkyUp;
              if (thumbUp && !indexUp && !middleUp) {
                outGesture = 'thumbs_up';
                outScore = 0.8;
              } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
                outGesture = 'point';
                outScore = 0.7;
              } else if (allUp) {
                outGesture = 'open_palm';
                outScore = 0.6;
              } else if (noneUp) {
                outGesture = 'fist';
                outScore = 0.6;
              }
            }
            // Draw overlay landmarks
            try {
              const w = video.clientWidth || window.innerWidth;
              const h = video.clientHeight || window.innerHeight;
              if (overlay.width !== w || overlay.height !== h) {
                overlay.width = w; overlay.height = h;
              }
              const ctx = overlay.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, overlay.width, overlay.height);
                ctx.save();
                // Mirror horizontally to match video
                ctx.scale(-1, 1);
                ctx.translate(-overlay.width, 0);
                const HAND_CONNECTIONS = [
                  [0,1],[1,2],[2,3],[3,4],
                  [0,5],[5,6],[6,7],[7,8],
                  [5,9],[9,10],[10,11],[11,12],
                  [9,13],[13,14],[14,15],[15,16],
                  [13,17],[17,18],[18,19],[19,20],
                  [0,17]
                ];
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
                ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';
                for (const hand of (results?.landmarks || [])) {
                  // connectors
                  ctx.beginPath();
                  for (const [a,b] of HAND_CONNECTIONS) {
                    const pa = hand[a]; const pb = hand[b];
                    if (!pa || !pb) continue;
                    ctx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
                    ctx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
                  }
                  ctx.stroke();
                  // points
                  for (const lm of hand) {
                    ctx.beginPath();
                    ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 4, 0, Math.PI*2);
                    ctx.fill();
                  }
                }
                ctx.restore();
              }
            } catch {}

              if (allLandmarks.length) {
                window.ReactNativeWebView?.postMessage?.(
                  JSON.stringify({
                    type: 'gesture',
                    gesture: outGesture || null,
                    confidence: outScore,
                    landmarks: allLandmarks,
                    hands: perHand,
                  }),
                );
              }
          }
        }
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: 'Prediction error: ' + (e?.message || e) }));
      }
      window.requestAnimationFrame(predictWebcam);
    }

    // Note: server-based fallback removed; on-device recognition only

    function resizeOverlay() {
      try {
        const w = video.clientWidth || window.innerWidth;
        const h = video.clientHeight || window.innerHeight;
        if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
      } catch {}
    }

    async function startCamera() { // Renamed from start() for clarity
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: '${facingMode}', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = stream;
        try { video.muted = true; await video.play(); resizeOverlay(); } catch {}
        const tracks = stream.getVideoTracks();
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'camera_started', tracks: tracks.map(t=>t.label) }));
        // createGestureRecognizer will add the loadeddata listener
      } catch (err) {
        const msg = (err && (err.name+': '+err.message)) || String(err);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Camera error: ' + msg }));
      }
    }

    // Start camera and then create recognizer
    startCamera();
    createGestureRecognizer();
    window.addEventListener('resize', ()=>{ try { resizeOverlay(); } catch {} });
  </script>
</head>
<body></body>
</html>`;

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'gesture') {
        onGestureDetected(data.gesture, data.confidence, data.landmarks);
      } else if (data.type === 'error') {
        onError(data.message);
      } else if (data.type === 'warn') {
        // Optionally forward warning to analytics if needed
      } else if (data.type === 'telemetry') {
        try { onWebViewEvent && onWebViewEvent(String(data.event || '')); } catch {}
        try {
          await fetch(ANALYTICS_TELEMETRY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_TOKEN}` },
            body: JSON.stringify({
              latencyMs: typeof data.ms === 'number' ? data.ms : 0,
              timestamp: Date.now(),
              event: data.event || 'unknown',
              source: 'webview-gesture-detector',
            }),
          });
        } catch {
          // ignore telemetry failures
        }
      }
    } catch (error) {
      onError('Fehler beim Verarbeiten der Gestendaten');
    }
  };

  return (
    <View style={styles.container}>
      <WebViewImpl
        ref={webviewRef}
        source={{ html: htmlContent, baseUrl: 'https://camera.local' }}
        style={styles.webview}
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
        // On Android, auto-grant media capture permissions if app holds CAMERA
        mediaCapturePermissionGrantType={'grant'}
        androidLayerType={'hardware'}
        mixedContentMode={'always'}
        onPermissionRequest={(event: any) => {
          try {
            // Grant all requested resources (VIDEO_CAPTURE/AUDIO_CAPTURE)
            event.nativeEvent.grant(event.nativeEvent.resources);
          } catch {}
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
